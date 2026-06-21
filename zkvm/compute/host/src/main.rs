// Covex general verifiable-computation zkVM prover - host.
//
// For each demo program we build a REAL GuestInput (witnessed program + public inputs + the HONEST
// claimed program hash + the HONEST claimed output computed by running execute() on the host), prove
// it with the RISC0 prover, verify the receipt against the guest image id, decode the journal
// (Statement), and assert {program_hash, public_inputs, output} are exactly what we expect.
//
// Then the NEGATIVE gates (soundness):
//   * a WRONG claimed output must FAIL to prove (run_checked Err -> guest panic -> no receipt),
//   * a WRONG claimed program hash must FAIL to prove (the program is bound to its hash),
//   * a RUNTIME TRAP (e.g. divide by zero) must FAIL to prove,
//   * a TAMPERED receipt must FAIL verification (the seal binds the journal).
//
// Run a real (non-dev) proof with RISC0_DEV_MODE=0. The honesty gate lives in the guest:
// run_checked returns Err for any false statement, which panics the guest and yields no receipt.
// A receipt therefore proves "the program with THIS hash, run on THESE inputs, produces THIS output".

use std::time::Instant;

use covex_compute_core::{execute, program_hash, GuestInput, Op, Program, Statement};
use methods::{COMPUTE_GUEST_ELF, COMPUTE_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};

/// Build the HONEST GuestInput for a program + inputs: run execute() on the host to get the true
/// output and program_hash(), and package them as the public claims. (This is what an honest
/// prover does; the negative gates below deliberately lie about the output / hash.)
fn honest_input(program: &Program, inputs: &[u64]) -> (GuestInput, u64) {
    let output = execute(program, inputs).expect("demo program must execute on the host");
    let input = GuestInput {
        program: program.clone(),
        public_inputs: inputs.to_vec(),
        claimed_program_hash: program_hash(program),
        claimed_output: output,
    };
    (input, output)
}

/// Prove one program, verify the receipt against the image id, decode the journal, and assert the
/// committed Statement. Returns the Statement, the proving time, and the receipt. Panics on any
/// failure (so the GATE fails loudly).
fn prove_and_verify(
    label: &str,
    program: &Program,
    inputs: &[u64],
    expected_output: u64,
) -> (Statement, f64, Receipt) {
    println!("\n==== {label} ====");
    println!("  program ops : {}", program.ops.len());
    println!("  inputs      : {inputs:?}");
    println!("  expected out: {expected_output}");

    let (input, host_output) = honest_input(program, inputs);
    assert_eq!(
        host_output, expected_output,
        "{label}: host execute() = {host_output} but the demo expects {expected_output}"
    );

    let env = ExecutorEnv::builder()
        .write(&input)
        .expect("serialize GuestInput into the executor env")
        .build()
        .expect("build executor env");

    let prover = default_prover();

    let t0 = Instant::now();
    let prove_info = prover
        .prove(env, COMPUTE_GUEST_ELF)
        .expect("prove the true statement (a receipt must be producible)");
    let elapsed = t0.elapsed().as_secs_f64();

    let receipt = prove_info.receipt;

    // Verify the receipt against the guest image id. This is the off-chain check the Covex oracle
    // performs before co-signing. It fails if the receipt does not correspond to THIS guest program.
    receipt
        .verify(COMPUTE_GUEST_ID)
        .expect("receipt must verify against the guest image id");

    // Decode the committed journal into a Statement.
    let statement: Statement = receipt
        .journal
        .decode()
        .expect("decode the Statement journal");

    println!(
        "  PROVED+VERIFIED  output={} program_hash={} prove_time={:.2}s",
        statement.output,
        covex_compute_core::hex32(&statement.program_hash),
        elapsed
    );

    // The committed statement must match the program, the inputs, and the true output exactly.
    assert_eq!(statement.output, expected_output, "{label}: committed output wrong");
    assert_eq!(
        statement.program_hash,
        program_hash(program),
        "{label}: committed program hash wrong"
    );
    assert_eq!(statement.public_inputs, inputs.to_vec(), "{label}: committed inputs wrong");

    (statement, elapsed, receipt)
}

/// NEGATIVE GATE: a dishonest GuestInput must FAIL to prove (run_checked returns Err -> guest panic
/// -> no receipt). We assert that proving returns Err.
fn prove_must_fail(label: &str, input: &GuestInput) {
    println!("\n==== {label} (negative: proving MUST fail) ====");

    let env = ExecutorEnv::builder()
        .write(input)
        .expect("serialize dishonest GuestInput")
        .build()
        .expect("build executor env");

    let prover = default_prover();
    let res = prover.prove(env, COMPUTE_GUEST_ELF);

    match res {
        Ok(_) => panic!("{label}: SECURITY FAILURE - a false statement produced a receipt!"),
        Err(e) => println!("  OK - proving failed as required (no receipt). error: {e}"),
    }
}

/// NEGATIVE GATE (soundness): a TAMPERED receipt must fail verification. We flip a byte in the
/// committed journal and confirm verify() rejects it - so a receipt cannot be re-labeled to claim
/// a different output. (Skipped under RISC0_DEV_MODE because dev receipts carry no real seal.)
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
    if tampered.journal.bytes.is_empty() {
        panic!("{label}: empty journal, cannot run tamper test");
    }
    tampered.journal.bytes[0] ^= 0xFF;

    match tampered.verify(COMPUTE_GUEST_ID) {
        Ok(_) => panic!("{label}: SECURITY FAILURE - a tampered receipt verified!"),
        Err(e) => println!("  OK - tampered receipt rejected by verify(). error: {e}"),
    }
}

// ---- demo program builders ------------------------------------------------------------------

/// f(x, y) = x*x + 3*y. A small straight-line arithmetic program.
fn quadratic_program() -> Program {
    Program {
        num_inputs: 2,
        ops: vec![
            Op::Load(0),
            Op::Dup,
            Op::Mul, // x*x
            Op::PushConst(3),
            Op::Load(1),
            Op::Mul, // 3*y
            Op::Add, // x*x + 3*y
        ],
    }
}

/// A length-`n` dot product of two vectors held in the input tape as [a0..an, b0..bn], accumulated
/// in register 0. This is the unrolled linear-algebra primitive that underlies simple zkML (a
/// fixed-size matrix-vector multiply is a stack of these). No loops in the ISA; we unroll at build.
fn dot_product_program(n: u32) -> Program {
    let mut ops = vec![Op::PushConst(0), Op::Store(0)];
    for i in 0..n {
        ops.push(Op::Load(i)); // a_i
        ops.push(Op::Load(i + n)); // b_i
        ops.push(Op::Mul);
        ops.push(Op::LoadReg(0));
        ops.push(Op::Add);
        ops.push(Op::Store(0));
    }
    ops.push(Op::LoadReg(0));
    Program { num_inputs: 2 * n, ops }
}

/// A hash CHAIN of depth `d`: start from input[0], and `d` times fold the current accumulator with
/// 7 zero bytes through Hash8. Output is the final folded value. Proves knowledge that running the
/// public chain over the public seed yields the public output (a verifiable proof-of-work-style /
/// commitment chain).
fn hash_chain_program(d: u32) -> Program {
    let mut ops = vec![Op::Load(0)];
    for _ in 0..d {
        // acc is on top; push 7 zeros so Hash8 consumes [acc, 0,0,0,0,0,0,0].
        for _ in 0..7 {
            ops.push(Op::PushConst(0));
        }
        ops.push(Op::Hash8);
    }
    Program { num_inputs: 1, ops }
}

/// A threshold predicate: is the dot product of two length-2 vectors >= a public threshold? Returns
/// 1 (yes) or 0 (no). inputs = [a0, a1, b0, b1, threshold]. Demonstrates a custom predicate over a
/// computed quantity (the building block for "prove my private-ish score clears a bar" once inputs
/// are made witnesses in a later version).
fn threshold_predicate_program() -> Program {
    Program {
        num_inputs: 5,
        ops: vec![
            // dot = a0*b0 + a1*b1
            Op::Load(0),
            Op::Load(2),
            Op::Mul,
            Op::Load(1),
            Op::Load(3),
            Op::Mul,
            Op::Add, // dot on top
            // push threshold, then compute (dot < threshold) and invert to (dot >= threshold).
            Op::Load(4), // threshold
            Op::Lt,      // 1 if dot < threshold else 0
            Op::PushConst(1),
            Op::Swap,
            Op::Sub, // 1 - (dot<threshold) = (dot>=threshold)
        ],
    }
}

fn main() {
    println!("Covex general verifiable-computation zkVM prover - host");
    println!("image id (COMPUTE_GUEST_ID) = {:?}", COMPUTE_GUEST_ID);
    println!(
        "RISC0_DEV_MODE = {:?}",
        std::env::var("RISC0_DEV_MODE").unwrap_or_else(|_| "(unset)".into())
    );

    let mut timings: Vec<(String, f64)> = Vec::new();

    // ----- PROGRAM #1: quadratic f(x,y) = x*x + 3*y over [5, 7] = 46. -----
    let quad = quadratic_program();
    let (_s, t, quad_receipt) =
        prove_and_verify("QUADRATIC  f(x,y)=x*x+3*y  on [5,7]", &quad, &[5, 7], 46);
    timings.push(("quadratic".into(), t));

    // ----- PROGRAM #2: dot product [1,2,3].[4,5,6] = 32 (the zkML primitive). -----
    let dot = dot_product_program(3);
    let (_s, t, _) = prove_and_verify(
        "DOT_PRODUCT  [1,2,3].[4,5,6]",
        &dot,
        &[1, 2, 3, 4, 5, 6],
        32,
    );
    timings.push(("dot_product".into(), t));

    // ----- PROGRAM #3: hash chain depth 4 over seed 12345 (host-precomputed expected output). ----
    let chain = hash_chain_program(4);
    let chain_inputs = [12345u64];
    let chain_expected = execute(&chain, &chain_inputs).expect("host run of hash chain");
    let (_s, t, _) = prove_and_verify(
        "HASH_CHAIN  depth=4 over seed 12345",
        &chain,
        &chain_inputs,
        chain_expected,
    );
    timings.push(("hash_chain".into(), t));

    // ----- PROGRAM #4: threshold predicate, dot([3,4],[5,6]) = 39 >= 30 -> 1. -----
    let pred = threshold_predicate_program();
    let (_s, t, _) = prove_and_verify(
        "THRESHOLD  dot([3,4],[5,6])=39 >= 30 ? -> 1",
        &pred,
        &[3, 4, 5, 6, 30],
        1,
    );
    timings.push(("threshold_predicate".into(), t));

    // ----- NEGATIVE GATE #1: a WRONG claimed output must fail to prove. -----
    // Honest f(5,7)=46; we lie and claim 47. run_checked Err -> guest panic -> no receipt.
    let (mut bad_out, _) = honest_input(&quad, &[5, 7]);
    bad_out.claimed_output = 47;
    prove_must_fail("QUADRATIC - wrong claimed output (47 != 46)", &bad_out);

    // ----- NEGATIVE GATE #2: a WRONG claimed program hash must fail to prove. -----
    // We keep the real program + real output but claim a hash of a DIFFERENT program; the guest
    // recomputes sha256(program) and rejects the mismatch.
    let (mut bad_hash, _) = honest_input(&quad, &[5, 7]);
    bad_hash.claimed_program_hash = program_hash(&dot_product_program(2));
    prove_must_fail("QUADRATIC - wrong claimed program hash", &bad_hash);

    // ----- NEGATIVE GATE #3: a RUNTIME TRAP must fail to prove. -----
    // f(x,y) = x / y with y = 0 traps (DivByZero). There is no honest output to claim, so we set a
    // placeholder; the execute() trap inside run_checked fails before the output check.
    let divprog = Program {
        num_inputs: 2,
        ops: vec![Op::Load(0), Op::Load(1), Op::Div],
    };
    let trap_input = GuestInput {
        program: divprog.clone(),
        public_inputs: vec![10, 0],
        claimed_program_hash: program_hash(&divprog),
        claimed_output: 0,
    };
    prove_must_fail("DIV - divide by zero traps (no receipt)", &trap_input);

    // ----- NEGATIVE GATE #4: a TAMPERED receipt must fail verification. -----
    tamper_must_be_rejected("QUADRATIC - tampered receipt", &quad_receipt);

    // ----- SUMMARY -----
    println!("\n================ SUMMARY ================");
    for (name, secs) in &timings {
        println!("  {name:<20} proved+verified in {secs:.2}s");
    }
    println!("  wrong output:        rejected (no receipt)  - OK");
    println!("  wrong program hash:  rejected (no receipt)  - OK");
    println!("  runtime trap:        rejected (no receipt)  - OK");
    println!("  tampered receipt:    rejected by verify()   - OK");
    println!("ALL PROGRAMS PROVED, VERIFIED, AND OUTPUTS CORRECT. NEGATIVE GATES HELD.");
}
