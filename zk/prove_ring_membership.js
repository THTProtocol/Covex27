#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_ring_membership.js - real Groth16 proof for ring_membership (Covex, Wave 4).
// Depth-4 ring (16-leaf anonymity set) of commitments Poseidon(secret). Proves membership AND emits
// nullifier = Poseidon(secret, ringId), revealing ONLY the nullifier (no index, no identity).
// Public: root, ringId, nullifier, covenantId. Private: secret, pathElements[4], pathIndices[4].
// Usage: node prove_ring_membership.js [secret] [ringId] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "ring_membership_js/ring_membership.wasm");
const ZKEY = path.join(__dirname, "ring_membership.zkey");
const OUT = path.join(__dirname, "ring_membership_proof.json");

async function main() {
    const secret = BigInt(process.argv[2] || "424242424242424242");
    const ringId = BigInt(process.argv[3] || "20260622"); // ring / action domain separator
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    // Build a 16-leaf ring; our member's commitment sits at index `idx`.
    const idx = 6;
    const leaves = [];
    for (let i = 0; i < 16; i++) {
        // commitment leaf = Poseidon(secret); distinct decoy secrets for the other ring members.
        const memberSecret = (i === idx) ? secret : BigInt(900000000 + i);
        leaves.push(BigInt(await hash([memberSecret.toString()])));
    }

    // Build depth-4 Merkle tree (parent = Poseidon(left, right)).
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

    // nullifier = Poseidon(secret, ringId) - the ONLY thing the proof leaks about the prover.
    const nullifier = await hash([secret.toString(), ringId.toString()]);

    const input = {
        root: root.toString(),
        ringId: ringId.toString(),
        nullifier,
        covenantId,
        secret: secret.toString(),
        pathElements,
        pathIndices,
    };

    const wtns = path.join(__dirname, ".wtns_ring_membership.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    // publicSignals layout: [valid, root, ringId, nullifier, covenantId]
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
