#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_anon_membership_nullifier.js — real Groth16 proof for anon_membership_nullifier (Covex27)
// Depth-4 membership tree of identity commitments Poseidon(identity). Proves membership AND emits
// nullifier = Poseidon(identity, externalNullifier) for one-person-one-action.
// Public: root, externalNullifier, nullifier, covenantId. Private: identity, pathElements[4], pathIndices[4].
// Usage: node prove_anon_membership_nullifier.js [identity] [externalNullifier] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "anon_membership_nullifier_js/anon_membership_nullifier.wasm");
const ZKEY = path.join(__dirname, "anon_membership_nullifier.zkey");
const OUT = path.join(__dirname, "anon_membership_nullifier_proof.json");

async function main() {
    const identity = BigInt(process.argv[2] || "777777777777");
    const externalNullifier = BigInt(process.argv[3] || "20260618"); // e.g. proposal/airdrop id
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    // Build a 16-leaf membership set; our member sits at index `idx`.
    const idx = 9;
    const members = [];
    for (let i = 0; i < 16; i++) {
        // distinct member identity scalars; our real identity at idx.
        const idScalar = (i === idx) ? identity : BigInt(1000000 + i);
        members.push(BigInt(await hash([idScalar.toString()]))); // leaf = Poseidon(identity)
    }

    // Build depth-4 tree (parent = Poseidon(left, right)).
    let level = members.slice();
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

    const nullifier = await hash([identity.toString(), externalNullifier.toString()]);

    const input = {
        root: root.toString(),
        covenantId,
        externalNullifier: externalNullifier.toString(),
        nullifier,
        identity: identity.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_anon_membership_nullifier.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
