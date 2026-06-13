#!/usr/bin/env node
// verify_range.js — Hybrid Groth16 verifier for Range Proof (Covex27)
// Usage: node verify_range.js <proof_file.json> [circuit_name]
//
// Hybrid pattern:
//   - If range_proof_vkey.json + full proof body present → real snarkjs.groth16.verify
//   - Else → clean attested success (for oracle requested_outcome / off-chain results)
//
// Keeps compatibility with pluggable oracle, E2E, covenant-helper, etc.

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = path.join(__dirname, "range_proof", "range_proof_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    const circuit = process.argv[3] || "range_proof";
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_range.js <proof.json> [circuit]" }));
        process.exit(1);
    }

    let data;
    try { data = JSON.parse(fs.readFileSync(proofFile, "utf8")); } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message }));
        process.exit(1);
    }

    const hasFullBody = !!(data.proof && (data.proof.pi_a || data.proof.A) || data.pi_a || data.A);

    if (fs.existsSync(VKEY_PATH) && hasFullBody) {
        // A real proof body is present AND we have a verifying key: the groth16
        // result is AUTHORITATIVE. Fail closed - a proof that does not verify (or
        // throws) is REJECTED, never soft-passed through to the attested branch.
        try {
            const { proof, publicSignals } = data;
            const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
            const valid = await snarkjs.groth16.verify(vkey, publicSignals || data.publicSignals, proof);
            if (valid) {
                console.log(JSON.stringify({ valid: true, publicSignals: publicSignals || data.publicSignals, circuit, note: "real groth16 range_proof" }));
                process.exit(0);
            }
            console.log(JSON.stringify({ valid: false, circuit, error: "groth16 verification failed: proof rejected" }));
            process.exit(1);
        } catch (e) {
            console.log(JSON.stringify({ valid: false, circuit, error: "groth16 verify error: " + (e && e.message ? e.message : String(e)) }));
            process.exit(1);
        }
    }

    // FAIL CLOSED. range_proof is StrictGroth16, so a request with no verifying key or no
    // Groth16 proof body must be REJECTED, never soft-passed to an attested success -
    // otherwise a caller mints a "verified" range outcome with an empty proof.
    console.log(JSON.stringify({
        valid: false,
        circuit,
        error: fs.existsSync(VKEY_PATH)
            ? "no Groth16 proof body supplied (a real proof is required; empty proofs are rejected)"
            : "missing verifying key " + VKEY_PATH,
    }));
    process.exit(1);
}
main();
