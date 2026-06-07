#!/usr/bin/env node
"use strict";
/**
 * prove_relative_timelock.js — stub for relative_timelock.circom (Covex27)
 *
 * See docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md Phase 1: relative timelock (Kaspa core priority).
 * Uses DAA delta + range check (GreaterEq + LessEq) per task + vision "using range on DAA".
 *
 * Modeled after prove_timelock.js and prove_hash_preimage.js .
 * Run after compilation + zkey: node prove_relative_timelock.js [current] [ref] [delta]
 * Produces relative_timelock/relative_timelock_proof.json (or top level proof).
 * For full: requires artifacts from circom2 + snarkjs groth16 setup using existing pot10_final.ptau .
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "relative_timelock/output/relative_timelock_js/relative_timelock.wasm");
const ZKEY = path.join(__dirname, "relative_timelock/output/relative_timelock.zkey");
const OUT = path.join(__dirname, "relative_timelock/relative_timelock_proof.json");

async function main() {
    const current = BigInt(process.argv[2] || "2000000");
    const reference = BigInt(process.argv[3] || "1000000");
    const minDelta = BigInt(process.argv[4] || "500000");

    const input = {
        current_daa: current.toString(),
        reference_daa: reference.toString(),
        min_relative_delta: minDelta.toString(),
    };
    const wtns = path.join(__dirname, "relative_timelock/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "valid=", publicSignals[publicSignals.length-1] || publicSignals[3]);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
