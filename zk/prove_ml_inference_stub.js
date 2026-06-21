#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "ml_inference_stub_js/ml_inference_stub.wasm");
const ZKEY = path.join(__dirname, "ml_inference_stub.zkey");
const OUT = path.join(__dirname, "ml_inference_stub_proof.json");

async function main() {
    // Single-neuron linear model: claimedOutput should equal modelWeight*privateInput + bias.
    // Valid demo: 3*42 + 5 = 131. Pass a wrong claimedOutput (arg 5) to exercise the false case.
    const privateInput = process.argv[2] || "42";
    const modelWeight = process.argv[3] || "3";
    const bias = process.argv[4] || "5";
    const claimedOutput = process.argv[5] || "131";
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[6] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";
    const input = { privateInput, modelWeight, bias, claimedOutput, covenantId };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });