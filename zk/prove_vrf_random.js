#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "vrf_random_js/vrf_random.wasm");
const ZKEY = path.join(__dirname, "vrf_random.zkey");
const OUT = path.join(__dirname, "vrf/vrf_random_proof.json");

async function main() {
    const seed = BigInt(process.argv[2] || "987654321");
    const proofVal = BigInt(process.argv[3] || "111");
    const outputVal = BigInt(process.argv[4] || "222");
    const pubKey = BigInt(process.argv[5] || "333");

    const input = {
        seed: seed.toString(),
        proof: proofVal.toString(),
        output_val: outputVal.toString(),
        pub_vrf_key: pubKey.toString(),
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });