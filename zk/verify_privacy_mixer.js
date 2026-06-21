#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

// Load the vkey that PAIRS with the zkey real provers actually use. The committed,
// SERVED frontend artifact (frontend/public/zk/privacy_mixer_v1/) is the single source of
// truth; the old zk/ root + privacy_mixer/output paths are gitignored and absent in a clean
// checkout, so the verifier loaded NOTHING and rejected every real proof. Same fix as
// verify.js:19 / verify_range.js:20 / verify_poker_vrf_deal.js:13-17.
const VKEY_CANDIDATES = [
    path.join(__dirname, "..", "frontend", "public", "zk", "privacy_mixer_v1", "privacy_mixer_v1_vkey.json"),
    path.join(__dirname, "privacy_mixer_v1_vkey.json"),
    path.join(__dirname, "privacy_mixer/output/privacy_mixer_v1_vkey.json"),
];
const VKEY_PATH = VKEY_CANDIDATES.find((p) => fs.existsSync(p)) || VKEY_CANDIDATES[0];

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