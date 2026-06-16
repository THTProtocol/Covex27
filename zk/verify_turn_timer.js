#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * SECURITY (C1): Real, FAIL-CLOSED Groth16 verifier for the per-turn timer property (Covex27).
 * Mirrors verify_connect4.js. Prints {valid:false,...} on a false snarkjs result, on any
 * thrown exception, and when the vkey is missing. NEVER prints an unconditional valid:true.
 * (Previous version returned {valid:true} when the vkey or proof body was missing, and on a
 * thrown exception - fail open.)
 */
const VKEY_CANDIDATES = [
    path.join(__dirname, "turn_timer_vkey.json"),
    path.join(__dirname, "..", "frontend", "public", "zk", "turn_timer", "turn_timer_vkey.json"),
];
const VKEY_PATH = VKEY_CANDIDATES.find((p) => fs.existsSync(p));

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_turn_timer.js <proof.json>" }));
        process.exit(0);
    }
    if (!VKEY_PATH) {
        console.log(JSON.stringify({ valid: false, error: "Missing turn_timer vkey (fail closed)" }));
        process.exit(0);
    }
    try {
        const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        console.log(JSON.stringify({ valid, publicSignals, circuit: "turn_timer" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
