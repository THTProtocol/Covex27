#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_anonymous_vote.js - real Groth16 proof for anonymous_vote (Covex generic primitive)
// Depth-4 membership tree of voter commitments Poseidon(voterSecret). Proves eligibility +
// one-vote nullifier + committed ballot + quadratic budget (weight^2 <= budget).
// Public: root, electionId, nullifier, voteCommitment, budget, covenantId.
// Private: voterSecret, choice, salt, weight, pathElements[4], pathIndices[4].
// Usage: node prove_anonymous_vote.js [voterSecret] [electionId] [choice] [salt] [weight] [budget] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "anonymous_vote_js/anonymous_vote.wasm");
const ZKEY = path.join(__dirname, "anonymous_vote.zkey");
const OUT = path.join(__dirname, "anonymous_vote_proof.json");

async function main() {
    const voterSecret = BigInt(process.argv[2] || "8675309123456789");
    const electionId = BigInt(process.argv[3] || "20260621"); // proposal / election id
    const choice = BigInt(process.argv[4] || "1");            // hidden ballot choice
    const salt = BigInt(process.argv[5] || "424242424242");   // ballot blinding salt
    const weight = BigInt(process.argv[6] || "5");            // votes cast; cost = weight^2 = 25
    const budget = BigInt(process.argv[7] || "100");          // credit budget (25 <= 100 -> valid)
    const covenantId = (process.argv[8] || "11111111111111111111").toString();

    // Build a 16-leaf eligibility set; our voter sits at index `idx`. Leaf = Poseidon(voterSecret).
    const idx = 9;
    const members = [];
    for (let i = 0; i < 16; i++) {
        const secret = (i === idx) ? voterSecret : BigInt(2000000 + i);
        members.push(BigInt(await hash([secret.toString()])));
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

    // Merkle path of our voter at idx.
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

    const nullifier = await hash([voterSecret.toString(), electionId.toString()]);
    const voteCommitment = await hash([choice.toString(), salt.toString()]);

    const input = {
        root: root.toString(),
        electionId: electionId.toString(),
        nullifier,
        voteCommitment,
        budget: budget.toString(),
        covenantId,
        voterSecret: voterSecret.toString(),
        choice: choice.toString(),
        salt: salt.toString(),
        weight: weight.toString(),
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_anonymous_vote.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
