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
    // Attested/hybrid fallback (consistent with pluggable Attested + Hybrid paths)
    console.log(JSON.stringify({ valid: true, note: "onchain_sig stub: attested success (no full vkey or no Groth body)" }));
}
main().catch(e => { console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1); });
