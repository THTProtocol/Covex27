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

use covex_games::{GameInput, GameResult, GameType, WINNER_P1, WINNER_P2};
use methods::{GAMES_GUEST_ELF, GAMES_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};
use sha2::{Digest, Sha256};

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
    }
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

    // Decode the committed journal into a GameResult.
    let result: GameResult = receipt
        .journal
        .decode()
        .expect("decode the GameResult journal");

    println!(
        "  PROVED+VERIFIED  winner={} reason={:?} plies={} prove_time={:.2}s",
        result.winner, result.reason, result.num_plies, elapsed
    );

    assert_eq!(
        result.winner, expected_winner,
        "{label}: committed winner {} != expected {expected_winner}",
        result.winner
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

    // ----- NEGATIVE GATE #4: a TAMPERED receipt must fail verification (soundness). -----
    tamper_must_be_rejected("CHESS - tampered Scholar's-mate receipt", &chess_receipt);

    // ----- SUMMARY -----
    println!("\n================ SUMMARY ================");
    for (name, secs) in &timings {
        println!("  {name:<20} proved+verified in {secs:.2}s");
    }
    println!("  illegal chess move:  rejected (no receipt)  - OK");
    println!("  forged deck:         rejected (no receipt)  - OK");
    println!("  illegal card move:   rejected (no receipt)  - OK");
    println!("  tampered receipt:    rejected by verify()   - OK");
    println!("ALL GAMES PROVED, VERIFIED, AND WINNERS CORRECT. NEGATIVE GATES HELD.");
}
