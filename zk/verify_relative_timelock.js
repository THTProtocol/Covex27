#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * verify_relative_timelock.js — basic snarkjs Groth16 verifier stub (Covex27)
 * Usage: node verify_relative_timelock.js <proof.json>
 * References vision doc Phase 1 relative timelock + range on DAA.
 * vkey expected at relative_timelock_vkey.json (top, like timelock_absolute_vkey.json)
 */
// Load the committed, deploy-refreshed served vkey (single source of truth). The zk/ root
// *_vkey.json are gitignored, so `git reset --hard` on deploy never refreshes them -> a stale
// root key silently rejects valid proofs (the P0 oracle incident, fixed in a8918b8). Verified
// the served vkey verifies this circuit's committed demo proof.
const VKEY_PATH = path.join(__dirname, "../frontend/public/zk/relative_timelock/relative_timelock_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_relative_timelock.js <proof.json>" }));
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
        console.log(JSON.stringify({ valid, publicSignals, circuit: "relative_timelock" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
