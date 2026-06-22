#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "loan_health_js/loan_health.wasm");
const ZKEY = path.join(__dirname, "loan_health.zkey");
const OUT = path.join(__dirname, "loan_health_proof.json");

async function main() {
    // valid == 1 iff collateral * liqThreshold >= debt * 100
    const collateral = process.argv[2] || "150000";
    const debt = process.argv[3] || "80000";
    const liqThreshold = process.argv[4] || "150";
    const covenantId = process.argv[5] || "42";
    const input = { collateral, debt, liqThreshold, covenantId };
    const wtns = path.join(__dirname, ".wtns.lh.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
