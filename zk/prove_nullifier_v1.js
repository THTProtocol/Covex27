#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const tree = require("./privacy_mixer/lib/tree");

const WASM = path.join(__dirname, "nullifier/nullifier_v1_js/nullifier_v1.wasm");
const ZKEY = path.join(__dirname, "nullifier/nullifier_v1.zkey");
const OUT = path.join(__dirname, "nullifier/nullifier_v1_proof.json");

async function main() {
    const secret = BigInt(process.argv[2] || "111111");
    const nullifierKey = BigInt(process.argv[3] || "222222");
    const nullifier = await tree.nullifierFromNote(secret, nullifierKey);
    const input = {
        nullifier: nullifier.toString(),
        secret: secret.toString(),
        nullifier_key: nullifierKey.toString(),
    };
    const wtns = path.join(__dirname, ".wtns.nullifier_v1.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "nullifier=", nullifier.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch((e) => { console.error(e); process.exit(1); });