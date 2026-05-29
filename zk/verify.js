#!/usr/bin/env node
// verify.js — Standalone Groth16 verifier for oracle service
// Usage: node verify.js <proof_file.json>
// Reads { proof, publicSignals } from JSON file, verifies against built-in vkey
// Returns JSON: { valid: true/false, error: "..." } to stdout

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = path.join(__dirname, "merkle_membership_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify.js <proof.json>" }));
        process.exit(1);
    }

    try {
        const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        console.log(JSON.stringify({ valid, publicSignals }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}

main();
