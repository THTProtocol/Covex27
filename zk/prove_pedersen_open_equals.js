#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_pedersen_open_equals.js - real Groth16 proof for pedersen_open_equals (Covex27).
// Prove the hidden value behind a public commitment equals a public `expected`. Public:
// commitment, expected, covenantId. valid (publicSignals[0]) == 1 iff value == expected.
// Usage: node prove_pedersen_open_equals.js [out] [covenantId] [--false]
//   --false : pass expected != committed value -> VERIFYING proof with valid==0.
const ID = "pedersen_open_equals";
const SERVED = path.join(__dirname, "../frontend/public/zk", ID);
const WASM = path.join(SERVED, `${ID}.wasm`);
const ZKEY = path.join(SERVED, `${ID}_final.zkey`);

async function main() {
    const outArg = process.argv[2] || path.join(__dirname, `${ID}_proof.json`);
    const covenantId = (process.argv[3] || "11111111111111111111").toString();
    const wantFalse = process.argv.includes("--false");

    const value = "42";
    const salt = "987654321";
    const commitment = await hash([value, salt]); // public commitment binds value+salt

    // expected matches the committed value in the honest case; differs in the false case.
    const expected = wantFalse ? "43" : "42";

    const input = { commitment, expected, covenantId, value, salt };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    fs.writeFileSync(outArg, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", outArg, "valid(publicSignals[0]):", publicSignals[0], "all:", JSON.stringify(publicSignals));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
