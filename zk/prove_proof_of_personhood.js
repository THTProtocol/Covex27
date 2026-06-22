#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_proof_of_personhood.js - real Groth16 proof for proof_of_personhood (Covex)
// Self-committed personhood: identityCommitment = Poseidon(identitySecret) is a leaf in a
// public registry Merkle tree (depth 4). Emits nullifier = Poseidon(identitySecret, epoch)
// so each registered person acts once per epoch. NO issuer signature.
// Public: registryRoot, epoch, nullifier, covenantId. Private: identitySecret, pathElements[4], pathIndices[4].
// Usage: node prove_proof_of_personhood.js [identitySecret] [epoch] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "proof_of_personhood_js/proof_of_personhood.wasm");
const ZKEY = path.join(__dirname, "proof_of_personhood.zkey");
const OUT = path.join(__dirname, "proof_of_personhood_proof.json");

async function main() {
    const identitySecret = BigInt(process.argv[2] || "424242424242424242");
    const epoch = BigInt(process.argv[3] || "20260622"); // e.g. a day / round id
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    // Build a 16-leaf public registry; our registered person sits at index `idx`.
    const idx = 9;
    const members = [];
    for (let i = 0; i < 16; i++) {
        // distinct self-committed identity secrets; our real one at idx.
        const secret = (i === idx) ? identitySecret : BigInt(2000000 + i);
        members.push(BigInt(await hash([secret.toString()]))); // leaf = Poseidon(identitySecret)
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
    const registryRoot = levels[DEPTH][0];

    // Merkle path of our registered leaf at idx.
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

    const nullifier = await hash([identitySecret.toString(), epoch.toString()]);

    const input = {
        registryRoot: registryRoot.toString(),
        epoch: epoch.toString(),
        nullifier,
        covenantId,
        identitySecret: identitySecret.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_proof_of_personhood.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
