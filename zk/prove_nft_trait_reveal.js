#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_nft_trait_reveal.js - real Groth16 proof for nft_trait_reveal.
// Commits a 16-slot NFT metadata set as a depth-4 Poseidon Merkle tree whose leaves are
// leaf_i = Poseidon(traitIndex_i, traitValue_i), then reveals ONE trait (slot `idx`) by proving
// its (traitIndex, traitValue) leaf is in the tree without disclosing the other 15 traits.
// Public: metadataRoot, traitIndex, traitValue, covenantId. Private: pathElements[4], pathIndices[4].
// Usage: node prove_nft_trait_reveal.js [traitValue] [traitIndex] [covenantId]
const DEPTH = 4;
const WASM = path.join(__dirname, "nft_trait_reveal_js/nft_trait_reveal.wasm");
const ZKEY = path.join(__dirname, "nft_trait_reveal.zkey");
const OUT = path.join(__dirname, "nft_trait_reveal_proof.json");

async function main() {
    // The revealed trait: slot `traitIndex` holds value `traitValue`.
    const traitValue = BigInt(process.argv[2] || "88888888"); // e.g. enum/hash of "Gold"
    const traitIndex = BigInt(process.argv[3] || "3");         // e.g. 3 = "Background"
    const covenantId = (process.argv[4] || "11111111111111111111").toString();

    // The 16 metadata slots: slot i commits trait (index=i, value=v_i). Our revealed trait sits at
    // slot Number(traitIndex); the other 15 are arbitrary committed traits (kept private here).
    const revealSlot = Number(traitIndex) % 16;
    const leaves = [];
    for (let i = 0; i < 16; i++) {
        const tIndex = (i === revealSlot) ? traitIndex.toString() : i.toString();
        const tValue = (i === revealSlot) ? traitValue.toString() : (1000000 + i).toString();
        leaves.push(BigInt(await hash([tIndex, tValue]))); // leaf = Poseidon(traitIndex, traitValue)
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
    const metadataRoot = levels[DEPTH][0];

    // Merkle path of our revealed trait leaf at revealSlot.
    const pathElements = [];
    const pathIndices = [];
    let pos = revealSlot;
    for (let d = 0; d < DEPTH; d++) {
        const isRight = pos % 2;
        const siblingIdx = isRight ? pos - 1 : pos + 1;
        pathElements.push(levels[d][siblingIdx].toString());
        pathIndices.push(isRight ? "1" : "0");
        pos = Math.floor(pos / 2);
    }

    const input = {
        metadataRoot: metadataRoot.toString(),
        traitIndex: traitIndex.toString(),
        traitValue: traitValue.toString(),
        covenantId,
        pathElements,
        pathIndices,
    };
    const wtns = path.join(__dirname, ".wtns_nft_trait_reveal.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
