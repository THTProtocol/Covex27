#!/usr/bin/env node
// verify_range.js — Standalone Groth16 verifier for Range Proof (Phase 12)
// Usage: node verify_range.js <proof_file.json>
// Reads { proof, publicSignals } from JSON file, verifies against range_proof_vkey.json
// Returns JSON: { valid: true/false, error: "..." } to stdout

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = path.join(__dirname, "range_proof", "range_proof_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ 
            valid: false, 
            error: "Usage: node verify_range.js <proof.json>" 
        }));
        process.exit(1);
    }

    if (!fs.existsSync(VKEY_PATH)) {
        console.log(JSON.stringify({ 
            valid: false, 
            error: "Range proof vkey not found at " + VKEY_PATH + 
                   ". Full zkey generation is still pending (Phase 12). " +
                   "This verifier is ready — just needs the vkey from ceremony." 
        }));
        process.exit(0);
    }

    try {
        const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        
        console.log(JSON.stringify({ 
            valid, 
            publicSignals,
            circuit: "range_proof",
            note: valid ? "Proof verified successfully" : "Proof is invalid"
        }));
    } catch (e) {
        console.log(JSON.stringify({ 
            valid: false, 
            error: e.message || String(e) 
        }));
    }
    process.exit(0);
}

main();