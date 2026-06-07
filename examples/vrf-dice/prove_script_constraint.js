#!/usr/bin/env node
"use strict";
/**
 * prove_script_constraint.js — stub for script_constraint.circom (Covex27)
 * Vision: Phase 1 "script constraint proofs (fee caps, shares...)", "Fee & pot math verification"
 * See script_constraints/script_constraint.circom header for full refs.
 * Demo inputs for fee<=max, share, return.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "script_constraints/output/script_constraint_js/script_constraint.wasm");
const ZKEY = path.join(__dirname, "script_constraints/output/script_constraint.zkey");
const OUT = path.join(__dirname, "script_constraints/script_constraint_proof.json");

async function main() {
    const maxFee = BigInt(process.argv[2] || "10");
    const reqShare = BigInt(process.argv[3] || "30");
    const pot = BigInt(process.argv[4] || "100000000");
    const minRet = BigInt(process.argv[5] || "60");

    // witness actuals that should satisfy (prover computes from resolution)
    // fee<=10, share==30, return>=60, total~100 (5+30+65)
    const actualFee = BigInt(5);
    const actualShare = BigInt(30);
    const actualRet = BigInt(65);

    const input = {
        max_fee_pct: maxFee.toString(),
        required_share_pct: reqShare.toString(),
        pot: pot.toString(),
        min_return_pct: minRet.toString(),
        actual_fee_pct: actualFee.toString(),
        actual_share_pct: actualShare.toString(),
        actual_return_pct: actualRet.toString(),
    };
    const wtns = path.join(__dirname, "script_constraints/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
