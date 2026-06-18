#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * verify_anon_membership_nullifier.js — STRICT Groth16 verifier for anon_membership_nullifier (Covex27).
 * Fail-closed: real snarkjs.groth16.verify against the SERVED vkey; ANY failure or throw
 * returns {valid:false}. NO attested fallback. Mirrors verify_nullifier_set.js.
 * NOTE: this script verifies the PROOF only; the oracle separately tracks the spent nullifier
 * set (publicSignals contains the nullifier) to enforce one-person-one-action single use.
 */
const VKEY_PATH = path.join(__dirname, "../frontend/public/zk/anon_membership_nullifier/anon_membership_nullifier_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_anon_membership_nullifier.js <proof.json>" }));
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
        console.log(JSON.stringify({ valid, publicSignals, circuit: "anon_membership_nullifier" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
