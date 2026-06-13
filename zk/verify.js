#!/usr/bin/env node
// verify.js — Hybrid Groth16 verifier for merkle_membership (Covex27)
// Usage: node verify.js <proof_file.json> [circuit_name]
//
// Hybrid pattern:
//   - If merkle_membership_vkey.json + full proof body present → real snarkjs.groth16.verify
//   - Else → clean attested success (for oracle requested_outcome / off-chain results)
//
// Keeps compatibility with pluggable oracle, E2E, covenant-helper, etc.

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const VKEY_PATH = path.join(__dirname, "merkle_membership_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    const circuit = process.argv[3] || "merkle_membership";
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify.js <proof.json> [circuit]" }));
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
                console.log(JSON.stringify({ valid: true, publicSignals: publicSignals || data.publicSignals, circuit, note: "real groth16 merkle_membership" }));
                process.exit(0);
            }
            console.log(JSON.stringify({ valid: false, circuit, error: "groth16 verification failed: proof rejected" }));
            process.exit(1);
        } catch (e) {
            console.log(JSON.stringify({ valid: false, circuit, error: "groth16 verify error: " + (e && e.message ? e.message : String(e)) }));
            process.exit(1);
        }
    }

    // FAIL CLOSED. merkle_membership (and its aliases) are StrictGroth16, so a request
    // with no verifying key or no Groth16 proof body must be REJECTED, not soft-passed to
    // an attested success - otherwise a caller mints a "verified" outcome with an empty
    // proof. A real proof is generatable in-browser (the merkle prover ships wasm + zkey).
    const hasBody = !!( (data.proof && (data.proof.pi_a || data.proof.A)) || data.pi_a || data.A );
    console.log(JSON.stringify({
        valid: false,
        circuit,
        error: fs.existsSync(VKEY_PATH)
            ? "no Groth16 proof body supplied (a real proof is required; empty proofs are rejected)"
            : "missing verifying key " + VKEY_PATH,
        had_body: hasBody,
    }));
    process.exit(1);
}
main();
