#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * verify_onchain_sig.js — Phase 3 stub (Covex)
 * For "onchain_sig_verify". Hybrid: if full Groth16 body present run snarkjs, else attested success.
 */
const VKEY_PATH = path.join(__dirname, "onchain_sig_verify_vkey.json");

async function main() {
    const proofFile = process.argv[2];
    if (!proofFile) {
        console.log(JSON.stringify({ valid: false, error: "Usage: node verify_onchain_sig.js <proof.json>" }));
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(proofFile));
    const proof = data.proof || data;
    const publicSignals = data.publicSignals || data.public_inputs || [];

    // If real vkey + pi_a etc present, verify; else (dev/attested) accept when requested_outcome was provided upstream.
    if (fs.existsSync(VKEY_PATH) && proof.pi_a) {
        try {
            const vkey = JSON.parse(fs.readFileSync(VKEY_PATH));
            const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
            console.log(JSON.stringify({ valid: !!ok }));
            return;
        } catch (e) {
            console.log(JSON.stringify({ valid: false, error: e.message }));
            return;
        }
    }
    // SECURITY (C1 hygiene): NO real vkey + Groth16 body means this is NOT a
    // cryptographic verification. Fail closed (mirror verify_attested.js) so the
    // oracle can never mint a signature off this script without a real proof that
    // actually verifies. A truthy verdict is returned ONLY by snarkjs.groth16.verify above.
    console.log(JSON.stringify({ valid: false, error: "onchain_sig stub: no full Groth16 vkey/proof present; not a cryptographic verifier" }));
}
main().catch(e => { console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1); });
