#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * verify_nullifier_set.js — verifier for standalone nullifier_set (Covex27)
 * Double-spend / set non-membership property. Vision inventory 4.1 + privacy.
 */
// Served vkey (committed, deploy-refreshed single source of truth). zk/ root *_vkey.json are
// gitignored -> never refreshed by deploy, so a stale root key silently rejects valid proofs
// (the P0 oracle incident, a8918b8). Verified the served vkey verifies the committed demo proof.
const VKEY_PATH = path.join(__dirname, "../frontend/public/zk/nullifier_set/nullifier_set_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_nullifier_set.js <proof.json>" }));
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
        console.log(JSON.stringify({ valid, publicSignals, circuit: "nullifier_set" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();
