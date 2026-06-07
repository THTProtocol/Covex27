#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = fs.existsSync(path.join(__dirname, "privacy_mixer_v1_vkey.json"))
    ? path.join(__dirname, "privacy_mixer_v1_vkey.json")
    : path.join(__dirname, "privacy_mixer/output/privacy_mixer_v1_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_privacy_mixer.js <proof.json>" }));
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
        // Public signal order: [mixer_valid, merkle_root, nullifier, recipient_hash, amount_commitment, min_amount, max_amount]
        const mixerValid = publicSignals[0] === "1";
        console.log(JSON.stringify({ valid: valid && mixerValid, publicSignals, circuit: "privacy_mixer_v1" }));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message || String(e) }));
    }
    process.exit(0);
}
main();