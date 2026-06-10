#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "auction_clearing_js/auction_clearing.wasm");
const ZKEY = path.join(__dirname, "auction_clearing.zkey");
const OUT = path.join(__dirname, "auction_clearing_proof.json");

async function main() {
    const highestBid = process.argv[2] || "5000";
    const secondBid = process.argv[3] || "4500";
    const reserve = process.argv[4] || "4000";
    const clearPrice = process.argv[5] || "4800";
    const input = { highestBid, secondBid, reserve, clearPrice, valid: "1" };
    const wtns = path.join(__dirname, ".wtns.ac.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });