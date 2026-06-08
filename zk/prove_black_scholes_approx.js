#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "black_scholes_approx_js/black_scholes_approx.wasm");
const ZKEY = path.join(__dirname, "black_scholes_approx.zkey");
const OUT = path.join(__dirname, "black_scholes_proof.json");

async function main() {
    const input = {
        spot: process.argv[2] || "1000000",
        strike: process.argv[3] || "950000",
        time: process.argv[4] || "365",
        vol: process.argv[5] || "25",
        rate: process.argv[6] || "5",
        price: process.argv[7] || "120000",
        bound: process.argv[8] || "50000",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });