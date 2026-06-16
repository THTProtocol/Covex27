#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * SECURITY (C1): Real, FAIL-CLOSED Groth16 verifier for election_feed.
 * Mirrors verify_connect4.js. Prints {valid:false,...} on a false snarkjs result, on any
 * thrown exception, and when the vkey is missing. NEVER prints an unconditional valid:true.
 * (Previous version fell through to an attested {valid:true} stub on any of those - fail open.)
 */
const VKEY_CANDIDATES = [
    path.join(__dirname, "election_feed_vkey.json"),
    path.join(__dirname, "..", "frontend", "public", "zk", "election_feed", "election_feed_vkey.json"),
];
const VKEY_PATH = VKEY_CANDIDATES.find((p) => fs.existsSync(p));

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_election_feed.js <proof.json>" }));
        process.exit(0);
    }
    if (!VKEY_PATH) {
        console.log(JSON.stringify({ valid: false, error: "Missing election_feed vkey (fail closed)" }));
        process.exit(0);
    }
    try {
        const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        console.log(JSON.stringify({ valid, publicSignals, circuit: "election_feed" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
