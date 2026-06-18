#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_set_non_membership.js — real Groth16 proof for set_non_membership (Covex27)
// Sorted-Merkle non-membership, depth 4 (16 range-node leaves). Leaves are Poseidon(lo, hi)
// for adjacent sorted blocklist entries. A `leaf` strictly between an adjacent (lo, hi) pair is
// proven ABSENT via one Merkle path to that range node + strict bracketing lo < leaf < hi.
// Public: root, covenantId. Private: leaf, lo, hi, pathElements[4], pathIndices[4].
// valid (publicSignals[0]) == 1 iff bracketing holds and the path matches root.
// Usage: node prove_set_non_membership.js [leaf] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "set_non_membership_js/set_non_membership.wasm");
const ZKEY = path.join(__dirname, "set_non_membership.zkey");
const OUT = path.join(__dirname, "set_non_membership_proof.json");

async function main() {
    // A sorted blocklist of 17 entries -> 16 adjacent range nodes (Poseidon(lo, hi)).
    // (sanctioned/blocked values; in production these would be address hashes etc.)
    const blocked = [];
    for (let i = 0; i < 17; i++) blocked.push(BigInt(1000 * (i + 1))); // 1000,2000,...,17000 (sorted)

    // Build the 16 range-node leaves.
    const leaves = [];
    for (let i = 0; i < 16; i++) {
        leaves.push(BigInt(await hash([blocked[i].toString(), blocked[i + 1].toString()])));
    }

    // Build the depth-4 Merkle tree (parent = Poseidon(left, right)). Track per-level nodes.
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

    // Choose the range node at leaf index `idx`: bracket (blocked[idx], blocked[idx+1]).
    const idx = 5;
    const lo = blocked[idx];
    const hi = blocked[idx + 1];
    // The cleared leaf strictly between lo and hi (default: midpoint).
    const leaf = process.argv[2] ? BigInt(process.argv[2]) : (lo + hi) / 2n;
    const covenantId = (process.argv[3] || "11111111111111111111").toString();

    // Derive the Merkle path of leaf index idx.
    const pathElements = [];
    const pathIndices = [];
    let pos = idx;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2; // 1 if current node is the right child
        const siblingIdx = isRight ? pos - 1 : pos + 1;
        pathElements.push(levels[d][siblingIdx].toString());
        // pathIndices[i] == 0 means current node is LEFT child (matches the circuit).
        pathIndices.push(isRight ? "1" : "0");
        pos = Math.floor(pos / 2);
    }

    const input = {
        root: root.toString(),
        covenantId,
        leaf: leaf.toString(),
        lo: lo.toString(),
        hi: hi.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_set_non_membership.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
