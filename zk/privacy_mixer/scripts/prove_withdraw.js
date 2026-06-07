#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const tree = require("../lib/tree");

const BASE = path.resolve(__dirname, "..");
const WASM = path.join(BASE, "output", "privacy_mixer_v1_js", "privacy_mixer_v1.wasm");
const ZKEY = path.join(BASE, "output", "privacy_mixer_v1.zkey");

async function main() {
    const secret = BigInt(process.argv[2] || "111111");
    const nullifierKey = BigInt(process.argv[3] || "222222");
    const amount = BigInt(process.argv[4] || "100000000");
    const recipientHash = BigInt(process.argv[5] || "333333");

    const { leaf, amountCommitment } = await tree.leafFromNote(secret, nullifierKey, amount);
    const nullifier = await tree.nullifierFromNote(secret, nullifierKey);

    const { root, layers } = await tree.buildTree([leaf]);
    const { path_elements, path_indices } = await tree.getMerklePath(layers, 0);

    const input = {
        merkle_root: root.toString(),
        nullifier: nullifier.toString(),
        recipient_hash: recipientHash.toString(),
        amount_commitment: amountCommitment.toString(),
        min_amount: amount.toString(),
        max_amount: amount.toString(),
        secret: secret.toString(),
        nullifier_key: nullifierKey.toString(),
        amount: amount.toString(),
        path_elements,
        path_indices,
    };

    const wtns = path.join(BASE, "output", "withdraw.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    const out = path.join(BASE, "output", "proofs", "withdraw_demo.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ proof, publicSignals, note: { secret: secret.toString(), nullifier_key: nullifierKey.toString(), amount: amount.toString() } }, null, 2));
    console.log("Proof:", out);
    console.log("nullifier:", nullifier.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch((e) => { console.error(e); process.exit(1); });