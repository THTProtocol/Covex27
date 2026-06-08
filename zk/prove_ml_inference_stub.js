#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "ml_inference_stub_js/ml_inference_stub.wasm");
const ZKEY = path.join(__dirname, "ml_inference_stub.zkey");
const OUT = path.join(__dirname, "ml_inference_stub_proof.json");

async function main() {
    const input = {
        privateInput: process.argv[2] || "42",
        modelWeight: process.argv[3] || "3",
        claimedOutput: process.argv[4] || "126",
        valid: "1",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch((e) => { console.error(e); process.exit(1); });