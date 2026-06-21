#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "financial_formula_js/financial_formula.wasm");
const ZKEY = path.join(__dirname, "financial_formula.zkey");
const OUT = path.join(__dirname, "financial_formula_proof.json");

// Args: principal rate periods covenantId [computedOverride]
// computed defaults to the CORRECT simple-interest value:
//   computed = principal * (10000 + rate*periods) / 10000   (integer; choose inputs so it divides)
// Pass a 5th arg to FORCE a wrong `computed` (false case) - the proof stays
// cryptographically valid but publicSignals[0] (valid) must be 0.
async function main() {
    const principal = process.argv[2] || "10000";
    const rate = process.argv[3] || "500";      // 5.00% in bps
    const periods = process.argv[4] || "2";
    const covenantId = process.argv[5] || "123456789";
    const correct = (BigInt(principal) * (10000n + BigInt(rate) * BigInt(periods)) / 10000n).toString();
    const computed = process.argv[6] || correct;
    const input = { principal, rate, periods, computed, covenantId };
    console.log("input:", JSON.stringify(input), "correct computed:", correct);
    const wtns = path.join(__dirname, ".wtns.ff.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
