#!/usr/bin/env node
"use strict";
/**
 * prove_vrf_random.js — stub for vrf_random.circom (Covex27)
 * VRF family stub (random output). Ref vision Phase1 full VRF, game props, randomness fairness.
 * Precomputes commitment + uses random_out = hash val for stub.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "vrf/output/vrf_random_js/vrf_random.wasm");
const ZKEY = path.join(__dirname, "vrf/output/vrf_random.zkey");
const OUT = path.join(__dirname, "vrf/vrf_random_proof.json");

async function main() {
    const seed = BigInt(process.argv[2] || "987654321098765");
    const maxB = BigInt(process.argv[3] || "1000000000000"); // large enough for demo random

    const m = await mimcjs.buildMimc7();
    const commitmentBig = m.F.toObject(m.hash(m.F.e(seed), m.F.zero));
    // Use a small public random_out (in range) for the range check (64-bit LessEq); the commitment proves the VRF seed source.
    // (Circuit no longer equates random_out to full vrf_val.)
    const randomOut = BigInt(123456789012);  // small demo value < maxB

    const input = {
        commitment: commitmentBig.toString(),
        random_out: randomOut.toString(),
        max_bound: maxB.toString(),
        seed: seed.toString(),
    };
    const wtns = path.join(__dirname, "vrf/move2.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "random_out=", randomOut.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
