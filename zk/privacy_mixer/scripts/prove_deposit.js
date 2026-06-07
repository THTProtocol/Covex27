#!/usr/bin/env node
"use strict";
const tree = require("../lib/tree");

async function main() {
    const secret = BigInt(process.argv[2] || "111111");
    const nullifierKey = BigInt(process.argv[3] || "222222");
    const amount = BigInt(process.argv[4] || "100000000");

    const { leaf, commitment, amountCommitment } = await tree.leafFromNote(secret, nullifierKey, amount);
    const nullifier = await tree.nullifierFromNote(secret, nullifierKey);

    console.log(JSON.stringify({
        leaf_hash: leaf.toString(),
        commitment: commitment.toString(),
        amount_commitment: amountCommitment.toString(),
        nullifier: nullifier.toString(),
        note: { secret: secret.toString(), nullifier_key: nullifierKey.toString(), amount: amount.toString() },
    }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });