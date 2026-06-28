#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_merkle_range_membership.js - real Groth16 proof for merkle_range_membership (Covex27).
// Builds a depth-4 Poseidon Merkle set of 16 (account, value) leaves, proves a chosen member
// leaf's path AND that its value is inside a public band [lo, hi]. valid (publicSignals[0]) == 1
// iff the leaf is in the tree AND lo <= value <= hi.
// Public: root, lo, hi, covenantId. Private: account, value, pathElements[4], pathIndices[4].
// Usage: node prove_merkle_range_membership.js [memberIndex] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "merkle_range_membership_js/merkle_range_membership.wasm");
const ZKEY = path.join(__dirname, "merkle_range_membership.zkey");
const OUT = path.join(__dirname, "merkle_range_membership_proof.json");

async function main() {
    // 16 leaves: account_i = 100+i, value_i = 1000*(i+1). Leaf = Poseidon(account, value).
    const accounts = [], values = [], leaves = [];
    for (let i = 0; i < 16; i++) {
        const acc = BigInt(100 + i);
        const val = BigInt(1000 * (i + 1));
        accounts.push(acc); values.push(val);
        leaves.push(BigInt(await hash([acc.toString(), val.toString()])));
    }

    // Build the depth-4 tree (parent = Poseidon(left, right)).
    let level = leaves.slice();
    const levels = [level];
    for (let d = 0; d < DEPTH; d++) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            next.push(BigInt(await hash([level[i].toString(), level[i + 1].toString()])));
        }
        levels.push(next); level = next;
    }
    const root = levels[DEPTH][0];

    // Choose a member leaf and a band that brackets its value.
    const idx = process.argv[2] ? parseInt(process.argv[2], 10) : 5;
    const account = accounts[idx], value = values[idx];
    const lo = value - 1n;     // inclusive band that contains value
    const hi = value + 1n;
    const covenantId = (process.argv[3] || "7").toString();

    // Merkle path of leaf index idx.
    const pathElements = [], pathIndices = [];
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
        lo: lo.toString(),
        hi: hi.toString(),
        covenantId,
        account: account.toString(),
        value: value.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_mrm.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
