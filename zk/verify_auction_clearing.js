#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * SECURITY (C1): Real, FAIL-CLOSED Groth16 verifier for auction_clearing.
 *
 * The previous version was hybrid/fail-OPEN: when the proof body, vkey, or snarkjs
 * verify check were missing OR returned false, it fell through to an unconditional
 * {valid:true} "attested" stub. That let anyone mint a valid oracle signature with a
 * bodyless / bogus proof. This rewrite mirrors the sound pattern in verify_connect4.js:
 * it runs the REAL snarkjs.groth16.verify and prints {valid:false,...} on a false result,
 * on any thrown exception, and when the vkey file is missing. It NEVER prints an
 * unconditional valid:true.
 */
// A real committed vkey lives under frontend/public/zk/<name>/. Fall back to a local
// zk/<name>_vkey.json if one is ever placed alongside this script. If neither exists we
// FAIL CLOSED below.
const VKEY_CANDIDATES = [
    path.join(__dirname, "auction_clearing_vkey.json"),
    path.join(__dirname, "..", "frontend", "public", "zk", "auction_clearing", "auction_clearing_vkey.json"),
];
const VKEY_PATH = VKEY_CANDIDATES.find((p) => fs.existsSync(p));

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_auction_clearing.js <proof.json>" }));
        process.exit(0);
    }
    if (!VKEY_PATH) {
        console.log(JSON.stringify({ valid: false, error: "Missing auction_clearing vkey (fail closed)" }));
        process.exit(0);
    }
    try {
        const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        console.log(JSON.stringify({ valid, publicSignals, circuit: "auction_clearing" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
