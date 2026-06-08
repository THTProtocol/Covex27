#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "poker_equity_js/poker_equity.wasm");
const ZKEY = path.join(__dirname, "poker_equity.zkey");
const OUT = path.join(__dirname, "poker_equity_proof.json");

async function main() {
    const input = {
        hole1: process.argv[2] || "14",
        hole2: process.argv[3] || "27",
        boardHash: process.argv[4] || "999001",
        equity: process.argv[5] || "650",
        valid: "1",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });