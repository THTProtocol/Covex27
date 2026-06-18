#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_commitment_open.js — generate a real Groth16 proof for commitment_open (Covex27)
// Public: commitment = Poseidon(value, blinding), covenantId. Private: value, blinding.
// Usage: node prove_commitment_open.js [value] [blinding] [covenantId]
const WASM = path.join(__dirname, "commitment_open_js/commitment_open.wasm");
const ZKEY = path.join(__dirname, "commitment_open.zkey");
const OUT = path.join(__dirname, "commitment_open_proof.json");

async function main() {
    const value = BigInt(process.argv[2] || "1234567890");
    const blinding = BigInt(process.argv[3] || "987654321");
    // Demo covenantId. The in-browser prover injects covenantFieldElement(covenant_id) instead.
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    const commitment = await hash([value.toString(), blinding.toString()]);

    const input = {
        commitment,
        covenantId,
        value: value.toString(),
        blinding: blinding.toString(),
    };
    const wtns = path.join(__dirname, ".wtns_commitment_open.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
