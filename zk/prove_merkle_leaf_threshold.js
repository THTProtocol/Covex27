#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_merkle_leaf_threshold.js - real Groth16 proof for merkle_leaf_threshold (Covex).
// Depth-4 Poseidon Merkle set of leaves Poseidon(account, value). Proves the member leaf is in
// the set AND value >= threshold. Public: root, threshold, covenantId. Output: valid.
// Private: account, value, pathElements[4], pathIndices[4].
// Usage: node prove_merkle_leaf_threshold.js [account] [value] [threshold] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "merkle_leaf_threshold_js/merkle_leaf_threshold.wasm");
const ZKEY = path.join(__dirname, "merkle_leaf_threshold.zkey");
const OUT = path.join(__dirname, "merkle_leaf_threshold_proof.json");

async function main() {
    const account = BigInt(process.argv[2] || "424242424242");
    const value = BigInt(process.argv[3] || "5000");        // e.g. snapshot balance / vote weight
    const threshold = BigInt(process.argv[4] || "1000");    // eligibility floor
    const covenantId = (process.argv[5] || "22222222222222222222").toString();

    // Build a 16-leaf set; our member sits at index `idx` with leaf = Poseidon(account, value).
    const idx = 6;
    const leaves = [];
    for (let i = 0; i < 16; i++) {
        if (i === idx) {
            leaves.push(BigInt(await hash([account.toString(), value.toString()])));
        } else {
            // distinct non-member leaves Poseidon(otherAccount, otherValue)
            const a = BigInt(900000 + i);
            const v = BigInt(100 + i);
            leaves.push(BigInt(await hash([a.toString(), v.toString()])));
        }
    }

    // Build the depth-4 tree (parent = Poseidon(left, right)).
    let level = leaves.slice();
    const levels = [level];
    for (let d = 0; d < DEPTH; d++) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            next.push(BigInt(await hash([level[i].toString(), level[i + 1].toString()])));
        }
        levels.push(next);
        level = next;
    }
    const root = levels[DEPTH][0];

    // Merkle path of our member at idx.
    const pathElements = [];
    const pathIndices = [];
    let pos = idx;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2;
        const siblingIdx = isRight ? pos - 1 : pos + 1;
        pathElements.push(levels[d][siblingIdx].toString());
        pathIndices.push(isRight ? "1" : "0");
        pos = Math.floor(pos / 2);
    }

    const input = {
        root: root.toString(),
        threshold: threshold.toString(),
        covenantId,
        account: account.toString(),
        value: value.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_merkle_leaf_threshold.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    console.log("(layout: [valid, root, threshold, covenantId])");
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
