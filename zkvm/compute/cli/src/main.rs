// covex-compute-prover: the open-source CLI around the Covex general verifiable-computation zkVM.
//
// This turns the proven compute zkVM into a usable tool so that ANYONE can prove "I ran THIS
// program on THESE inputs and got THIS output" and ANYONE can verify the receipt. It is the
// trustless "the prover generates the proof, an external party checks it" baseline.
//
// Subcommands
//   prove  <input.json> <out_receipt.bin>
//       Read a program + public inputs (and an OPTIONAL claimed output) as JSON, prove it with the
//       default RISC0 prover (a REAL STARK proof when RISC0_DEV_MODE=0), and write the serialized
//       receipt to <out_receipt.bin>. Prints the committed Statement {program_hash, inputs, output}
//       and the guest image id. If the JSON omits "claimed_output", the CLI runs the program on the
//       host to fill in the honest output (convenience only - the guest re-derives and re-checks it
//       inside the proof, so a wrong claimed output can never produce a receipt). A program that
//       traps (e.g. divide by zero) cannot be proven.
//
//   verify <receipt.bin>
//       Deserialize the receipt, verify() it against the embedded COMPUTE_GUEST_ID, decode and
//       print the committed Statement. Exits non-zero if verification fails. This is the piece a
//       counterparty or the Covex oracle runs to TRUST the result without re-running the program.
//
//   hash   <program.json>
//       Print sha256(program) - the public program id you commit to / publish, and the value the
//       receipt's Statement.program_hash will equal.
//
//   tamper-journal <in.bin> <out.bin>
//       Soundness self-test helper: flip one journal byte so `verify` is forced to reject.
//
// Trust model (honest): Kaspa has no on-chain pairing/STARK verifier. The receipt is verified
// OFF-CHAIN, here, by the counterparty or by the Covex oracle, and that verification is what gates
// the co-signature on the 2-of-2 covenant. A verifying receipt attests exactly one tuple:
// {program_hash, public_inputs, output}.

use std::process::ExitCode;

use anyhow::{anyhow, bail, Context, Result};
use covex_compute_core::{
    execute, program_hash, GuestInput, Op, Program, Statement,
};
use methods::{COMPUTE_GUEST_ELF, COMPUTE_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};
use serde::Deserialize;

// ----------------------------------------------------------------------------------------------
// The JSON input schema (a friendly wrapper over a Program + inputs).
//
// A program is a list of ops written as compact JSON objects:
//   {"op":"push","v":3}     {"op":"load","i":0}     {"op":"store","r":0}   {"op":"loadreg","r":0}
//   {"op":"add"} {"op":"sub"} {"op":"mul"} {"op":"div"} {"op":"rem"}
//   {"op":"lt"}  {"op":"eq"}  {"op":"and"} {"op":"or"}  {"op":"xor"}
//   {"op":"dup"} {"op":"pop"} {"op":"swap"} {"op":"hash8"}
//
// The top-level object:
//   {
//     "_comment":   optional free-form note (ignored),
//     "num_inputs": u32 (the input-tape length the program expects),
//     "ops":        [ ... the ops ... ],
//     "inputs":     [ u64, ... ]  (the public input tape),
//     "claimed_output": optional u64 (if omitted, the CLI computes the honest output on the host)
//   }
// ----------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct JsonInput {
    #[serde(rename = "_comment", default)]
    _comment: Option<String>,
    num_inputs: u32,
    ops: Vec<JsonOp>,
    #[serde(default)]
    inputs: Vec<u64>,
    #[serde(default)]
    claimed_output: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct JsonOp {
    op: String,
    /// PushConst operand.
    #[serde(default)]
    v: Option<u64>,
    /// Load input index.
    #[serde(default)]
    i: Option<u32>,
    /// Store / LoadReg register index.
    #[serde(default)]
    r: Option<u8>,
}

/// Turn one JSON op into an ISA `Op`, validating the required operand is present.
fn parse_op(j: &JsonOp) -> Result<Op> {
    let key = j.op.to_ascii_lowercase();
    let need_v = || j.v.ok_or_else(|| anyhow!("op {:?} requires field \"v\"", j.op));
    let need_i = || j.i.ok_or_else(|| anyhow!("op {:?} requires field \"i\"", j.op));
    let need_r = || j.r.ok_or_else(|| anyhow!("op {:?} requires field \"r\"", j.op));
    Ok(match key.as_str() {
        "push" | "pushconst" | "const" => Op::PushConst(need_v()?),
        "load" => Op::Load(need_i()?),
        "store" => Op::Store(need_r()?),
        "loadreg" | "regload" => Op::LoadReg(need_r()?),
        "dup" => Op::Dup,
        "pop" => Op::Pop,
        "swap" => Op::Swap,
        "add" => Op::Add,
        "sub" => Op::Sub,
        "mul" => Op::Mul,
        "div" => Op::Div,
        "rem" | "mod" => Op::Rem,
        "lt" => Op::Lt,
        "eq" => Op::Eq,
        "and" => Op::And,
        "or" => Op::Or,
        "xor" => Op::Xor,
        "hash8" | "hash" => Op::Hash8,
        other => bail!(
            "unknown op {other:?} (expected push/load/store/loadreg/dup/pop/swap/add/sub/mul/div/rem/lt/eq/and/or/xor/hash8)"
        ),
    })
}

/// Parse a JSON file into (Program, inputs, optional claimed_output).
fn parse_input_file(path: &str) -> Result<(Program, Vec<u64>, Option<u64>)> {
    let json = std::fs::read_to_string(path).with_context(|| format!("read input JSON {path}"))?;
    let parsed: JsonInput =
        serde_json::from_str(&json).with_context(|| format!("parse input JSON {path}"))?;
    let ops = parsed
        .ops
        .iter()
        .map(parse_op)
        .collect::<Result<Vec<Op>>>()?;
    let program = Program { num_inputs: parsed.num_inputs, ops };
    Ok((program, parsed.inputs, parsed.claimed_output))
}

/// Parse just the program (ops + num_inputs) from a JSON file, for the `hash` subcommand.
fn parse_program_file(path: &str) -> Result<Program> {
    let (program, _inputs, _claim) = parse_input_file(path)?;
    Ok(program)
}

/// Render the guest image id ([u32; 8]) as a single 64-char hex string (little-endian per word,
/// the canonical RISC0 digest hex). Stable across machines for a given guest ELF.
fn image_id_hex() -> String {
    let mut s = String::with_capacity(64);
    for word in COMPUTE_GUEST_ID.iter() {
        for byte in word.to_le_bytes() {
            s.push_str(&format!("{byte:02x}"));
        }
    }
    s
}

fn print_statement(stmt: &Statement) {
    println!("  program_hash : {}", covex_compute_core::hex32(&stmt.program_hash));
    println!("  public_inputs: {:?}", stmt.public_inputs);
    println!("  output       : {}", stmt.output);
}

fn dev_mode_str() -> String {
    match std::env::var("RISC0_DEV_MODE") {
        Ok(v) if v != "0" && !v.is_empty() => {
            format!("ON ({v}) - NOT a real proof; receipts carry no cryptographic seal")
        }
        _ => "OFF (RISC0_DEV_MODE=0) - real STARK proof".to_string(),
    }
}

// ----------------------------------------------------------------------------------------------
// prove
// ----------------------------------------------------------------------------------------------

fn cmd_prove(input_path: &str, out_path: &str) -> Result<()> {
    let (program, inputs, claimed_output) = parse_input_file(input_path)?;
    let phash = program_hash(&program);

    // Fill the honest output if the JSON omitted it (convenience; the guest re-checks regardless).
    // If the JSON DID claim an output, we pass it through unchanged - a wrong claim then fails to
    // prove inside the guest, which is exactly the honesty gate we want to be demonstrable.
    let claimed_output = match claimed_output {
        Some(o) => o,
        None => execute(&program, &inputs)
            .map_err(|e| anyhow!("program traps on the host, cannot prove (no honest output): {e}"))?,
    };

    let input = GuestInput {
        program: program.clone(),
        public_inputs: inputs.clone(),
        claimed_program_hash: phash,
        claimed_output,
    };

    println!("Covex compute prover - prove");
    println!("  image id     : {}", image_id_hex());
    println!("  program ops  : {}", program.ops.len());
    println!("  program hash : {}", covex_compute_core::hex32(&phash));
    println!("  inputs       : {inputs:?}");
    println!("  claimed out  : {claimed_output}");
    println!("  dev_mode     : {}", dev_mode_str());
    println!("Proving (this is CPU heavy; a real proof takes seconds-to-tens-of-seconds + GBs RAM)...");

    let env = ExecutorEnv::builder()
        .write(&input)
        .context("serialize GuestInput into the executor env")?
        .build()
        .context("build executor env")?;

    let prover = default_prover();
    let t0 = std::time::Instant::now();
    // A false statement (wrong hash, runtime trap, wrong claimed output) makes the guest panic, so
    // prove() returns Err and NO receipt is written. That is the honesty gate working as designed.
    let prove_info = prover
        .prove(env, COMPUTE_GUEST_ELF)
        .map_err(|e| anyhow!("proving failed (a false statement cannot be proven): {e}"))?;
    let elapsed = t0.elapsed().as_secs_f64();

    let receipt = prove_info.receipt;

    // Sanity: the freshly produced receipt must verify against our own image id before we save it.
    receipt
        .verify(COMPUTE_GUEST_ID)
        .context("freshly produced receipt failed self-verification (toolchain mismatch?)")?;

    let stmt: Statement = receipt.journal.decode().context("decode the Statement journal")?;

    let bytes = bincode::serialize(&receipt).context("serialize receipt with bincode")?;
    std::fs::write(out_path, &bytes).with_context(|| format!("write receipt to {out_path}"))?;

    println!("PROVED + self-verified in {elapsed:.2}s");
    print_statement(&stmt);
    println!("  receipt      : {out_path} ({} bytes)", bytes.len());
    println!(
        "\nShare {out_path} with the counterparty / Covex oracle. They run:\n  covex-compute-prover verify {out_path}"
    );
    Ok(())
}

// ----------------------------------------------------------------------------------------------
// verify
// ----------------------------------------------------------------------------------------------

fn cmd_verify(receipt_path: &str) -> Result<Statement> {
    let bytes = std::fs::read(receipt_path).with_context(|| format!("read receipt file {receipt_path}"))?;
    let receipt: Receipt =
        bincode::deserialize(&bytes).with_context(|| format!("deserialize receipt {receipt_path}"))?;

    println!("Covex compute prover - verify");
    println!("  receipt      : {receipt_path} ({} bytes)", bytes.len());
    println!("  image id     : {}", image_id_hex());
    println!("  dev_mode     : {}", dev_mode_str());

    // THE check. Fails if the receipt does not correspond to THIS exact guest program (image id),
    // or if the journal was tampered with (the seal no longer matches). This is what a counterparty
    // or the Covex oracle runs before co-signing.
    receipt
        .verify(COMPUTE_GUEST_ID)
        .context("receipt verification FAILED - the proof does not attest to this guest program (rejected)")?;

    let stmt: Statement = receipt.journal.decode().context("decode the Statement journal")?;

    println!("VERIFIED - genuine proof for the Covex compute guest. Committed statement:");
    print_statement(&stmt);
    println!(
        "\nMeaning: a program whose sha256 is the program_hash above, run on those public inputs,\nproduces that output. (To pin WHICH program, compare program_hash against the published one.)"
    );
    Ok(stmt)
}

// ----------------------------------------------------------------------------------------------
// hash
// ----------------------------------------------------------------------------------------------

fn cmd_hash(program_path: &str) -> Result<()> {
    let program = parse_program_file(program_path)?;
    let phash = program_hash(&program);
    println!("program ops  : {}", program.ops.len());
    println!("num_inputs   : {}", program.num_inputs);
    println!("program_hash : {}", covex_compute_core::hex32(&phash));
    Ok(())
}

// ----------------------------------------------------------------------------------------------
// tamper-journal (soundness self-test helper)
// ----------------------------------------------------------------------------------------------

fn cmd_tamper_journal(in_path: &str, out_path: &str) -> Result<()> {
    let bytes = std::fs::read(in_path).with_context(|| format!("read receipt {in_path}"))?;
    let mut receipt: Receipt =
        bincode::deserialize(&bytes).with_context(|| format!("deserialize receipt {in_path}"))?;
    if receipt.journal.bytes.is_empty() {
        bail!("receipt journal is empty; nothing to tamper");
    }
    receipt.journal.bytes[0] ^= 0xFF;
    let out = bincode::serialize(&receipt).context("re-serialize tampered receipt")?;
    std::fs::write(out_path, &out).with_context(|| format!("write tampered receipt {out_path}"))?;
    println!("wrote tampered receipt to {out_path} (flipped journal byte 0); verify MUST reject it");
    Ok(())
}

// ----------------------------------------------------------------------------------------------
// entry
// ----------------------------------------------------------------------------------------------

fn usage() -> String {
    "covex-compute-prover - prove a deterministic program ran on given inputs and produced an\n\
     output, then verify the receipt off-chain.\n\
     \n\
     USAGE:\n\
     \x20 covex-compute-prover prove  <input.json> <out_receipt.bin>\n\
     \x20 covex-compute-prover verify <receipt.bin>\n\
     \x20 covex-compute-prover hash   <program.json>\n\
     \x20 covex-compute-prover tamper-journal <in_receipt.bin> <out_receipt.bin>\n\
     \n\
     prove   read a program + inputs as JSON, produce a real zk receipt (RISC0_DEV_MODE=0), print\n\
     \x20       the committed Statement + image id, write the receipt to <out_receipt.bin>.\n\
     verify  verify a receipt against the embedded guest image id, print the Statement, exit\n\
     \x20       non-zero if verification fails (the trustless check anyone can run).\n\
     hash    print sha256(program) - the public program id to publish/commit to.\n"
        .to_string()
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("");
    match cmd {
        "prove" => {
            let input = args.get(2).ok_or_else(|| anyhow!("prove: missing <input.json>\n\n{}", usage()))?;
            let out = args.get(3).ok_or_else(|| anyhow!("prove: missing <out_receipt.bin>\n\n{}", usage()))?;
            cmd_prove(input, out)
        }
        "verify" => {
            let receipt = args.get(2).ok_or_else(|| anyhow!("verify: missing <receipt.bin>\n\n{}", usage()))?;
            cmd_verify(receipt).map(|_| ())
        }
        "hash" => {
            let program = args.get(2).ok_or_else(|| anyhow!("hash: missing <program.json>\n\n{}", usage()))?;
            cmd_hash(program)
        }
        "tamper-journal" => {
            let in_path = args.get(2).ok_or_else(|| anyhow!("tamper-journal: missing <in_receipt.bin>"))?;
            let out_path = args.get(3).ok_or_else(|| anyhow!("tamper-journal: missing <out_receipt.bin>"))?;
            cmd_tamper_journal(in_path, out_path)
        }
        "-h" | "--help" | "help" | "" => {
            print!("{}", usage());
            Ok(())
        }
        other => Err(anyhow!("unknown subcommand {other:?}\n\n{}", usage())),
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}
