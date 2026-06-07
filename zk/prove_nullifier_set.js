#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "nullifier_set_js/nullifier_set.wasm");
const ZKEY = path.join(__dirname, "nullifier_set.zkey");
const OUT = path.join(__dirname, "nullifier/nullifier_set_proof.json");

async function main() {
    const nullifier = BigInt(process.argv[2] || "555555555");
    const merkleRoot = BigInt(process.argv[3] || "123456789");
    const secret = BigInt(process.argv[4] || "42");

    const input = {
        nullifier: nullifier.toString(),
        merkle_root: merkleRoot.toString(),
        secret: secret.toString(),
    };
    const wtns = path.join(__dirname, "nullifier/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });