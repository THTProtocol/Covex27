#!/usr/bin/env node
"use strict";
/*
 * check_demo_proofs.js - anti-regression gate: every served demo_proof.json MUST be a proof
 * that verifies against the served vkey next to it. Called by scripts/check-zk-registry.sh.
 *
 * Why this exists: four vkey-only circuits (chess_ai_move, sorting_proof,
 * verifiable_poker_solver, weather_feed) used to serve a ZEROED placeholder
 * (pi_a=["0","0","0"], ...) that can NEVER verify against its vkey, yet the manifest
 * advertised it. A served demo_proof that cannot verify is a false artifact. This gate REDs
 * the build if any served demo_proof.json fails to verify against its paired vkey, so a
 * dead/placeholder proof can never be re-introduced.
 *
 * Two verification tiers (fail-closed in BOTH):
 *   (A) structural soundness (ALWAYS, pure node, no deps): the proof must be shaped like a real
 *       Groth16 proof AND must not be degenerate. A Groth16 proof whose group elements pi_a /
 *       pi_c / pi_b are the all-zero point (point at infinity) can NEVER satisfy the pairing
 *       equation, so it is rejected outright. Missing/misshaped proof or publicSignals are
 *       rejected. This catches the exact placeholder-regression class in EVERY environment,
 *       including the pure-node registry CI job that has no snarkjs.
 *   (B) real Groth16 verify (WHEN snarkjs resolves, e.g. local `npm ci` in zk/ or the zk-prove
 *       CI job): runs snarkjs.groth16.verify(vkey, publicSignals, proof) and REDs on `false`.
 *       This is the gold-standard cryptographic check. If snarkjs is not installed the gate does
 *       NOT claim it ran a full verify - it reports "structural-only" honestly and still fails
 *       closed on any degenerate proof.
 *
 * Kaspa has no on-chain pairing verifier; Groth16 is verified off-chain. This gate only asserts
 * the served demo proofs are internally consistent and verifiable; it does not certify the
 * (disclosed single-contributor DEV) trusted setup.
 *
 * Run: node zk/scripts/check_demo_proofs.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const SERVED = path.join(ROOT, "frontend/public/zk");

// BN254 (alt_bn128) scalar field order - public signals must reduce mod r.
const BN254_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let snark = null;
try {
  snark = require("snarkjs");
} catch (_) {
  snark = null; // pure-node registry job: no snarkjs. Structural tier still runs (fail-closed).
}

function isDecStr(x) {
  return typeof x === "string" && /^[0-9]+$/.test(x);
}
function isZero(x) {
  // a field/group coordinate that is exactly zero (as string or number)
  return x === "0" || x === 0 || x === "0x0";
}

// A real Groth16 proof from snarkjs has:
//   pi_a: [x, y, z]            (z is the projective "1"; [0,0,0] is the point at infinity)
//   pi_b: [[x0,x1],[y0,y1],[z0,z1]]
//   pi_c: [x, y, z]
// Return an error string if the proof is misshaped OR degenerate (can never verify), else null.
function structuralReject(proof, publicSignals) {
  if (!proof || typeof proof !== "object") return "proof missing or not an object";
  const { pi_a, pi_b, pi_c } = proof;
  if (!Array.isArray(pi_a) || pi_a.length < 3) return "pi_a is not a 3-element array";
  if (!Array.isArray(pi_c) || pi_c.length < 3) return "pi_c is not a 3-element array";
  if (!Array.isArray(pi_b) || pi_b.length < 3 || !pi_b.every((r) => Array.isArray(r) && r.length >= 2))
    return "pi_b is not a 3x2 array";

  // Degenerate: any of the three group elements is the all-zero point (point at infinity).
  // Groth16's verify pairing e(A,B) == e(alpha,beta)*e(vk_x,gamma)*e(C,delta) can never hold
  // when A, B, or C is the identity in this way - the zeroed placeholder is exactly this.
  const aZero = pi_a[0] !== undefined && isZero(pi_a[0]) && isZero(pi_a[1]);
  const cZero = pi_c[0] !== undefined && isZero(pi_c[0]) && isZero(pi_c[1]);
  const bZero =
    isZero(pi_b[0][0]) && isZero(pi_b[0][1]) && isZero(pi_b[1][0]) && isZero(pi_b[1][1]);
  if (aZero || bZero || cZero)
    return "degenerate proof: a point-at-infinity group element (all-zero) can never verify";

  if (!Array.isArray(publicSignals)) return "publicSignals is not an array";
  if (publicSignals.length < 1) return "publicSignals is empty";
  for (const s of publicSignals) {
    if (!isDecStr(String(s))) return `publicSignals contains a non-decimal value: ${JSON.stringify(s)}`;
    if (BigInt(String(s)) >= BN254_R) return `publicSignals value >= BN254 field order (unreducible): ${s}`;
  }
  return null;
}

function loadVkey(id, dir) {
  for (const n of [`${id}_vkey.json`, "verification_key.json"]) {
    const p = path.join(dir, n);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return null;
}

async function main() {
  if (!fs.existsSync(SERVED)) {
    console.error(`check-demo-proofs: served dir not found: ${SERVED}`);
    process.exit(2);
  }
  const dirs = fs
    .readdirSync(SERVED, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let bad = 0;
  let checked = 0;
  let realVerified = 0;
  const mode = snark ? "structural + real snarkjs.groth16.verify" : "structural-only (snarkjs not installed)";

  for (const id of dirs) {
    const dir = path.join(SERVED, id);
    const dp = path.join(dir, "demo_proof.json");
    if (!fs.existsSync(dp)) continue; // vkey-only circuits serve no demo proof - fine.
    checked++;

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(dp, "utf8"));
    } catch (e) {
      console.error(`FAIL ${id}: demo_proof.json is not valid JSON (${e.message})`);
      bad++;
      continue;
    }
    const { proof, publicSignals } = parsed;

    // Tier A: structural soundness (always).
    const sErr = structuralReject(proof, publicSignals);
    if (sErr) {
      console.error(`FAIL ${id}: served demo_proof cannot verify - ${sErr}`);
      bad++;
      continue;
    }

    // Tier B: real cryptographic verify against the paired vkey (when snarkjs is available).
    const vkey = loadVkey(id, dir);
    if (!vkey) {
      console.error(`FAIL ${id}: served demo_proof but NO served vkey to verify it against`);
      bad++;
      continue;
    }
    if (snark) {
      let ok = false;
      try {
        ok = await snark.groth16.verify(vkey, publicSignals.map(String), proof);
      } catch (e) {
        console.error(`FAIL ${id}: snarkjs.groth16.verify threw (${e.message.split("\n")[0]})`);
        bad++;
        continue;
      }
      if (ok !== true) {
        console.error(`FAIL ${id}: served demo_proof did NOT verify against its served vkey`);
        bad++;
        continue;
      }
      realVerified++;
    }
  }

  if (bad) {
    console.error(
      `\ncheck-demo-proofs: ${bad} served demo_proof(s) do not verify against their vkey (mode: ${mode}).`
    );
    console.error("A served demo_proof must be a proof that verifies. Delete it (and drop its manifest link) if the circuit is vkey-only / not provable.");
    process.exit(1);
  }
  console.log(
    `check-demo-proofs: OK (${checked} served demo_proof(s) checked; ${realVerified} cryptographically verified; mode: ${mode}).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("check-demo-proofs fatal:", (e && e.stack) || e);
  process.exit(1);
});
