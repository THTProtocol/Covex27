#!/usr/bin/env node
// verify_chess.js — Groth16 verifier for chess_v1 (Covex27 / Kaspa oracle path)
// Usage: node verify_chess.js <proof_file.json>

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = fs.existsSync(path.join(__dirname, "chess_v1_vkey.json"))
    ? path.join(__dirname, "chess_v1_vkey.json")
    : path.join(__dirname, "games/chess/output/chess_v1_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_chess.js <proof.json>" }));
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
        console.log(JSON.stringify({ valid, publicSignals }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}

main();