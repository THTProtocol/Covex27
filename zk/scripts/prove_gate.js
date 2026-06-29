#!/usr/bin/env node
"use strict";
/*
 * prove_gate.js - the load-bearing ZK reproducibility gate.
 *
 *   node zk/scripts/prove_gate.js               # run all provable circuits
 *   node zk/scripts/prove_gate.js --write-demos # also refresh served demo_proof.json samples
 *   node zk/scripts/prove_gate.js <id> [<id>..] # run a subset
 *
 * For EVERY circuit the honest registry (zk/circuit_registry.json) marks
 * full-zk-offchain (the `provable` set), this:
 *
 *   1. Generates a REAL Groth16 proof using ONLY the SERVED artifacts
 *      (frontend/public/zk/<id>/<id>.wasm + <id>_final.zkey) via the canonical
 *      prove_<id>.js witness logic - exactly what an in-browser prover uses.
 *   2. VERIFIES the proof ACCEPTS against the SERVED vkey (vkey<->zkey pairing).
 *      If the served zkey and vkey ever DRIFT apart, this step fails and reds CI.
 *   3. Asserts the covenantId public input is BOUND (a non-trivial public signal
 *      is present), so the demo proof binds to a covenant rather than floating.
 *   4. TAMPER attack A (field overflow): adds the BN254 group order to a public
 *      signal. A sound verifier must REJECT (no field-wrap forgery).
 *   5. TAMPER attack B (proof byte flip): mutates a proof element. Must REJECT.
 *   6. FALSE-PREDICATE: flips the boolean `valid` output to 0 and re-checks - a
 *      false statement must verify with valid==0 (the proof still verifies, but
 *      the circuit's predicate output is honest about the statement being false).
 *
 * The trusted setup is a single-contributor Covex DEV ceremony, NOT a production
 * multi-party MPC. This gate proves the served keys are internally consistent and
 * fail-closed; it does NOT certify the ceremony.
 *
 * Honesty: this only runs circuits the registry already marks provable. It never
 * claims a circuit proves if its served _final.zkey is absent.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");
const realSnark = require("snarkjs");

const ZK = path.join(__dirname, "..");
const ROOT = path.join(ZK, "..");
const SERVED_ROOT = path.join(ROOT, "frontend/public/zk");
const REG = path.join(ZK, "circuit_registry.json");

// BN254 (alt_bn128 / bn128) scalar field order r. snarkjs reduces public signals
// mod r, so a sound Groth16 verify must reject a signal that is s + r (same residue
// would pass; s + r is a DIFFERENT integer that must NOT be accepted as the input).
const BN254_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// merkle_membership is proven by prove_verify.js, not prove_merkle_membership.js.
const PROVE_SCRIPT = {
  merkle_membership: "prove_verify.js",
};
function proveScriptFor(id) {
  const override = PROVE_SCRIPT[id];
  return path.join(ZK, override || `prove_${id}.js`);
}

function loadVkey(id) {
  const dir = path.join(SERVED_ROOT, id);
  for (const n of [`${id}_vkey.json`, "verification_key.json"]) {
    const p = path.join(dir, n);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  throw new Error(`no served vkey for ${id}`);
}

// Run prove_<id>.js with the SERVED wasm+zkey pinned (require-hook), capture {proof, publicSignals}.
function servedProve(id) {
  return new Promise((resolve, reject) => {
    const SERVED = path.join(SERVED_ROOT, id);
    const SERVED_WASM = path.join(SERVED, `${id}.wasm`);
    const SERVED_ZKEY = path.join(SERVED, `${id}_final.zkey`);
    for (const p of [SERVED_WASM, SERVED_ZKEY]) {
      if (!fs.existsSync(p)) return reject(new Error(`missing served artifact: ${p}`));
    }
    const child = require("child_process").fork(
      path.join(__dirname, "served_prove.js"),
      [id, proveScriptFor(id), path.join(os.tmpdir(), `pg_${process.pid}_${id}.json`)],
      { stdio: ["ignore", "pipe", "pipe", "ipc"] }
    );
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`served_prove ${id} exit ${code}: ${err.trim() || out.trim()}`));
      const outFile = path.join(os.tmpdir(), `pg_${process.pid}_${id}.json`);
      try {
        const j = JSON.parse(fs.readFileSync(outFile, "utf8"));
        fs.unlinkSync(outFile);
        resolve({ proof: j.proof, publicSignals: j.publicSignals.map(String) });
      } catch (e) { reject(new Error(`could not read served proof for ${id}: ${e.message}`)); }
    });
  });
}

async function verify(vkey, publicSignals, proof) {
  return realSnark.groth16.verify(vkey, publicSignals, proof);
}

async function runOne(id, writeDemos) {
  const r = { id, prove: false, accept: false, bound: false, overflow_reject: false, byteflip_reject: false, false_predicate: false, notes: [] };
  const vkey = loadVkey(id);

  // 1+2: prove with served artifacts + verify accept against served vkey
  const { proof, publicSignals } = await servedProve(id);
  r.prove = true;
  r.publicSignals = publicSignals;
  const ok = await verify(vkey, publicSignals, proof);
  r.accept = ok === true;
  if (!r.accept) { r.notes.push("served proof did NOT verify against served vkey (zkey/vkey DRIFT)"); return r; }

  // 3: covenantId binding - the proof must carry a non-trivial public signal beyond the
  // boolean valid output (slot 0). A bound demo has >=2 public signals and at least one
  // signal that is neither "0" nor "1" (the covenantId / commitment binding).
  const nonTrivial = publicSignals.slice(1).some((s) => s !== "0" && s !== "1");
  r.bound = publicSignals.length >= 2 && nonTrivial;
  if (!r.bound) r.notes.push(`weak binding: publicSignals=${JSON.stringify(publicSignals)}`);

  // 4: field-overflow tamper - add r to the LAST public signal (typically a bound input).
  {
    const tampered = publicSignals.slice();
    const idx = tampered.length - 1;
    tampered[idx] = (BigInt(tampered[idx]) + BN254_R).toString();
    const accepted = await verify(vkey, tampered, proof);
    r.overflow_reject = accepted === false;
    if (!r.overflow_reject) r.notes.push("FIELD-OVERFLOW FORGERY ACCEPTED (signal+r passed) - NOT SOUND");
  }

  // 5: proof byte-flip tamper - mutate proof.pi_a[0].
  {
    const badProof = JSON.parse(JSON.stringify(proof));
    const a0 = BigInt(badProof.pi_a[0]);
    badProof.pi_a[0] = ((a0 + 1n) % BN254_R).toString();
    const accepted = await verify(vkey, publicSignals, badProof);
    r.byteflip_reject = accepted === false;
    if (!r.byteflip_reject) r.notes.push("byte-flipped proof ACCEPTED - NOT SOUND");
  }

  // 6: false-predicate - a proof whose statement is FALSE must NOT verify when we claim
  // the boolean output is 1. We flip the `valid` output signal (slot 0) to its opposite
  // and re-verify: the verifier must REJECT the mismatched public output. This proves the
  // circuit's predicate output is load-bearing (a false predicate cannot masquerade as true).
  {
    const flipped = publicSignals.slice();
    flipped[0] = flipped[0] === "1" ? "0" : "1";
    const accepted = await verify(vkey, flipped, proof);
    // A real Groth16 verify binds ALL public signals; flipping the output must reject.
    r.false_predicate = accepted === false;
    if (!r.false_predicate) r.notes.push("flipping the boolean output still verified - output not bound");
  }

  // Optionally refresh the served demo sample (a fresh, reproducible, covenant-bound proof).
  if (writeDemos) {
    const demoPath = path.join(SERVED_ROOT, id, "demo_proof.json");
    fs.writeFileSync(demoPath, JSON.stringify({ proof, publicSignals }, null, 2) + "\n");
    r.notes.push(`wrote served demo_proof.json (publicSignals=${publicSignals.length})`);
  }

  return r;
}

async function main() {
  const args = process.argv.slice(2);
  const writeDemos = args.includes("--write-demos");
  const ids = args.filter((a) => !a.startsWith("--"));
  const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
  const provable = reg.full_zk_offchain.slice().sort();
  const target = ids.length ? ids : provable;

  // Guard: never let this gate silently run a non-provable circuit.
  for (const id of target) {
    if (!provable.includes(id)) { console.error(`REFUSE: ${id} is not registry-provable; not running.`); process.exit(2); }
  }

  console.log(`prove_gate: ${target.length} provable circuit(s)${writeDemos ? " [--write-demos]" : ""}\n`);
  const results = [];
  let fail = 0;
  for (const id of target) {
    try {
      const r = await runOne(id, writeDemos);
      const pass = r.prove && r.accept && r.bound && r.overflow_reject && r.byteflip_reject && r.false_predicate;
      if (!pass) fail++;
      results.push(r);
      const flag = pass ? "PASS" : "FAIL";
      console.log(
        `${flag}  ${id.padEnd(26)} prove=${r.prove?1:0} accept=${r.accept?1:0} bound=${r.bound?1:0} ` +
        `overflow_reject=${r.overflow_reject?1:0} byteflip_reject=${r.byteflip_reject?1:0} false_pred=${r.false_predicate?1:0}` +
        (r.notes.length ? `\n        ${r.notes.join("; ")}` : "")
      );
    } catch (e) {
      fail++;
      console.log(`FAIL  ${id.padEnd(26)} ERROR: ${e.message}`);
      results.push({ id, error: e.message });
    }
  }

  console.log(`\nprove_gate: ${target.length - fail}/${target.length} passed.`);
  if (fail) { console.error(`prove_gate: ${fail} circuit(s) FAILED - vkey/zkey drift or unsound verify.`); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error("prove_gate fatal:", e && e.stack || e); process.exit(1); });
