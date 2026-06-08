#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "collateral_liquidation_js/collateral_liquidation.wasm");
const ZKEY = path.join(__dirname, "collateral_liquidation.zkey");
const OUT = path.join(__dirname, "collateral_liquidation_proof.json");

async function main() {
    const collateral = process.argv[2] || "100";
    const debt = process.argv[3] || "90";
    const threshold = process.argv[4] || "120";
    const valid = (BigInt(collateral) * 100n < BigInt(debt) * BigInt(threshold)) ? "1" : "0";
    const input = { collateral, debt, threshold, valid };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "valid=", valid);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });