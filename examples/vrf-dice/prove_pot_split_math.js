#!/usr/bin/env node
"use strict";
/**
 * prove_pot_split_math.js — stub for pot_split_math.circom (Covex27)
 * Vision refs: Phase1/2 "pot split verifiable math", game+DeFi pot splits, weighted by VRF/score.
 * Uses cross-mul for proportion proof (no div). See circuit for full inventory refs.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "pot_split/output/pot_split_math_js/pot_split_math.wasm");
const ZKEY = path.join(__dirname, "pot_split/output/pot_split_math.zkey");
const OUT = path.join(__dirname, "pot_split/pot_split_math_proof.json");

async function main() {
    const pot = BigInt(process.argv[2] || "1000000000");
    const p1s = BigInt(process.argv[3] || "60");
    const p2s = BigInt(process.argv[4] || "40");

    // Prover supplies amounts satisfying the math (e.g. from game outcome + pot_split)
    const p1a = (pot * p1s) / 100n;
    const p2a = pot - p1a;

    const input = {
        pot: pot.toString(),
        p1_share: p1s.toString(),
        p2_share: p2s.toString(),
        p1_amount: p1a.toString(),
        p2_amount: p2a.toString(),
    };
    const wtns = path.join(__dirname, "pot_split/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "p1a=", p1a.toString(), "p2a=", p2a.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
