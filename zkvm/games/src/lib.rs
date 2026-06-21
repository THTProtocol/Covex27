//! # Covex zkVM games-rules library
//!
//! A pure-Rust, deterministic library that decides the outcome of a staked Covex game by
//! REPLAYING the recorded moves under the real rules of the game plus a universal chess-style
//! clock. The single entry point [`replay`] is what the RISC0 zkVM guest will later wrap: the
//! guest reads a [`GameInput`], calls `replay`, and commits the [`GameResult`] to the journal.
//!
//! ## The honesty invariant (why this is the whole proof)
//!
//! A zk proof of a game only EXISTS if the guest runs to completion. `replay` returns `Err`
//! the instant a move is illegal (or the clock is malformed), and the guest turns that `Err`
//! into a panic, so NO proof can be produced for an illegal game. Therefore: a valid proof
//! attests that every move was legal, the clock was respected, and the committed `winner` is
//! the genuine result. The rules here are the trusted core; they must be correct, which is why
//! this crate ships negative tests (illegal move -> `Err`) and known-result games.
//!
//! ## Card games and the committed deck (the second honesty gate)
//!
//! Card games (blackjack, poker) cannot let a player choose cards after seeing the table. So the
//! 52-card deck is COMMITTED up front: `deck_commitment` (public) is `sha256(deck)`, and `deck`
//! (witness, the actual 52-card permutation) is supplied to the prover. Before any card is dealt,
//! `replay` asserts `sha256(deck) == deck_commitment` and that `deck` is a valid permutation of
//! all 52 distinct cards `0..52`. A forged or altered deck makes that assertion fail -> `Err`, so
//! no proof can be produced for a tampered deck. The deck is fixed at commit time and cannot change.
//!
//! This crate has NO risc0 dependency and does no I/O, time, or randomness, so the same
//! `GameInput` always yields the same `GameResult` inside and outside the zkVM.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub mod games;

/// Which game's rules to apply when replaying.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameType {
    Chess,
    Connect4,
    TicTacToe,
    Checkers,
    /// Heads-up blackjack vs an auto-playing dealer, from a committed 52-card deck.
    Blackjack,
    /// 2-player Texas Hold'em SHOWDOWN (v1: no betting), from a committed 52-card deck.
    Poker,
    /// Reversi / Othello on an 8x8 board. Moves flip opponent discs; most discs wins.
    Reversi,
    /// Mancala (Kalah), 2x6 pits + 2 stores. Sow with capture + extra-turn-on-store.
    Mancala,
    /// Dots and Boxes on a parameterized box grid (default 3x3). Complete a box -> score + go again.
    DotsAndBoxes,
    /// Battleship with HIDDEN boards: each player commits `sha256(board||salt)` (public) and the
    /// board is a witness in `setup`. The commitment is verified and the placement validated before
    /// any shot, so a forged board or illegal placement cannot be proven.
    Battleship,
    /// Backgammon with VRF dice: a committed seed (`sha256(seed)` public, `seed` witness in `setup`)
    /// deterministically generates the dice sequence. v1 documents its simplifications in the module.
    Backgammon,
}

impl GameType {
    /// Card games draw from a committed deck and verify `sha256(deck) == deck_commitment`
    /// before any play. Board games ignore the deck fields entirely.
    pub fn is_card_game(self) -> bool {
        matches!(self, GameType::Blackjack | GameType::Poker)
    }
}

/// The full, public+witness input to a replay. In the zkVM the identity/stake/covenant fields
/// are public (committed to the journal) and the `moves`/`elapsed_ms`/`deck` are the witness.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameInput {
    /// Which ruleset to replay under.
    pub game_type: GameType,
    /// The ordered plies. Game-specific notation (chess: UCI like "e2e4"; connect4: column "0".."6";
    /// blackjack: "hit"/"stand"). The sentinel "resign" is universal and means the side to move forfeits.
    pub moves: Vec<String>,
    /// `elapsed_ms[i]` is how long the mover thought before playing `moves[i]`. Must be the same
    /// length as `moves`. Deducted from the mover's clock; an overrun is a loss on time.
    pub elapsed_ms: Vec<u64>,
    /// Each side's starting clock, in milliseconds. `0` disables the clock (untimed game).
    pub initial_clock_ms: u64,
    /// Fischer increment added to the mover's clock after each (non-terminal) move, in milliseconds.
    pub increment_ms: u64,
    /// `players[0]` = player 1 (white / first to move), `players[1]` = player 2. Each is an opaque
    /// 32-byte id (e.g. sha256 of a pubkey or a covenant seat hash). Carried into the result.
    pub players: [[u8; 32]; 2],
    /// The staked amount, in sompi. Public; carried through for the settlement covenant.
    pub stake_sompi: u64,
    /// Binds the proof to THIS match (the deploy tx id), preventing cross-match replay.
    pub covenant_id: [u8; 32],

    // ---- Committed-deck fields (card games only; defaulted/empty for board games) ----
    /// WITNESS for card games: the 52-card permutation that was committed before play. Each entry
    /// is a card id `0..52` (`suit * 13 + rank`, rank `0..13` = 2..Ace, suit `0..4`). MUST be a
    /// permutation of all 52 distinct cards. EMPTY for board games (chess/connect4/ttt/checkers).
    #[serde(default)]
    pub deck: Vec<u8>,
    /// PUBLIC for card games: `sha256(deck)`. `replay` asserts `sha256(deck) == deck_commitment`
    /// before dealing, so the deck is fixed at commit time and a forged deck cannot be substituted.
    /// All-zero / ignored for board games.
    #[serde(default)]
    pub deck_commitment: [u8; 32],

    /// OPTIONAL per-game custom starting position / witness. EMPTY = use the game's default opening
    /// (so all existing inputs are unaffected). Consumed by:
    /// - **Checkers**: a 65-byte board descriptor (see [`games::checkers::CheckersGame::from_setup`])
    ///   so short endgames (capture / no-legal-move wins) are reachable through [`replay`].
    /// - **DotsAndBoxes**: empty = 3x3, or 2 bytes `[rows, cols]` to set the box grid (each 1..=8).
    /// - **Battleship**: the 62-byte hidden-board witness (two 31-byte player slices); see below.
    /// - **Backgammon**: the 32-byte committed VRF seed witness; see below.
    /// A malformed setup makes the game's builder (and thus `replay`) return `Err`.
    #[serde(default)]
    pub setup: Vec<u8>,

    /// OPTIONAL public commitments (witness-binding hashes), interpreted per game. EMPTY for games
    /// that do not use them, so all existing inputs are unaffected. Consumed by:
    ///
    /// - **Battleship**: exactly two entries, `commitments[0] = sha256(board_p1 || salt_p1)` and
    ///   `commitments[1] = sha256(board_p2 || salt_p2)`. Each player's hidden board + salt lives in
    ///   the `setup` witness; [`replay`] verifies both commitments and that each placement is legal
    ///   (ships in-bounds, non-overlapping) BEFORE any shot. A forged board (hash mismatch) or an
    ///   illegal placement makes `replay` return `Err`, so no proof can be produced.
    /// - **Backgammon**: exactly one entry, `commitments[0] = sha256(seed)`. The 32-byte VRF `seed`
    ///   lives in the `setup` witness; the dice sequence is `sha256(seed || roll_index)` mapped to
    ///   1..6, so neither player can choose dice after seeing the board. A forged seed (hash
    ///   mismatch) makes `replay` return `Err`.
    #[serde(default)]
    pub commitments: Vec<[u8; 32]>,
}

/// The committed result of a replay. In the zkVM this is the journal.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameResult {
    /// `0` = player 1 (white / first mover), `1` = player 2, `2` = draw/push.
    pub winner: u8,
    /// Human-readable cause: "checkmate", "connect4", "resign", "timeout", "draw", "stalemate", ...
    pub reason: String,
    /// Number of plies actually applied before the game ended.
    pub num_plies: u32,
    /// `sha256` of the joined `moves` (newline-separated), binding the journal to the exact game.
    pub moves_digest: [u8; 32],
}

/// Universal winner codes, so games and `replay` never juggle bare integers.
pub const WINNER_P1: u8 = 0;
pub const WINNER_P2: u8 = 1;
pub const WINNER_DRAW: u8 = 2;

/// The rules of a two-player, alternating-turn, deterministic game.
///
/// `replay` drives an impl of this trait: it asks whose turn it is, applies one ply at a time,
/// and reacts to what `step` returns. An impl is responsible ONLY for legality + win detection;
/// the clock, the "resign" sentinel, and result assembly are handled uniformly by `replay`.
pub trait GameRules {
    /// Whose turn it is to move RIGHT NOW: [`WINNER_P1`] (0) or [`WINNER_P2`] (1).
    /// `replay` uses this both to know whose clock to deduct and who forfeits on "resign".
    fn side_to_move(&self) -> u8;

    /// Apply ONE ply for the current side to move.
    ///
    /// - `Ok(None)`        -> the move was legal and the game continues.
    /// - `Ok(Some(w))`     -> the move was legal and ENDED the game; `w` is the winner code
    ///                        ([`WINNER_P1`] / [`WINNER_P2`] / [`WINNER_DRAW`]).
    /// - `Err(msg)`        -> the move is ILLEGAL or unparseable. This is the honesty gate:
    ///                        `replay` propagates it and no proof can be produced.
    fn step(&mut self, mv: &str) -> Result<Option<u8>, String>;
}

/// The universal "resign" sentinel: the side to move forfeits.
pub const SENTINEL_RESIGN: &str = "resign";

/// Build the right [`GameRules`] impl for a board game. Card games do not use this path; they are
/// resolved directly in [`replay`] after the deck commitment is verified.
///
/// Takes the full `&GameInput` because some games consume the optional `setup` (custom starting
/// position). A malformed `setup` returns `Err`, so it cannot smuggle in an illegal board state.
fn build_rules(input: &GameInput) -> Result<Box<dyn GameRules>, String> {
    Ok(match input.game_type {
        GameType::Chess => Box::new(games::chess::ChessGame::new()),
        GameType::Connect4 => Box::new(games::connect4::Connect4Game::new()),
        GameType::TicTacToe => Box::new(games::tic_tac_toe::TicTacToeGame::new()),
        GameType::Checkers => Box::new(games::checkers::CheckersGame::from_setup(&input.setup)?),
        GameType::Reversi => Box::new(games::reversi::ReversiGame::new()),
        GameType::Mancala => Box::new(games::mancala::MancalaGame::new()),
        GameType::DotsAndBoxes => Box::new(games::dots_and_boxes::DotsAndBoxesGame::from_setup(&input.setup)?),
        // Battleship verifies its committed hidden boards against the public `commitments` here,
        // before any shot. A forged board or illegal placement returns Err -> no proof.
        GameType::Battleship => {
            Box::new(games::battleship::BattleshipGame::from_input(&input.setup, &input.commitments)?)
        }
        // Backgammon verifies its committed VRF seed (`commitments[0] == sha256(seed)`) here.
        GameType::Backgammon => {
            Box::new(games::backgammon::BackgammonGame::from_input(&input.setup, &input.commitments)?)
        }
        // Card games are handled by `replay` directly; this arm is unreachable in practice.
        GameType::Blackjack | GameType::Poker => {
            unreachable!("card games are resolved in replay(), not via build_rules")
        }
    })
}

/// Compute `sha256` of the joined moves (newline-separated). Deterministic and order-sensitive.
fn moves_digest(moves: &[String]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(moves.join("\n").as_bytes());
    let out = hasher.finalize();
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&out);
    digest
}

/// `sha256` of a raw byte slice (the deck commitment).
pub(crate) fn sha256_bytes(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let out = hasher.finalize();
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&out);
    digest
}

/// Verify the committed deck: it must hash to `deck_commitment` AND be a permutation of all 52
/// distinct cards `0..52`. This is the card-game honesty gate, run before any card is dealt.
/// A forged/altered deck (wrong hash) or an invalid deck (duplicate/missing/out-of-range card)
/// returns `Err`, so no proof can be produced for a tampered deck.
fn verify_committed_deck(deck: &[u8], commitment: &[u8; 32]) -> Result<(), String> {
    // 1. The deck must hash to the public commitment. md5-class shortcuts are not used: this is a
    //    full sha256 over the exact witness bytes.
    let actual = sha256_bytes(deck);
    if &actual != commitment {
        return Err(format!(
            "deck commitment mismatch: sha256(deck)={} != committed {}",
            hex32(&actual),
            hex32(commitment)
        ));
    }
    // 2. The deck must be exactly the 52 cards 0..52, each once (a genuine permutation).
    if deck.len() != 52 {
        return Err(format!("deck must have 52 cards, got {}", deck.len()));
    }
    let mut seen = [false; 52];
    for &card in deck {
        if card >= 52 {
            return Err(format!("card id {card} out of range (0..52)"));
        }
        if seen[card as usize] {
            return Err(format!("deck is not a permutation: card {card} appears twice"));
        }
        seen[card as usize] = true;
    }
    Ok(())
}

/// Lowercase hex of a 32-byte digest (for error messages only).
fn hex32(b: &[u8; 32]) -> String {
    let mut s = String::with_capacity(64);
    for byte in b {
        s.push_str(&format!("{byte:02x}"));
    }
    s
}

/// Replay a recorded game under its rules + a universal clock and return the genuine result.
///
/// Card games (blackjack/poker) verify the committed deck and resolve directly. Board games run the
/// per-ply loop:
/// 1. Identify the mover via `rules.side_to_move()` and deduct `elapsed_ms[i]` from THAT side's
///    clock. If the clock is enabled (`initial_clock_ms > 0`) and the elapsed time exceeds the
///    mover's remaining clock, the mover loses on time and we stop.
/// 2. Add the Fischer `increment_ms` to the mover's clock.
/// 3. If the move is the "resign" sentinel, the mover forfeits and we stop.
/// 4. Otherwise apply the move via `rules.step()`. An illegal move makes `replay` return `Err`
///    (the honesty gate). A legal terminal move ends the game with the returned winner.
///
/// If the move list is exhausted with no terminal event, the game is unfinished and `replay`
/// returns `Err` (a proof must not claim a winner for an open game).
pub fn replay(input: &GameInput) -> Result<GameResult, String> {
    if input.moves.len() != input.elapsed_ms.len() {
        return Err(format!(
            "moves/elapsed_ms length mismatch: {} moves vs {} clocks",
            input.moves.len(),
            input.elapsed_ms.len()
        ));
    }

    // ---- Card games: verify the committed deck FIRST, then resolve. ----
    if input.game_type.is_card_game() {
        // The honesty gate for cards: a forged/altered/invalid deck cannot be proven.
        verify_committed_deck(&input.deck, &input.deck_commitment)?;
        let (winner, reason, num_plies) = match input.game_type {
            GameType::Blackjack => games::blackjack::resolve(&input.deck, &input.moves)?,
            GameType::Poker => games::poker::resolve(&input.deck, &input.moves)?,
            _ => unreachable!(),
        };
        return Ok(GameResult {
            winner,
            reason,
            num_plies,
            moves_digest: moves_digest(&input.moves),
        });
    }

    let mut rules = build_rules(input)?;
    let clock_enabled = input.initial_clock_ms > 0;
    // clocks[0] = player 1, clocks[1] = player 2.
    let mut clocks: [u64; 2] = [input.initial_clock_ms, input.initial_clock_ms];

    let mut winner: Option<u8> = None;
    let mut reason = String::new();
    let mut plies_played: u32 = 0;

    for (i, mv) in input.moves.iter().enumerate() {
        let side = rules.side_to_move();
        if side != WINNER_P1 && side != WINNER_P2 {
            return Err(format!("rules reported invalid side_to_move {side} at ply {i}"));
        }
        let elapsed = input.elapsed_ms[i];

        // 1. Clock: deduct then check for a time loss.
        if clock_enabled {
            let remaining = clocks[side as usize];
            if elapsed > remaining {
                winner = Some(other_side(side));
                reason = "timeout".to_string();
                break;
            }
            clocks[side as usize] = remaining - elapsed;
            // 2. Fischer increment for having made a move in time.
            clocks[side as usize] = clocks[side as usize].saturating_add(input.increment_ms);
        }

        // 3. Universal resign sentinel.
        if mv == SENTINEL_RESIGN {
            winner = Some(other_side(side));
            reason = "resign".to_string();
            plies_played += 1;
            break;
        }

        // 4. Apply the move under the game's rules. Illegal -> Err (no proof can exist).
        match rules.step(mv) {
            Ok(None) => {
                plies_played += 1;
            }
            Ok(Some(w)) => {
                plies_played += 1;
                winner = Some(w);
                reason = end_reason(input.game_type, w);
                break;
            }
            Err(e) => {
                return Err(format!("illegal move at ply {i} (\"{mv}\"): {e}"));
            }
        }
    }

    let winner = match winner {
        Some(w) => w,
        None => {
            return Err(
                "game is unfinished: move list exhausted with no checkmate, win, draw, resignation, or timeout"
                    .to_string(),
            );
        }
    };

    Ok(GameResult {
        winner,
        reason,
        num_plies: plies_played,
        moves_digest: moves_digest(&input.moves),
    })
}

/// The opponent of a side code.
fn other_side(side: u8) -> u8 {
    if side == WINNER_P1 {
        WINNER_P2
    } else {
        WINNER_P1
    }
}

/// Default reason string for a natural game end, by game and winner.
fn end_reason(game_type: GameType, winner: u8) -> String {
    if winner == WINNER_DRAW {
        return match game_type {
            GameType::Chess => "draw".to_string(),
            _ => "draw".to_string(),
        };
    }
    match game_type {
        GameType::Chess => "checkmate".to_string(),
        GameType::Connect4 => "connect4".to_string(),
        GameType::TicTacToe => "three_in_a_row".to_string(),
        GameType::Checkers => "no_moves".to_string(),
        GameType::Reversi => "most_discs".to_string(),
        GameType::Mancala => "most_stones".to_string(),
        GameType::DotsAndBoxes => "most_boxes".to_string(),
        GameType::Battleship => "all_sunk".to_string(),
        GameType::Backgammon => "borne_off".to_string(),
        // Card games never reach end_reason (resolved in replay's card branch).
        GameType::Blackjack => "blackjack".to_string(),
        GameType::Poker => "showdown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids() -> [[u8; 32]; 2] {
        [[1u8; 32], [2u8; 32]]
    }

    fn untimed(game_type: GameType, moves: &[&str]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: ids(),
            stake_sompi: 1_000,
            covenant_id: [9u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup: vec![],
            commitments: vec![],
        }
    }

    // ---- replay-level (game-agnostic) tests ----

    #[test]
    fn resign_makes_mover_lose() {
        // White resigns on move 1 -> black (player 2) wins.
        let input = untimed(GameType::Chess, &["resign"]);
        let r = replay(&input).expect("resign should be a valid terminal event");
        assert_eq!(r.winner, WINNER_P2);
        assert_eq!(r.reason, "resign");
        assert_eq!(r.num_plies, 1);
    }

    #[test]
    fn second_player_resign_makes_first_player_win() {
        // White plays e2e4 (legal), then black resigns -> white (player 1) wins.
        let input = untimed(GameType::Chess, &["e2e4", "resign"]);
        let r = replay(&input).expect("legal move then resign");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "resign");
        assert_eq!(r.num_plies, 2);
    }

    #[test]
    fn length_mismatch_is_err() {
        let mut input = untimed(GameType::Chess, &["e2e4"]);
        input.elapsed_ms = vec![]; // mismatch
        assert!(replay(&input).is_err());
    }

    #[test]
    fn unfinished_game_is_err() {
        // One legal move, no terminal event -> cannot claim a winner.
        let input = untimed(GameType::Chess, &["e2e4"]);
        assert!(replay(&input).is_err());
    }

    #[test]
    fn moves_digest_is_deterministic_and_order_sensitive() {
        let a = moves_digest(&["e2e4".into(), "e7e5".into()]);
        let b = moves_digest(&["e2e4".into(), "e7e5".into()]);
        let c = moves_digest(&["e7e5".into(), "e2e4".into()]);
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    // ---- committed-deck helper tests ----

    /// An identity deck 0..52 hashes to its own commitment and is a valid permutation.
    #[test]
    fn identity_deck_verifies() {
        let deck: Vec<u8> = (0u8..52).collect();
        let commit = sha256_bytes(&deck);
        assert!(verify_committed_deck(&deck, &commit).is_ok());
    }

    /// A deck whose bytes do not hash to the commitment is rejected (forged deck).
    #[test]
    fn forged_deck_hash_mismatch_is_err() {
        let deck: Vec<u8> = (0u8..52).collect();
        let bad_commit = [0u8; 32]; // not sha256(deck)
        let err = verify_committed_deck(&deck, &bad_commit).unwrap_err();
        assert!(err.contains("commitment mismatch"), "got: {err}");
    }

    /// A deck with a duplicate card (not a permutation) is rejected even if the hash matches.
    #[test]
    fn non_permutation_deck_is_err() {
        let mut deck: Vec<u8> = (0u8..52).collect();
        deck[51] = 0; // card 0 now appears twice, card 51 missing
        let commit = sha256_bytes(&deck); // honest hash of the bad deck
        let err = verify_committed_deck(&deck, &commit).unwrap_err();
        assert!(err.contains("permutation") || err.contains("twice"), "got: {err}");
    }
}
