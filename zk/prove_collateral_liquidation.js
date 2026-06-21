#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "collateral_liquidation_js/collateral_liquidation.wasm");
const ZKEY = path.join(__dirname, "collateral_liquidation.zkey");
const OUT = path.join(__dirname, "collateral_liquidation_proof.json");

// Prove a position IS liquidatable WITHOUT revealing amounts.
//   valid(out) = 1  iff  debt * 10000 >= threshold * collateral  (LTV at/over liquidation)
async function main() {
    const collateral = process.argv[2] || "100";   // private
    const debt = process.argv[3] || "90";           // private
    const threshold = process.argv[4] || "8500";    // public, liquidation LTV bps
    const covenantId = process.argv[5] || "12345";  // public, H4 replay binding
    const expected = (BigInt(debt) * 10000n >= BigInt(threshold) * BigInt(collateral)) ? "1" : "0";
    const input = { collateral, debt, threshold, covenantId };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "expected valid=", expected, "publicSignals[0]=", publicSignals[0]);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
