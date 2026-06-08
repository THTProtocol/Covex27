#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

const WASM = path.join(__dirname, "vrf_random_js/vrf_random.wasm");
const ZKEY = path.join(__dirname, "vrf_random.zkey");
const OUT = path.join(__dirname, "vrf/vrf_random_proof.json");

async function main() {
    const vrf_secret = process.argv[2] || "424242";
    const seed = process.argv[3] || "987654321";
    const pub_vrf_key = process.argv[4] || "333";
    const output_val = await hash([vrf_secret, seed, pub_vrf_key]);

    const input = {
        vrf_secret,
        seed,
        output_val,
        pub_vrf_key,
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "output_val=", output_val);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });