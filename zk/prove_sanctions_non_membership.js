#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_sanctions_non_membership.js - real Groth16 proof for sanctions_non_membership (Covex27)
// Sorted-Merkle non-membership, depth 4 (16 range-node leaves). Leaves are Poseidon(low, high)
// for adjacent sorted blocklist entries. A `value` strictly between an adjacent (low, high) pair
// is proven ABSENT via one Merkle path to that range node + strict bracketing low < value < high.
// The public valueCommitment = Poseidon(value) binds WHICH value was cleared.
//
// Public signals (snarkjs order = [output] + public inputs in declaration order):
//   [0] valid            (1 iff statement holds)
//   [1] blocklistRoot
//   [2] valueCommitment  (= Poseidon(value))
//   [3] covenantId
// Private: value, low, high, pathElements[4], pathIndices[4].
//
// DEPLOYMENT IS LEGAL / COUNSEL-GATED (sanctions / OFAC non-membership attestation).
// Usage: node prove_sanctions_non_membership.js [value] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "sanctions_non_membership_js/sanctions_non_membership.wasm");
const ZKEY = path.join(__dirname, "sanctions_non_membership.zkey");
const OUT = path.join(__dirname, "sanctions_non_membership_proof.json");

async function main() {
    // A sorted blocklist of 17 entries -> 16 adjacent range nodes Poseidon(low, high).
    // In production these would be Poseidon(address) hashes reduced into [0, 2^64); here we use
    // sorted opaque field elements with comfortable gaps so a value can sit strictly between two.
    const blocked = [];
    for (let i = 0; i < 17; i++) blocked.push(BigInt(1000000 * (i + 1))); // 1e6, 2e6, ... 17e6 (sorted)

    // Build the 16 range-node leaves Poseidon(blocked[i], blocked[i+1]).
    const leaves = [];
    for (let i = 0; i < 16; i++) {
        leaves.push(BigInt(await hash([blocked[i].toString(), blocked[i + 1].toString()])));
    }

    // Build the depth-4 Merkle tree (parent = Poseidon(left, right)).
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

    // Choose the range node at leaf index `idx`: brackets (blocked[idx], blocked[idx+1]).
    const idx = 5;
    const low = blocked[idx];
    const high = blocked[idx + 1];
    // The cleared value strictly between low and high (default: midpoint).
    const value = process.argv[2] ? BigInt(process.argv[2]) : (low + high) / 2n;
    const covenantId = (process.argv[3] || "11111111111111111111").toString();

    // Sanity: value must be strictly bracketed, else the honest witness would not satisfy.
    if (!(low < value && value < high)) {
        throw new Error(`value ${value} not strictly between low ${low} and high ${high}`);
    }

    // valueCommitment = Poseidon(value).
    const valueCommitment = await hash([value.toString()]);

    // Derive the Merkle path of leaf index idx.
    const pathElements = [];
    const pathIndices = [];
    let pos = idx;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2; // 1 if current node is the right child
        const siblingIdx = isRight ? pos - 1 : pos + 1;
        pathElements.push(levels[d][siblingIdx].toString());
        pathIndices.push(isRight ? "1" : "0"); // 0 = current node is LEFT child (matches circuit)
        pos = Math.floor(pos / 2);
    }

    const input = {
        blocklistRoot: root.toString(),
        valueCommitment,
        covenantId,
        value: value.toString(),
        low: low.toString(),
        high: high.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_sanctions_non_membership.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
