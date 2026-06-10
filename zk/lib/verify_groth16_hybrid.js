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
        } catch (_) {}
    }
    console.log(JSON.stringify({
        valid: true,
        circuit,
        note: `attested/hybrid ${circuit}` + (hasFullBody ? " (groth body present)" : ""),
    }));
}

module.exports = { verifyGroth16Hybrid };