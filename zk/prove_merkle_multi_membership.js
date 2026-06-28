#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_merkle_multi_membership.js - real Groth16 proof for merkle_multi_membership (Covex27).
// K=3 hidden leaves all in ONE depth-4 Merkle root. Public: root, covenantId. valid
// (publicSignals[0]) == 1 iff every leaf's path matches root.
// Usage: node prove_merkle_multi_membership.js [out] [covenantId] [--false]
//   --false : prove with one leaf OUTSIDE the tree -> a VERIFYING proof carrying valid==0.
// Proves against the SERVED wasm + _final.zkey (the committed source of truth).
const ID = "merkle_multi_membership";
const DEPTH = 4, K = 3;
const SERVED = path.join(__dirname, "../frontend/public/zk", ID);
const WASM = path.join(SERVED, `${ID}.wasm`);
const ZKEY = path.join(SERVED, `${ID}_final.zkey`);

async function buildTree(leafValues) {
    // 16-leaf tree; leaf = Poseidon(value).
    const leaves = [];
    for (let i = 0; i < 16; i++) leaves.push(BigInt(await hash([leafValues[i].toString()])));
    let level = leaves.slice();
    const levels = [level];
    for (let d = 0; d < DEPTH; d++) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(BigInt(await hash([level[i].toString(), level[i + 1].toString()])));
        levels.push(next); level = next;
    }
    return levels;
}
function pathOf(levels, idx) {
    const pathElements = [], pathIndices = [];
    let pos = idx;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2;
        pathElements.push(levels[d][isRight ? pos - 1 : pos + 1].toString());
        pathIndices.push(isRight ? "1" : "0");
        pos = Math.floor(pos / 2);
    }
    return { pathElements, pathIndices };
}

async function main() {
    const outArg = process.argv[2] || path.join(__dirname, `${ID}_proof.json`);
    const covenantId = (process.argv[3] || "11111111111111111111").toString();
    const wantFalse = process.argv.includes("--false");

    // 16 member values 100..1600; the claimant holds leaves at indices 2, 7, 11.
    const memberValues = [];
    for (let i = 0; i < 16; i++) memberValues.push(BigInt(100 * (i + 1)));
    const levels = await buildTree(memberValues);
    const root = levels[DEPTH][0];

    const idxs = [2, 7, 11];
    const leaf = idxs.map((i) => memberValues[i].toString());
    const pathElements = [], pathIndices = [];
    for (const i of idxs) { const p = pathOf(levels, i); pathElements.push(p.pathElements); pathIndices.push(p.pathIndices); }

    if (wantFalse) {
        // Replace the 3rd leaf VALUE with one NOT in the tree, keep its (now wrong) path. The
        // recomputed root for leaf 3 will differ from `root`, so match[2]==0 -> valid==0, yet the
        // proof still VERIFIES (it is a true statement about a non-member -> valid 0).
        leaf[2] = "999999999"; // not among memberValues
    }

    const input = { root: root.toString(), covenantId, leaf, pathElements, pathIndices };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    fs.writeFileSync(outArg, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", outArg, "valid(publicSignals[0]):", publicSignals[0], "all:", JSON.stringify(publicSignals));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
