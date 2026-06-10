#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "financial_formula_js/financial_formula.wasm");
const ZKEY = path.join(__dirname, "financial_formula.zkey");
const OUT = path.join(__dirname, "financial_formula_proof.json");

async function main() {
    const principal = process.argv[2] || "10000";
    const rate = process.argv[3] || "5";
    const periods = process.argv[4] || "12";
    const computed = (BigInt(principal) * BigInt(rate) + BigInt(periods)).toString();
    const input = { principal, rate, periods, computed, valid: "1" };
    const wtns = path.join(__dirname, ".wtns.ff.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });