#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "hash_preimage/output/hash_preimage_js/hash_preimage.wasm");
const ZKEY = path.join(__dirname, "hash_preimage/output/hash_preimage.zkey");
const OUT = path.join(__dirname, "hash_preimage/hash_preimage_proof.json");

async function main() {
    const preimage = BigInt(process.argv[2] || "42");
    const m = await mimcjs.buildMimc7();
    const hash = m.F.toObject(m.hash(m.F.e(preimage), m.F.zero));

    const input = {
        commitment_hash: hash.toString(),
        preimage: preimage.toString(),
    };
    const wtns = path.join(__dirname, "hash_preimage/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });