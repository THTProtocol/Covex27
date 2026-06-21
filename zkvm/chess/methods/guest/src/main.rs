// Covex zkVM games guest.
//
// Reads a `GameInput` from the host, replays it under the real rules of the game (chess via
// shakmaty, plus connect4 / tic-tac-toe / checkers), and commits the resulting `GameResult` to
// the journal. The single honesty invariant: `covex_games::replay` returns `Err` the instant a
// move is illegal, the clock is malformed, or the game is unfinished. `.expect()` turns that into
// a panic, so the prover CANNOT produce a receipt for an illegal game. Therefore a valid receipt
// proves every move was legal and the committed `winner` is the genuine result.
#![no_main]

use covex_games::{replay, GameInput, GameResult};
use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    // Witness + public input, written by the host via ExecutorEnv::write(&input).
    let input: GameInput = env::read();

    // The whole proof. An illegal/unfinished game makes this Err -> panic -> NO receipt.
    let result: GameResult = replay(&input).expect("illegal game - no proof");

    // The public journal: winner, reason, ply count, and the moves digest binding the journal
    // to the exact game. (The host can additionally commit/echo player ids + covenant_id; here we
    // commit the GameResult, which is what the settlement layer verifies.)
    env::commit(&result);
}
