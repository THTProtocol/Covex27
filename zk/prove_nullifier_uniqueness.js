#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_nullifier_uniqueness.js - real Groth16 proof for nullifier_uniqueness (Covex27).
// Derived nullifier = Poseidon(secret, covenantId), proven ABSENT from a sorted spent-set
// (depth-4 sorted-Merkle range-node tree). Public: spentRoot, nullifier, covenantId.
// valid (publicSignals[0]) == 1 iff bracketed (fresh) and bound to secret+covenant.
// Usage: node prove_nullifier_uniqueness.js [out] [covenantId] [--false]
//   --false : choose lo/hi that do NOT bracket the derived nullifier -> VERIFYING proof, valid==0.
const ID = "nullifier_uniqueness";
const DEPTH = 4;
const SERVED = path.join(__dirname, "../frontend/public/zk", ID);
const WASM = path.join(SERVED, `${ID}.wasm`);
const ZKEY = path.join(SERVED, `${ID}_final.zkey`);

async function main() {
    const outArg = process.argv[2] || path.join(__dirname, `${ID}_proof.json`);
    const covenantId = (process.argv[3] || "11111111111111111111").toString();
    const wantFalse = process.argv.includes("--false");
    const secret = "424242424242";

    // Derive the nullifier the circuit will require: the LOW 248 bits of Poseidon(secret, covenantId)
    // (matches the circuit's Num2Bits(254) low-bits projection). This keeps the nullifier inside the
    // sound LessThan(248) comparison domain while staying a deterministic function of secret+covenant.
    const BITS = 248n;
    const MASK = (1n << BITS) - 1n;
    const nullifier = BigInt(await hash([secret, covenantId])) & MASK;

    // A sorted spent-set: 17 spent nullifiers chosen so the DERIVED nullifier falls strictly
    // between two adjacent ones (so it is genuinely fresh). We center the window on `nullifier`.
    // Build adjacent (lo, hi) range nodes; pick a bracketing pair lo < nullifier < hi.
    const lo = nullifier - 1000n;
    const hi = nullifier + 1000n;
    // Construct a sorted list of 17 spent values: ... lo, hi ... at indices idx, idx+1.
    const spent = [];
    for (let i = 0; i < 17; i++) spent.push(0n);
    // fill increasing values, placing lo,hi adjacent at idx=8.
    const idx = 8;
    let v = lo - BigInt(idx) * 5000n;
    for (let i = 0; i < 17; i++) {
        if (i === idx) v = lo; else if (i === idx + 1) v = hi; else if (i === idx + 2) v = hi + 5000n;
        spent[i] = v;
        if (i < idx) v = v + 5000n; else if (i > idx + 1) v = v + 5000n;
    }
    // ensure strict monotonic (defensive): rebuild simply around the window
    for (let i = 0; i < 17; i++) {
        if (i < idx) spent[i] = lo - BigInt(idx - i) * 5000n;
        else if (i === idx) spent[i] = lo;
        else if (i === idx + 1) spent[i] = hi;
        else spent[i] = hi + BigInt(i - (idx + 1)) * 5000n;
    }

    // 16 range-node leaves = Poseidon(spent[i], spent[i+1]).
    const leaves = [];
    for (let i = 0; i < 16; i++) leaves.push(BigInt(await hash([spent[i].toString(), spent[i + 1].toString()])));
    let level = leaves.slice();
    const levels = [level];
    for (let d = 0; d < DEPTH; d++) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(BigInt(await hash([level[i].toString(), level[i + 1].toString()])));
        levels.push(next); level = next;
    }
    const spentRoot = levels[DEPTH][0];

    // Merkle path of the range node at leaf index idx.
    const pathElements = [], pathIndices = [];
    let pos = idx;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2;
        pathElements.push(levels[d][isRight ? pos - 1 : pos + 1].toString());
        pathIndices.push(isRight ? "1" : "0");
        pos = Math.floor(pos / 2);
    }

    let useLo = lo, useHi = hi;
    if (wantFalse) {
        // A range node that EXISTS in the tree but does NOT bracket the nullifier: use the pair at
        // index idx+2 (both above the nullifier), so ltLo (lo<nullifier) is FALSE -> valid==0, yet
        // the Merkle path + nullifier binding still hold -> the proof VERIFIES with valid 0.
        useLo = spent[idx + 2];
        useHi = spent[idx + 3];
        const j = idx + 2;
        pathElements.length = 0; pathIndices.length = 0;
        let p = j;
        for (let d = 0; d < DEPTH; d++) {
            const isRight = p % 2;
            pathElements.push(levels[d][isRight ? p - 1 : p + 1].toString());
            pathIndices.push(isRight ? "1" : "0");
            p = Math.floor(p / 2);
        }
    }

    const input = {
        spentRoot: spentRoot.toString(),
        nullifier: nullifier.toString(),
        covenantId,
        secret,
        lo: useLo.toString(),
        hi: useHi.toString(),
        pathElements,
        pathIndices,
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    fs.writeFileSync(outArg, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", outArg, "valid(publicSignals[0]):", publicSignals[0], "all:", JSON.stringify(publicSignals));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
