#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");

async function verifyGroth16Hybrid({ proofFile, vkeyPath, circuit, argv }) {
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: `Usage: node ${argv} <proof.json> [circuit]` }));
        process.exit(1);
    }
    let data;
    try {
        data = JSON.parse(fs.readFileSync(proofFile, "utf8"));
    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message }));
        process.exit(1);
    }
    const proof = data.proof || data;
    const hasFullBody = !!(proof && (proof.pi_a || proof.A));
    if (fs.existsSync(vkeyPath) && hasFullBody) {
        // Real proof body + verifying key present: the groth16 result is
        // AUTHORITATIVE. Fail closed - a proof that does not verify (or throws)
        // is REJECTED, never soft-passed through to the attested branch.
        try {
            const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
            const valid = await snarkjs.groth16.verify(vkey, data.publicSignals || [], proof);
            if (valid) {
                console.log(JSON.stringify({
                    valid: true,
                    publicSignals: data.publicSignals,
                    circuit,
                    note: `real groth16 ${circuit}`,
                }));
                process.exit(0);
            }
            console.log(JSON.stringify({ valid: false, circuit, error: `groth16 verification failed: ${circuit} proof rejected` }));
            process.exit(1);
        } catch (e) {
            console.log(JSON.stringify({ valid: false, circuit, error: `groth16 verify error: ${e && e.message ? e.message : String(e)}` }));
            process.exit(1);
        }
    }
    // FAIL CLOSED. This shared verifier is only invoked for circuits the oracle treats as
    // StrictGroth16 (Hybrid circuits are auto-attested in the Rust layer BEFORE this script
    // runs), so a request with no Groth16 proof body - or with no verifying key on disk -
    // must be REJECTED, never soft-passed to an attested success. Otherwise a caller mints
    // a "verified" outcome by submitting an empty proof.
    console.log(JSON.stringify({
        valid: false,
        circuit,
        error: hasFullBody
            ? `missing verifying key for ${circuit}`
            : `no Groth16 proof body supplied for ${circuit} (a real proof is required; empty proofs are rejected)`,
    }));
    process.exit(1);
}

module.exports = { verifyGroth16Hybrid };