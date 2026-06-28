#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_sorted_merkle_range.js - real Groth16 proof for sorted_merkle_range (Covex27).
// Order-preserving membership: a hidden value is a member of a SORTED depth-4 Merkle set AND
// respects prev <= value <= next for its committed neighbours. Public: root, neighborCommit,
// covenantId. valid (publicSignals[0]) == 1 iff member AND in sorted position.
// Usage: node prove_sorted_merkle_range.js [out] [covenantId] [--false]
//   --false : prove a member whose neighbour band does NOT contain it (out-of-order claim) ->
//             VERIFYING proof with valid==0 (membership holds, sort invariant fails).
const ID = "sorted_merkle_range";
const DEPTH = 4;
const SERVED = path.join(__dirname, "../frontend/public/zk", ID);
const WASM = path.join(SERVED, `${ID}.wasm`);
const ZKEY = path.join(SERVED, `${ID}_final.zkey`);

async function main() {
    const outArg = process.argv[2] || path.join(__dirname, `${ID}_proof.json`);
    const covenantId = (process.argv[3] || "11111111111111111111").toString();
    const wantFalse = process.argv.includes("--false");

    // 16 SORTED values 100, 200, ..., 1600 -> leaves Poseidon(value).
    const values = [];
    for (let i = 0; i < 16; i++) values.push(BigInt(100 * (i + 1)));
    const leaves = [];
    for (let i = 0; i < 16; i++) leaves.push(BigInt(await hash([values[i].toString()])));
    let level = leaves.slice();
    const levels = [level];
    for (let d = 0; d < DEPTH; d++) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(BigInt(await hash([level[i].toString(), level[i + 1].toString()])));
        levels.push(next); level = next;
    }
    const root = levels[DEPTH][0];

    // Prove membership of the value at index 6 (== 700), neighbours at indices 5 (600) and 7 (800).
    const idx = 6;
    const value = values[idx];
    let prev = values[idx - 1]; // 600
    let next = values[idx + 1]; // 800

    if (wantFalse) {
        // Keep the SAME member value (700, genuinely in the tree) but commit to a neighbour band
        // ABOVE it: prev=900, next=1000. Then prev <= value is FALSE (900 <= 700 is false) ->
        // valid==0, while membership + neighbourCommit binding still hold -> the proof VERIFIES.
        prev = values[8];  // 900
        next = values[9];  // 1000
    }

    const neighborCommit = await hash([prev.toString(), next.toString()]);

    const pathElements = [], pathIndices = [];
    let pos = idx;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2;
        pathElements.push(levels[d][isRight ? pos - 1 : pos + 1].toString());
        pathIndices.push(isRight ? "1" : "0");
        pos = Math.floor(pos / 2);
    }

    const input = {
        root: root.toString(),
        neighborCommit,
        covenantId,
        value: value.toString(),
        prev: prev.toString(),
        next: next.toString(),
        pathElements,
        pathIndices,
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    fs.writeFileSync(outArg, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", outArg, "valid(publicSignals[0]):", publicSignals[0], "all:", JSON.stringify(publicSignals));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
