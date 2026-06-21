#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_proof_of_reserves.js - real Groth16 proof for proof_of_reserves (Covex)
// Depth-4 (16-leaf) per-user liability tree; leaf = Poseidon(userId, balance). Proves the prover's
// own leaf is in the published root AND claimedTotal >= liabilities.
// Public layout: [valid, root, claimedTotal, liabilities, covenantId]. publicSignals[0] must be 1.
// Private: userId, balance, pathElements[4], pathIndices[4].
// Usage: node prove_proof_of_reserves.js [claimedTotal] [liabilities] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "proof_of_reserves_js/proof_of_reserves.wasm");
const ZKEY = path.join(__dirname, "proof_of_reserves.zkey");
const OUT = path.join(__dirname, "proof_of_reserves_proof.json");

async function main() {
    // Prover's own (private) leaf data.
    const userId = BigInt("424242");
    const balance = BigInt("5000");

    // Published exchange scalars (public). Honest case: reserves >= liabilities.
    const claimedTotal = (process.argv[2] || "1000000").toString();
    const liabilities = (process.argv[3] || "950000").toString();
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    // Build a 16-leaf user-liability tree; the prover sits at index `idx`.
    const idx = 6;
    const leaves = [];
    for (let i = 0; i < 16; i++) {
        if (i === idx) {
            leaves.push(BigInt(await hash([userId.toString(), balance.toString()])));
        } else {
            // other users: distinct (userId, balance) leaves
            const uId = BigInt(900000 + i).toString();
            const bal = BigInt(1000 + i * 7).toString();
            leaves.push(BigInt(await hash([uId, bal])));
        }
    }

    // Build depth-4 tree (parent = Poseidon(left, right)).
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

    // Merkle path of the prover at idx.
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
        claimedTotal,
        liabilities,
        covenantId,
        userId: userId.toString(),
        balance: balance.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_proof_of_reserves.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
