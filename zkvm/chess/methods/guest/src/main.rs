// Covex zkVM games guest.
//
// Reads a `GameInput` from the host, replays it under the real rules of the game (chess via
// shakmaty, plus connect4 / tic-tac-toe / checkers / card + commitment-gated games), and commits a
// two-part journal: the `GameResult` (unchanged, FIRST) and then the self-sufficient
// `SettlementJournal` (Stage 1, SECOND). The single honesty invariant: `covex_games::replay`
// returns `Err` the instant a move is illegal, the clock is malformed, or the game is unfinished.
// `.expect()` turns that into a panic, so the prover CANNOT produce a receipt for an illegal game.
// Therefore a valid receipt proves every move was legal AND the committed winner/payee is genuine.
#![no_main]

use covex_games::{replay, settle, GameInput, GameResult, SettlementJournal};
use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    // Witness + public input, written by the host via ExecutorEnv::write(&input).
    let input: GameInput = env::read();

    // The whole proof. An illegal/unfinished game makes this Err -> panic -> NO receipt.
    let result: GameResult = replay(&input).expect("illegal game - no proof");

    // FIRST journal item: the GameResult, exactly as before. This keeps every existing decoder
    // (receipt.journal.decode::<GameResult>()) working unchanged - backward compatible.
    env::commit(&result);

    // SECOND journal item (Stage 1): the self-sufficient SettlementJournal. It BINDS the proof to
    // THIS pot (covenant_id) and names the PAYEE (winner_pubkey = players[winner], all-zero for a
    // draw), echoing stake_sompi and carrying moves_digest. `settle` re-runs the same trusted
    // `replay` and reads players[winner] from the public input, so these fields are attested by the
    // proof, not asserted by an untrusted settlement layer. With KIP-16 these become the on-chain
    // Groth16 public inputs (see docs/zk_precompile_abi.md). `replay` already succeeded above, so
    // `settle` cannot fail here for a different reason; `.expect()` preserves the panic-on-illegal
    // honesty gate regardless.
    let journal: SettlementJournal = settle(&input).expect("settle failed for a replayed game");
    env::commit(&journal);
}
