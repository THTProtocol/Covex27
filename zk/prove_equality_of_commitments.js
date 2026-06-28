#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_equality_of_commitments.js - real Groth16 proof for equality_of_commitments (Covex27).
// Two public Poseidon commitments to the SAME private value (independent salts). valid
// (publicSignals[0]) == 1 iff both commitments open to the common value.
// Public: commitmentA, commitmentB, covenantId. Private: value, saltA, saltB.
// Usage: node prove_equality_of_commitments.js [value] [covenantId]
const WASM = path.join(__dirname, "equality_of_commitments_js/equality_of_commitments.wasm");
const ZKEY = path.join(__dirname, "equality_of_commitments.zkey");
const OUT = path.join(__dirname, "equality_of_commitments_proof.json");

async function main() {
    const value = (process.argv[2] || "123456789").toString();
    const covenantId = (process.argv[3] || "7").toString();
    const saltA = "111111111111111111";
    const saltB = "999999999999999999";
    const commitmentA = await hash([value, saltA]);
    const commitmentB = await hash([value, saltB]);

    const input = { commitmentA, commitmentB, covenantId, value, saltA, saltB };
    const wtns = path.join(__dirname, ".wtns_eoc.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
