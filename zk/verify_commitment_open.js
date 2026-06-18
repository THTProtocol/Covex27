#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * verify_commitment_open.js — STRICT Groth16 verifier for commitment_open (Covex27).
 * Fail-closed: real snarkjs.groth16.verify against the SERVED vkey; ANY failure or throw
 * returns {valid:false}. NO attested fallback. Mirrors verify_nullifier_set.js.
 */
// Served, committed, deploy-refreshed vkey (single source of truth). zk/ root *_vkey.json are
// gitignored -> never refreshed by deploy, so a stale root key silently rejects valid proofs.
const VKEY_PATH = path.join(__dirname, "../frontend/public/zk/commitment_open/commitment_open_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_commitment_open.js <proof.json>" }));
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
        console.log(JSON.stringify({ valid, publicSignals, circuit: "commitment_open" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
