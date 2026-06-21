// Covex general verifiable-computation zkVM guest.
//
// Reads a `GuestInput` from the host: the WITNESSED program, the public input tape, the publicly
// claimed program hash, and the publicly claimed output. It runs `covex_compute_core::run_checked`,
// which:
//   1. asserts sha256(program) == claimed_program_hash  (binds WHICH program ran),
//   2. executes the program deterministically over the inputs (any trap -> Err),
//   3. asserts the computed output == claimed_output,
// and returns the public `Statement {program_hash, public_inputs, output}`. The single honesty
// invariant: run_checked returns Err the instant the hash is wrong, the program traps, or the
// claimed output is wrong. `.expect()` turns that into a panic, so the prover CANNOT produce a
// receipt for a false statement. Therefore a valid receipt proves: "the program with THIS hash,
// run on THESE public inputs, produces THIS output."
#![no_main]

use covex_compute_core::{run_checked, GuestInput, Statement};
use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    // Witness + public claims, written by the host via ExecutorEnv::write(&input).
    let input: GuestInput = env::read();

    // The whole proof. A wrong program hash, a runtime trap, or a wrong claimed output makes this
    // Err -> panic -> NO receipt.
    let statement: Statement = run_checked(
        &input.program,
        &input.public_inputs,
        &input.claimed_program_hash,
        input.claimed_output,
    )
    .expect("statement is false (bad program hash, trap, or wrong output) - no proof");

    // The public journal: the exact statement attested by this receipt. The program itself stays a
    // witness; only its hash, the inputs, and the output are made public here.
    env::commit(&statement);
}
