#!/usr/bin/env node
// verify_range.js — Phase 9 STUB (not yet active)
//
// This file exists so the oracle wiring surface is clear.
// Once range_proof_final.zkey + range_proof_vkey.json are generated:
//
// 1. Copy/adapt the logic from verify.js
// 2. Point VKEY_PATH at the range vkey
// 3. Update oracle.rs:
//      - verify_script_path_for("range_proof") → "zk/verify_range.js"
//      - Call it from verify_range_proof() instead of the current Err stub
//
// Until then the oracle explicitly refuses range_proof proofs with a helpful message
// (see backend/src/oracle.rs:verify_range_proof_async).
//
// This is the honest Phase 9 state: circuit + docs + example + stub integration points = COMPLETE.
// The expensive artifact (the proving key) is the only remaining piece for live usage.

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = path.join(__dirname, "range_proof_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_range.js <proof.json>  (Phase 9 stub — vkey not present yet)" }));
        process.exit(1);
    }

    if (!fs.existsSync(VKEY_PATH)) {
        console.log(JSON.stringify({
            valid: false,
            error: "Range proof vkey not found. Phase 9 circuit foundation is complete; proving key generation is the post-launch task. See zk/range_proof/ and examples/range-proof/README.md"
        }));
        process.exit(0);
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