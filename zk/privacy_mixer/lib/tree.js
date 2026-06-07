#!/usr/bin/env node
"use strict";
// MiMC7 Merkle tree builder — must match privacy_mixer_v1.circom hashing exactly.
const mimcjs = require("circomlibjs");

const DEPTH = 16;
const ZERO_LEAF = 0n;

let mimc7;
async function getMiMC7() {
    if (!mimc7) mimc7 = await mimcjs.buildMimc7();
    return mimc7;
}

async function mimcHash(val) {
    const m = await getMiMC7();
    const F = m.F;
    return m.F.toObject(m.hash(F.e(val), F.zero));
}

async function mimcHash2(left, right) {
    const m = await getMiMC7();
    const F = m.F;
    return m.F.toObject(m.hash(F.add(F.e(left), F.e(right)), F.zero));
}

async function amountCommitment(amount) {
    return mimcHash(BigInt(amount));
}

async function mixerCommitment(secret, nullifierKey, amountComm) {
    const h0 = await mimcHash(BigInt(secret));
    const h1 = await mimcHash(BigInt(h0) + BigInt(nullifierKey));
    const h2 = await mimcHash(BigInt(h1) + BigInt(amountComm));
    return h2;
}

async function leafFromNote(secret, nullifierKey, amount) {
    const amtComm = await amountCommitment(amount);
    const commitment = await mixerCommitment(secret, nullifierKey, amtComm);
    return { leaf: await mimcHash(BigInt(commitment)), commitment, amountCommitment: amtComm };
}

async function nullifierFromNote(secret, nullifierKey) {
    return mimcHash(BigInt(secret) + BigInt(nullifierKey));
}

function emptyLevel() {
    return new Array(1 << DEPTH).fill(ZERO_LEAF);
}

async function buildTree(leaves) {
    // Pad to 2^DEPTH with zero leaves
    const size = 1 << DEPTH;
    const layer = new Array(size).fill(ZERO_LEAF);
    for (let i = 0; i < leaves.length && i < size; i++) {
        layer[i] = BigInt(leaves[i]);
    }

    const layers = [layer.map((x) => BigInt(x))];
    let current = layers[0];
    while (current.length > 1) {
        const next = [];
        for (let i = 0; i < current.length; i += 2) {
            next.push(await mimcHash2(current[i], current[i + 1]));
        }
        layers.push(next);
        current = next;
    }
    return { root: current[0], layers };
}

async function getMerklePath(layers, leafIndex) {
    const path_elements = [];
    const path_indices = [];
    let idx = leafIndex;
    for (let level = 0; level < DEPTH; level++) {
        const layer = layers[level];
        const isRight = idx & 1;
        const sibling = layer[idx ^ 1];
        path_elements.push(sibling.toString());
        path_indices.push(isRight.toString());
        idx >>= 1;
    }
    return { path_elements, path_indices };
}

module.exports = {
    DEPTH,
    mimcHash,
    mimcHash2,
    amountCommitment,
    mixerCommitment,
    leafFromNote,
    nullifierFromNote,
    buildTree,
    getMerklePath,
};