#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_commit_reveal_timed.js - generate a real Groth16 proof for commit_reveal_timed.
// Public: commitment = Poseidon(value, salt), covenantId. Private: value, salt.
// Usage: node prove_commit_reveal_timed.js [value] [salt] [covenantId]
const WASM = path.join(__dirname, "commit_reveal_timed_js/commit_reveal_timed.wasm");
const ZKEY = path.join(__dirname, "commit_reveal_timed.zkey");
const OUT = path.join(__dirname, "commit_reveal_timed_proof.json");

async function main() {
    const value = BigInt(process.argv[2] || "424242424242");
    const salt = BigInt(process.argv[3] || "9876543210987654321");
    // Demo covenantId. The in-browser prover injects covenantFieldElement(covenant_id) instead.
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    const commitment = await hash([value.toString(), salt.toString()]);

    const input = {
        commitment,
        covenantId,
        value: value.toString(),
        salt: salt.toString(),
    };
    const wtns = path.join(__dirname, ".wtns_commit_reveal_timed.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
