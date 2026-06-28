#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * verify_threshold_sig_knowledge.js - STRICT Groth16 verifier for threshold_sig_knowledge (Covex27).
 * Fail-closed: real snarkjs.groth16.verify against the SERVED vkey; ANY failure or throw
 * returns {valid:false}. NO attested fallback. Mirrors verify_solvency_sum.js.
 */
const VKEY_PATH = path.join(__dirname, "../frontend/public/zk/threshold_sig_knowledge/threshold_sig_knowledge_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_threshold_sig_knowledge.js <proof.json>" }));
        process.exit(1);
    }
    if (!fs.existsSync(VKEY_PATH)) {
        console.log(JSON.stringify({ valid: false, error: `Missing vkey at ${VKEY_PATH}` }));
        process.exit(1);
    }
    try {
        const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        console.log(JSON.stringify({ valid, publicSignals, circuit: "threshold_sig_knowledge" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
