#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "black_scholes_approx_js/black_scholes_approx.wasm");
const ZKEY = path.join(__dirname, "black_scholes_approx.zkey");
const OUT = path.join(__dirname, "black_scholes_approx_proof.json");

// Public signals: spot, strike, price, covenantId
//   intrinsic = max(spot - strike, 0)
//   valid == 1 iff price >= intrinsic AND price <= spot
async function main() {
    const input = {
        spot: process.argv[2] || "1000000",
        strike: process.argv[3] || "950000",
        price: process.argv[4] || "120000",   // intrinsic = 50000, so 50000 <= 120000 <= 1000000 -> valid
        covenantId: process.argv[5] || "424242",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
