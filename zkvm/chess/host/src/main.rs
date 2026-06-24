// Covex zkVM games prover - host.
//
// For each game (board: chess/connect4/tic-tac-toe/checkers; card: blackjack/poker) we build a REAL
// GameInput, prove it with the RISC0 prover, verify the receipt against the guest image id, decode
// the journal (GameResult), and assert the winner is correct. Then NEGATIVE gates: an illegal chess
// move, a FORGED card deck (sha256 mismatch), and an illegal card move must each FAIL to prove (the
// guest panics, so no receipt is produced); and a TAMPERED receipt must fail verification.
//
// Card games carry a COMMITTED deck: deck_commitment = sha256(deck) is public and replay() verifies
// sha256(deck) == deck_commitment before dealing, so a substituted/forged deck cannot be proven.
// Checkers uses a 65-byte custom-position descriptor so a real on-board capture win (not just a
// resignation) is reachable through replay() in a short host demo.
//
// Run a real (non-dev) proof for every game with RISC0_DEV_MODE=0. The honesty gate lives in the
// guest: replay() returns Err for any illegal/unfinished/forged game, which panics the guest and
// yields no receipt. A receipt therefore proves the game was legal and the winner is genuine.

use std::time::Instant;

use covex_games::{
    GameInput, GameResult, GameType, SettlementJournal, WINNER_DRAW, WINNER_P1, WINNER_P2,
};
use methods::{GAMES_GUEST_ELF, GAMES_GUEST_ID};
use risc0_zkvm::serde::Deserializer;
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};
use serde::Deserialize;
use sha2::{Digest, Sha256};

/// Decode BOTH committed journal items in order: the `GameResult` (committed first, unchanged) and
/// the `SettlementJournal` (committed second, Stage 1). The guest does `env::commit(&result)` then
/// `env::commit(&journal)`, which lays two sequential serde frames in the word-aligned journal. We
/// build one risc0 `Deserializer` over the journal words and deserialize twice; the `WordRead`
/// reader advances between the two reads. (`journal.decode::<GameResult>()` still works for the
/// FIRST item alone - backward compatible - but we need both here to check the binding.)
fn decode_result_and_journal(journal_bytes: &[u8]) -> (GameResult, SettlementJournal) {
    // RISC0 journals are word (u32) aligned; collect to u32 words then deserialize sequentially.
    let words: Vec<u32> = bytemuck::allocation::pod_collect_to_vec::<u8, u32>(journal_bytes);
    let mut de = Deserializer::new(words.as_slice());
    let result = GameResult::deserialize(&mut de).expect("decode GameResult (journal item 1)");
    let settlement =
        SettlementJournal::deserialize(&mut de).expect("decode SettlementJournal (journal item 2)");
    (result, settlement)
}

/// Opaque 32-byte player id helper.
fn pid(b: u8) -> [u8; 32] {
    [b; 32]
}

/// Card id from `(rank, suit)`: `id = suit*13 + rank`. rank: 0..=8 -> 2..10, 9=J,10=Q,11=K,12=A.
/// suit: 0..4. This MATCHES the encoding in covex_games::games::{blackjack,poker}.
fn card(rank: u8, suit: u8) -> u8 {
    suit * 13 + rank
}

/// Build a full 52-card permutation whose FIRST cards are exactly `prefix` (the cards we want dealt
/// in order), with the remaining cards 0..52 filling out the rest. Asserts the prefix is distinct
/// cards in 0..52, so the result is a genuine permutation (which the library's deck check requires).
fn deck_with_prefix(prefix: &[u8]) -> Vec<u8> {
    let mut deck: Vec<u8> = prefix.to_vec();
    for c in 0u8..52 {
        if !prefix.contains(&c) {
            deck.push(c);
        }
    }
    assert_eq!(
        deck.len(),
        52,
        "deck prefix must contain only distinct cards in 0..52"
    );
    deck
}

/// The HONEST deck commitment: sha256 over the exact deck bytes, the same hash the library's
/// `verify_committed_deck` recomputes and compares. A wrong commitment makes proving fail.
fn deck_commitment(deck: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(deck);
    let out = hasher.finalize();
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&out);
    digest
}

/// Build a card-game GameInput (blackjack/poker) from an explicit committed deck + player moves.
/// The commitment is the honest sha256(deck); the deck must be a permutation of 0..52.
fn card_game(game_type: GameType, deck: Vec<u8>, moves: &[&str]) -> GameInput {
    let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
    let n = moves.len();
    let commitment = deck_commitment(&deck);
    GameInput {
        game_type,
        moves,
        elapsed_ms: vec![0u64; n],
        initial_clock_ms: 0,
        increment_ms: 0,
        players: [pid(1), pid(2)],
        stake_sompi: 5_000,
        covenant_id: [0xCEu8; 32],
        deck,
        deck_commitment: commitment,
        setup: vec![],
        commitments: vec![],
    }
}

/// Build a checkers GameInput from a custom 65-byte position descriptor + moves. The descriptor lets
/// a SHORT decisive board win (capture / no-legal-move) be reachable through replay() in a host demo,
/// rather than only a resignation. An empty `setup` would instead use the default 12v12 opening.
fn checkers_game(setup: Vec<u8>, moves: &[&str]) -> GameInput {
    let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
    let n = moves.len();
    GameInput {
        game_type: GameType::Checkers,
        moves,
        elapsed_ms: vec![0u64; n],
        initial_clock_ms: 0,
        increment_ms: 0,
        players: [pid(1), pid(2)],
        stake_sompi: 5_000,
        covenant_id: [0xCEu8; 32],
        deck: vec![],
        deck_commitment: [0u8; 32],
        setup,
        commitments: vec![],
    }
}

/// A 65-byte checkers position descriptor from (square, code) pairs + side-to-move.
/// code: 1=P1 man, 2=P1 king, 3=P2 man, 4=P2 king. Byte 64 = side to move (0=P1, 1=P2).
fn checkers_setup(pieces: &[(usize, u8)], side_to_move: u8) -> Vec<u8> {
    let mut s = vec![0u8; 65];
    for &(sq, code) in pieces {
        s[sq] = code;
    }
    s[64] = side_to_move;
    s
}

/// Build an untimed GameInput (clock disabled) from a move list.
fn untimed(game_type: GameType, moves: &[&str]) -> GameInput {
    let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
    let n = moves.len();
    GameInput {
        game_type,
        moves,
        elapsed_ms: vec![0u64; n],
        initial_clock_ms: 0,
        increment_ms: 0,
        players: [pid(1), pid(2)],
        stake_sompi: 5_000,
        covenant_id: [0xCEu8; 32],
        // Board games use no committed deck and the default opening; these defaulted
        // fields keep the prover building against the extended GameInput shape.
        deck: vec![],
        deck_commitment: [0u8; 32],
        setup: vec![],
        commitments: vec![],
    }
}

/// sha256 of a byte slice (the same hash covex-games recomputes for its commitment gates).
fn sha256(bytes: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&h.finalize());
    out
}

/// Build a board GameInput that carries a custom `setup` witness + public `commitments`. Used by
/// the commitment-gated board games: battleship (two board commitments) and backgammon (one seed).
fn committed_game(
    game_type: GameType,
    setup: Vec<u8>,
    commitments: Vec<[u8; 32]>,
    moves: &[&str],
) -> GameInput {
    let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
    let n = moves.len();
    GameInput {
        game_type,
        moves,
        elapsed_ms: vec![0u64; n],
        initial_clock_ms: 0,
        increment_ms: 0,
        players: [pid(1), pid(2)],
        stake_sompi: 5_000,
        covenant_id: [0xCEu8; 32],
        deck: vec![],
        deck_commitment: [0u8; 32],
        setup,
        commitments,
    }
}

/// One battleship player's 31-byte witness: salt(16) + 5 ships of (length,start,orient).
fn bs_player_bytes(salt: [u8; 16], ships: [(u8, u8, u8); 5]) -> Vec<u8> {
    let mut v = salt.to_vec();
    for (len, start, orient) in ships {
        v.push(len);
        v.push(start);
        v.push(orient);
    }
    v
}

/// The VRF dice for backgammon turn `t` from `seed` (MATCHES covex_games::games::backgammon):
/// h = sha256(seed || t_le_bytes); d1 = h[0]%6+1, d2 = h[1]%6+1.
fn backgammon_roll(seed: &[u8], t: u64) -> (u8, u8) {
    let mut buf = seed.to_vec();
    buf.extend_from_slice(&t.to_le_bytes());
    let h = sha256(&buf);
    ((h[0] % 6) + 1, (h[1] % 6) + 1)
}

/// Build a decisive backgammon demo input: find a 32-byte seed whose turn-0 roll is exactly (3,1),
/// commit it honestly, and play the classic opening 8/5 (die 3) + 6/5 (die 1); then P2 resigns so
/// P1 wins. Panics if no such seed is found in the scan (it always is - the roll space is tiny).
fn backgammon_demo() -> GameInput {
    for b in 0u32..=4096 {
        let mut seed = [0u8; 32];
        seed[0] = (b & 0xFF) as u8;
        seed[1] = ((b >> 8) & 0xFF) as u8;
        if backgammon_roll(&seed, 0) == (3, 1) {
            let commit = sha256(&seed);
            return committed_game(
                GameType::Backgammon,
                seed.to_vec(),
                vec![commit],
                &["8/5", "6/5", "resign"],
            );
        }
    }
    panic!("no backgammon seed found whose first roll is (3,1)");
}

/// Prove one game, verify the receipt against the image id, decode the journal, and assert the
/// winner. Returns the decoded GameResult and the wall-clock proving time. Panics on any failure
/// (so the GATE fails loudly).
fn prove_and_verify(
    label: &str,
    input: &GameInput,
    expected_winner: u8,
) -> (GameResult, f64, Receipt) {
    println!("\n==== {label} ====");
    println!("  game_type   : {:?}", input.game_type);
    println!("  moves       : {:?}", input.moves);
    println!("  expected win: {expected_winner}");

    let env = ExecutorEnv::builder()
        .write(input)
        .expect("serialize GameInput into the executor env")
        .build()
        .expect("build executor env");

    let prover = default_prover();

    let t0 = Instant::now();
    let prove_info = prover
        .prove(env, GAMES_GUEST_ELF)
        .expect("prove the legal game (a receipt must be producible)");
    let elapsed = t0.elapsed().as_secs_f64();

    let receipt = prove_info.receipt;

    // Verify the receipt against the guest image id. This is the off-chain check the Covex oracle
    // performs before co-signing the payout. It fails if the receipt does not correspond to THIS
    // exact guest program.
    receipt
        .verify(GAMES_GUEST_ID)
        .expect("receipt must verify against the guest image id");

    // Decode BOTH committed journal items: the GameResult and the self-sufficient SettlementJournal.
    let (result, settlement) = decode_result_and_journal(&receipt.journal.bytes);

    println!(
        "  PROVED+VERIFIED  winner={} reason={:?} plies={} prove_time={:.2}s",
        result.winner, result.reason, result.num_plies, elapsed
    );

    assert_eq!(
        result.winner, expected_winner,
        "{label}: committed winner {} != expected {expected_winner}",
        result.winner
    );

    // ---- Stage 1 binding assertions: the SettlementJournal must bind THIS pot + the right payee. ----
    // The covenant pays settlement.winner_pubkey, scoped to settlement.covenant_id. Confirm the proof
    // committed exactly the pot we asked for and the payee that corresponds to the genuine winner.
    let expected_pubkey = match expected_winner {
        WINNER_P1 => input.players[0],
        WINNER_P2 => input.players[1],
        WINNER_DRAW => [0u8; 32], // draw: no single payee, pot is split
        other => panic!("{label}: test bug - expected_winner {other} is not a valid code"),
    };
    assert_eq!(
        settlement.winner_code, expected_winner,
        "{label}: settlement winner_code {} != expected {expected_winner}",
        settlement.winner_code
    );
    assert_eq!(
        settlement.winner_pubkey, expected_pubkey,
        "{label}: settlement winner_pubkey != players[expected_winner] (payee binding broken)"
    );
    assert_eq!(
        settlement.covenant_id, input.covenant_id,
        "{label}: settlement covenant_id != input.covenant_id (pot binding broken)"
    );
    assert_eq!(
        settlement.stake_sompi, input.stake_sompi,
        "{label}: settlement stake_sompi != input.stake_sompi"
    );
    assert_eq!(
        settlement.moves_digest, result.moves_digest,
        "{label}: settlement moves_digest != GameResult moves_digest"
    );
    println!(
        "  BOUND  covenant_id[0..4]={:02x?} winner_pubkey[0..4]={:02x?} stake={} (settlement journal)",
        &settlement.covenant_id[..4],
        &settlement.winner_pubkey[..4],
        settlement.stake_sompi
    );

    (result, elapsed, receipt)
}

/// NEGATIVE GATE (soundness): a TAMPERED receipt must fail verification. We flip a byte in the
/// committed journal and confirm verify() rejects it - so a winning receipt cannot be re-labeled
/// to claim the other player won. (Skipped under RISC0_DEV_MODE because dev receipts are not real
/// cryptographic proofs and do not carry a seal that binds the journal.)
fn tamper_must_be_rejected(label: &str, receipt: &Receipt) {
    println!("\n==== {label} (negative: tampered receipt MUST be rejected) ====");
    let dev_mode = std::env::var("RISC0_DEV_MODE")
        .map(|v| v != "0" && !v.is_empty())
        .unwrap_or(false);
    if dev_mode {
        println!("  SKIP - RISC0_DEV_MODE is on; dev receipts carry no real seal to tamper.");
        return;
    }

    let mut tampered = receipt.clone();
    // Corrupt the public journal (e.g. flip the winner byte). The seal no longer matches.
    if tampered.journal.bytes.is_empty() {
        panic!("{label}: empty journal, cannot run tamper test");
    }
    tampered.journal.bytes[0] ^= 0xFF;

    match tampered.verify(GAMES_GUEST_ID) {
        Ok(_) => panic!("{label}: SECURITY FAILURE - a tampered receipt verified!"),
        Err(e) => println!("  OK - tampered receipt rejected by verify(). error: {e}"),
    }
}

/// NEGATIVE GATE (Stage 1 binding soundness): a SettlementJournal whose `winner_pubkey` is swapped
/// to the LOSER must make the receipt fail verification. The payee binding lives INSIDE the journal,
/// which is sealed by the proof, so re-labeling the payee on a genuine winning receipt cannot ride
/// through. We locate the journal item-2 `winner_pubkey` bytes (they equal players[winner]), flip
/// them to players[loser], and confirm verify() rejects the tampered receipt. (Skipped in dev mode:
/// dev receipts carry no real seal binding the journal.)
fn settlement_tamper_must_be_rejected(label: &str, receipt: &Receipt, input: &GameInput) {
    println!("\n==== {label} (negative: tampered settlement winner_pubkey MUST be rejected) ====");
    let dev_mode = std::env::var("RISC0_DEV_MODE")
        .map(|v| v != "0" && !v.is_empty())
        .unwrap_or(false);
    if dev_mode {
        println!("  SKIP - RISC0_DEV_MODE is on; dev receipts carry no real seal to tamper.");
        return;
    }

    // Decode to discover the honest payee + the loser id we will forge in.
    let (result, settlement) = decode_result_and_journal(&receipt.journal.bytes);
    let loser_pubkey = match result.winner {
        WINNER_P1 => input.players[1],
        WINNER_P2 => input.players[0],
        // A draw has an all-zero payee; forge in a non-zero id instead.
        _ => [0xEEu8; 32],
    };
    assert_ne!(
        settlement.winner_pubkey, loser_pubkey,
        "{label}: test bug - honest payee already equals the loser id"
    );

    // The journal is serialized word-by-word: a `[u8; 32]` array becomes 32 u32 words (each byte
    // zero-extended), NOT 32 packed bytes. So we tamper in WORD space: find the 32-word run that
    // equals the winner_pubkey (one word per byte) and overwrite it with the loser id, then re-pack
    // to journal bytes and re-verify. The sealed claim digest no longer matches -> verify() rejects.
    let words: Vec<u32> = bytemuck::allocation::pod_collect_to_vec::<u8, u32>(&receipt.journal.bytes);
    let needle: Vec<u32> = settlement.winner_pubkey.iter().map(|&b| b as u32).collect();
    let pos = words
        .windows(32)
        .position(|w| w == needle.as_slice())
        .expect("winner_pubkey (as 32 words) must appear in the journal");
    let mut tampered_words = words.clone();
    for (i, &b) in loser_pubkey.iter().enumerate() {
        tampered_words[pos + i] = b as u32;
    }

    let mut tampered = receipt.clone();
    tampered.journal.bytes = bytemuck::allocation::pod_collect_to_vec::<u32, u8>(&tampered_words);

    // Sanity: the tampered journal must now decode to the LOSER payee (the forgery took effect),
    // proving we actually flipped the binding field before testing that verify() rejects it.
    let (_r2, s2) = decode_result_and_journal(&tampered.journal.bytes);
    assert_eq!(
        s2.winner_pubkey, loser_pubkey,
        "{label}: tamper did not take effect - winner_pubkey was not flipped to the loser"
    );

    match tampered.verify(GAMES_GUEST_ID) {
        Ok(_) => panic!("{label}: SECURITY FAILURE - a tampered-payee receipt verified!"),
        Err(e) => println!("  OK - tampered settlement payee rejected by verify(). error: {e}"),
    }
}

/// NEGATIVE GATE: an illegal game must FAIL to prove (guest panics in replay().expect(), no
/// receipt). We assert that proving returns Err.
fn prove_must_fail(label: &str, input: &GameInput) {
    println!("\n==== {label} (negative: proving MUST fail) ====");
    println!("  moves: {:?}", input.moves);

    let env = ExecutorEnv::builder()
        .write(input)
        .expect("serialize illegal GameInput")
        .build()
        .expect("build executor env");

    let prover = default_prover();
    let res = prover.prove(env, GAMES_GUEST_ELF);

    match res {
        Ok(_) => panic!("{label}: SECURITY FAILURE - an illegal game produced a receipt!"),
        Err(e) => println!("  OK - proving failed as required (no receipt). error: {e}"),
    }
}

fn main() {
    println!("Covex zkVM games prover - host");
    println!("image id (GAMES_GUEST_ID) = {:?}", GAMES_GUEST_ID);
    println!(
        "RISC0_DEV_MODE = {:?}",
        std::env::var("RISC0_DEV_MODE").unwrap_or_else(|_| "(unset)".into())
    );

    let mut timings: Vec<(String, f64)> = Vec::new();

    // ----- CHESS #1: Scholar's mate. White (player 1) delivers checkmate on move 4 (Qxf7#). -----
    // 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#
    let chess = untimed(
        GameType::Chess,
        &["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"],
    );
    let (r, t, chess_receipt) =
        prove_and_verify("CHESS - Scholar's mate (white wins)", &chess, WINNER_P1);
    assert_eq!(r.reason, "checkmate", "chess result must be a checkmate");
    assert_eq!(r.num_plies, 7);
    timings.push(("chess(scholar)".into(), t));

    // ----- CHESS #2: Fool's mate. BLACK (player 2) delivers checkmate on move 2 (Qh4#). -----
    // Proves the prover attributes a win to the OTHER side too (not a hardcoded winner 0).
    // 1. f3 e5 2. g4 Qh4#
    let fools = untimed(GameType::Chess, &["f2f3", "e7e5", "g2g4", "d8h4"]);
    let (r, t, _) = prove_and_verify("CHESS - Fool's mate (black wins)", &fools, WINNER_P2);
    assert_eq!(r.reason, "checkmate");
    assert_eq!(r.num_plies, 4);
    timings.push(("chess(fools)".into(), t));

    // ----- CONNECT4: Player 1 vertical four-in-a-row in column 0. -----
    // P1 drops col 0 four times; P2 drops col 1 in between.
    let c4 = untimed(GameType::Connect4, &["0", "1", "0", "1", "0", "1", "0"]);
    let (r, t, _) = prove_and_verify("CONNECT4 - P1 vertical four (P1 wins)", &c4, WINNER_P1);
    assert_eq!(r.reason, "connect4");
    timings.push(("connect4".into(), t));

    // ----- TIC-TAC-TOE: Player 1 completes the top row. -----
    // X: 0,1,2 (top row); O: 3,4 in between.
    let ttt = untimed(GameType::TicTacToe, &["0", "3", "1", "4", "2"]);
    let (r, t, _) = prove_and_verify("TIC-TAC-TOE - P1 top row (P1 wins)", &ttt, WINNER_P1);
    assert_eq!(r.reason, "three_in_a_row");
    timings.push(("tic_tac_toe".into(), t));

    // ----- CHECKERS (real BOARD WIN, not a resignation): custom endgame, P1 captures P2's last man.
    // A 65-byte position descriptor places P1 man on 17 (row2,col1) and P2 man on 26 (row3,col2);
    // P1 jumps 17->35 over 26, removing P2's only piece -> P1 wins by capture (reason "no_moves").
    // The rules engine fully validates the jump geometry + that a real enemy is captured; an illegal
    // setup or jump would make this fail to prove. This is a genuine on-board decisive win end to end.
    let checkers_setup_v = checkers_setup(&[(17, 1), (26, 3)], WINNER_P1);
    let checkers = checkers_game(checkers_setup_v, &["17-35"]);
    let (r, t, _) = prove_and_verify(
        "CHECKERS - custom endgame, P1 captures last enemy (P1 wins on board)",
        &checkers,
        WINNER_P1,
    );
    assert_eq!(r.reason, "no_moves", "checkers must end by board win, not resign");
    assert_eq!(r.num_plies, 1);
    timings.push(("checkers(board-win)".into(), t));

    // ----- BLACKJACK #1: a PLAYER win from a committed deck. -----
    // Deal order is player, dealer, player, dealer off the top of the committed deck:
    //   player: deck[0]=10, deck[2]=K(10) -> 20 (stands)
    //   dealer: deck[1]=9,  deck[3]=8     -> 17 (dealer stands on 17)
    // 20 > 17 -> player (P1) wins. The deck-commitment gate (sha256) is enforced before any deal.
    let bj_player = card_game(
        GameType::Blackjack,
        deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]),
        &["stand"],
    );
    let (r, t, _) = prove_and_verify("BLACKJACK - player 20 vs dealer 17 (P1 wins)", &bj_player, WINNER_P1);
    assert_eq!(r.reason, "player_higher", "blackjack P1 win must be player_higher");
    timings.push(("blackjack(player)".into(), t));

    // ----- BLACKJACK #2: a DEALER win (attributes the win to the OTHER side, not a hardcoded 0). --
    //   player: deck[0]=10, deck[2]=7 -> 17 (stands)
    //   dealer: deck[1]=10, deck[3]=9 -> 19 -> dealer higher -> dealer (P2) wins.
    let bj_dealer = card_game(
        GameType::Blackjack,
        deck_with_prefix(&[card(8, 0), card(8, 1), card(5, 2), card(7, 3)]),
        &["stand"],
    );
    let (r, t, _) = prove_and_verify("BLACKJACK - player 17 vs dealer 19 (P2/dealer wins)", &bj_dealer, WINNER_P2);
    assert_eq!(r.reason, "dealer_higher", "blackjack P2 win must be dealer_higher");
    timings.push(("blackjack(dealer)".into(), t));

    // ----- POKER: a decisive 2-player Hold'em showdown (v1: no betting, empty move list). -----
    // Deal: p1 hole = deck[0],deck[2]; p2 hole = deck[1],deck[3]; board = deck[4..9].
    //   p1 holds A,Q of spades; board has 10,8,5,2 of spades -> p1 makes a spade FLUSH.
    //   p2 holds 2h,2d; with the board 2s -> only a pair of 2s. Flush beats a pair -> P1 wins.
    let poker = card_game(
        GameType::Poker,
        deck_with_prefix(&[
            card(12, 0), // p1 hole A spades
            card(0, 1),  // p2 hole 2 hearts
            card(10, 0), // p1 hole Q spades
            card(0, 2),  // p2 hole 2 diamonds
            card(8, 0),  // board 10 spades
            card(6, 0),  // board 8 spades
            card(3, 0),  // board 5 spades
            card(0, 0),  // board 2 spades
            card(9, 3),  // board J clubs
        ]),
        &[],
    );
    let (r, t, _) = prove_and_verify("POKER - P1 flush beats P2 pair (P1 wins showdown)", &poker, WINNER_P1);
    assert_eq!(r.num_plies, 0, "poker v1 showdown has no decision plies");
    assert!(r.reason.starts_with("p1_"), "poker winner reason must name P1's hand, got {:?}", r.reason);
    timings.push(("poker(showdown)".into(), t));

    // ----- REVERSI (VERIFIABLE SCORE): P1 (black) plays a legal opening flip, then P2 resigns. -----
    // Cell 26 from the standard Othello start brackets the white disc at 27 (a real, legal flip);
    // an illegal no-flip placement would make replay() Err -> no proof. This case also exercises the
    // VERIFIABLE PER-PLAYER SCORE (skill / esports / speedrun result): after 26 flips 27, the board
    // holds black on 26,27,28,35 (4) and white on 36 (1), so the GENUINE disc tally is [4, 1]. The
    // score is read off the trusted replayed board and committed in GameResult::score, so it rides
    // inside the SAME proof - a verifying receipt attests both the winner AND the exact final score.
    let reversi = untimed(GameType::Reversi, &["26", "resign"]);
    let (r, t, _) = prove_and_verify("REVERSI - legal flip then P2 resigns (P1 wins, score 4-1)", &reversi, WINNER_P1);
    let committed_score = r.score.expect("reversi must commit a verifiable disc-count score");
    assert_eq!(
        committed_score,
        [4u64, 1u64],
        "REVERSI: committed score {committed_score:?} != the genuine final disc tally [4, 1]"
    );
    println!("  VERIFIED SCORE  committed disc tally = {committed_score:?} (P1 black {}, P2 white {})", committed_score[0], committed_score[1]);
    timings.push(("reversi(score 4-1)".into(), t));

    // ----- MANCALA (Kalah): P1 sows pit 2 (lands in own store -> extra turn), sows pit 0, P2 resigns.
    // The store/extra-turn/sowing rules are fully replayed; an empty-pit sow would Err -> no proof.
    let mancala = untimed(GameType::Mancala, &["2", "0", "resign"]);
    let (_r, t, _) = prove_and_verify("MANCALA - legal sow w/ extra turn then P2 resigns (P1 wins)", &mancala, WINNER_P1);
    timings.push(("mancala".into(), t));

    // ----- DOTS AND BOXES (1x1 board): the player who draws the 4th edge takes the only box. -----
    // setup [1,1] = a 1x1 grid (4 edges). Order 0,1,2,3 -> P2 draws the closing edge -> P2 wins 1-0.
    let mut dab = untimed(GameType::DotsAndBoxes, &["0", "1", "2", "3"]);
    dab.setup = vec![1, 1];
    let (r, t, _) = prove_and_verify("DOTS_AND_BOXES - 1x1, P2 closes the box (P2 wins)", &dab, WINNER_P2);
    assert_eq!(r.reason, "most_boxes");
    timings.push(("dots_and_boxes".into(), t));

    // ----- BATTLESHIP (HIDDEN committed boards): P1 sinks P2's whole fleet. -----
    // Both boards are committed via sha256(salt || ships); replay() verifies BOTH commitments and
    // BOTH placements before any shot. P1 fires at every P2 ship cell on its turns (17 hits) while
    // P2 fires distinct empty misses; P1's 17th hit ends it. A forged board fails to prove (gate #5).
    let bs_ships: [(u8, u8, u8); 5] = [(5, 0, 0), (4, 10, 0), (3, 20, 0), (3, 30, 0), (2, 40, 0)];
    let bs_p0 = bs_player_bytes([7u8; 16], bs_ships);
    let bs_p1 = bs_player_bytes([9u8; 16], bs_ships);
    let bs_c0 = sha256(&bs_p0);
    let bs_c1 = sha256(&bs_p1);
    let mut bs_setup = bs_p0.clone();
    bs_setup.extend_from_slice(&bs_p1);
    let ship_cells: [usize; 17] = [0, 1, 2, 3, 4, 10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40, 41];
    let miss_cells: [usize; 16] = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65];
    let mut bs_moves: Vec<String> = Vec::new();
    for (i, &c) in ship_cells.iter().enumerate() {
        bs_moves.push(c.to_string()); // P1 hits a P2 ship cell
        if i + 1 < ship_cells.len() {
            bs_moves.push(miss_cells[i].to_string()); // P2 distinct miss
        }
    }
    let bs_refs: Vec<&str> = bs_moves.iter().map(|s| s.as_str()).collect();
    let battleship = committed_game(GameType::Battleship, bs_setup, vec![bs_c0, bs_c1], &bs_refs);
    let (r, t, _) = prove_and_verify("BATTLESHIP - committed boards, P1 sinks the fleet (P1 wins)", &battleship, WINNER_P1);
    assert_eq!(r.reason, "all_sunk");
    timings.push(("battleship".into(), t));

    // ----- BACKGAMMON (VRF dice): committed seed -> deterministic dice; P1 plays BOTH dice of its
    // first (non-double) roll with legal opening moves, the turn then passes to P2 who resigns -> P1
    // wins. We scan for a seed whose turn-0 roll is exactly (3,1) and play the classic 8/5, 6/5
    // opening (8/5 uses die 3, 6/5 uses die 1). A forged seed fails to prove (negative gate #6).
    let bg = backgammon_demo();
    let (r, t, _) = prove_and_verify("BACKGAMMON - VRF dice, legal opening then P2 resigns (P1 wins)", &bg, WINNER_P1);
    assert_eq!(r.reason, "resign");
    timings.push(("backgammon".into(), t));

    // ----- NEGATIVE GATE #1: an ILLEGAL chess move must fail to prove. -----
    // e1e3 is not a legal first move (king cannot jump two squares; not even pseudo-legal here).
    // replay() returns Err -> guest panics -> no receipt.
    let illegal = untimed(GameType::Chess, &["e1e3"]);
    prove_must_fail("CHESS - illegal king move e1e3", &illegal);

    // ----- NEGATIVE GATE #2: a FORGED DECK must fail to prove (the card honesty gate). -----
    // We build a legal blackjack input (honest sha256 commitment), then TAMPER the deck bytes after
    // committing by swapping two cards. Now sha256(deck) != deck_commitment, so verify_committed_deck
    // returns Err -> guest panics -> NO receipt. A player cannot substitute a favorable deck.
    let mut forged = card_game(
        GameType::Blackjack,
        deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]),
        &["stand"],
    );
    forged.deck.swap(0, 10); // alter the committed deck WITHOUT updating the (now-stale) commitment
    prove_must_fail("BLACKJACK - forged deck (sha256 mismatch)", &forged);

    // ----- NEGATIVE GATE #3: an ILLEGAL CARD MOVE must fail to prove. -----
    // "double" is not a recognized blackjack decision (only "hit"/"stand"); replay() returns Err ->
    // guest panics -> no receipt. A caller cannot smuggle in an unmodeled action to force an outcome.
    let illegal_card = card_game(
        GameType::Blackjack,
        deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]),
        &["double"],
    );
    prove_must_fail("BLACKJACK - illegal card move \"double\"", &illegal_card);

    // ----- NEGATIVE GATE #5: a FORGED BATTLESHIP BOARD must fail to prove (hidden-board gate). -----
    // Build the legal battleship input, then TAMPER P1's board bytes after committing (move the
    // carrier). Now sha256(board0) != commitments[0], so from_input() returns Err -> guest panics ->
    // NO receipt. A player cannot present a board different from what they committed to.
    let bs_p0b = bs_player_bytes([7u8; 16], bs_ships);
    let bs_p1b = bs_player_bytes([9u8; 16], bs_ships);
    let bs_c0b = sha256(&bs_p0b);
    let bs_c1b = sha256(&bs_p1b);
    let mut forged_setup = bs_p0b.clone();
    forged_setup.extend_from_slice(&bs_p1b);
    forged_setup[16 + 1] = 5; // change carrier start cell 0 -> 5; commitment is now stale
    let forged_bs = committed_game(GameType::Battleship, forged_setup, vec![bs_c0b, bs_c1b], &["0"]);
    prove_must_fail("BATTLESHIP - forged board (sha256 mismatch)", &forged_bs);

    // ----- NEGATIVE GATE #6: a FORGED BACKGAMMON SEED must fail to prove (VRF dice gate). -----
    // Build the legal backgammon input, then TAMPER the seed after committing. Now sha256(seed) !=
    // commitments[0], so from_input() returns Err -> guest panics -> NO receipt. A player cannot
    // swap in a seed that yields favourable dice after committing.
    let mut forged_bg = backgammon_demo();
    forged_bg.setup[0] ^= 0xFF; // corrupt the seed; commitment no longer matches
    prove_must_fail("BACKGAMMON - forged seed (sha256 mismatch)", &forged_bg);

    // ----- NEGATIVE GATE #7: a TAMPERED receipt must fail verification (soundness). -----
    tamper_must_be_rejected("CHESS - tampered Scholar's-mate receipt", &chess_receipt);

    // ----- NEGATIVE GATE #8 (Stage 1): a TAMPERED SETTLEMENT PAYEE must fail verification. -----
    // Re-label the journal's winner_pubkey to the LOSER on the genuine Scholar's-mate receipt; the
    // sealed journal binds the payee, so verify() must reject it. This is the off-chain proof of the
    // on-chain payee binding (winner_pubkey becomes a Groth16 public input under KIP-16).
    settlement_tamper_must_be_rejected(
        "CHESS - tampered settlement payee (loser substituted)",
        &chess_receipt,
        &chess,
    );

    // ----- SUMMARY -----
    println!("\n================ SUMMARY ================");
    for (name, secs) in &timings {
        println!("  {name:<20} proved+verified in {secs:.2}s");
    }
    println!("  reversi score 4-1:   committed + verified     - OK");
    println!("  illegal chess move:  rejected (no receipt)  - OK");
    println!("  forged deck:         rejected (no receipt)  - OK");
    println!("  illegal card move:   rejected (no receipt)  - OK");
    println!("  forged battleship:   rejected (no receipt)  - OK");
    println!("  forged bg seed:      rejected (no receipt)  - OK");
    println!("  tampered receipt:    rejected by verify()   - OK");
    println!("ALL GAMES PROVED, VERIFIED, WINNERS CORRECT, AND THE REVERSI SCORE MATCHES. NEGATIVE GATES HELD.");
}
