#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "onchain_sig_verify_js/onchain_sig_verify.wasm");
const ZKEY = path.join(__dirname, "onchain_sig_verify.zkey");
const OUT = path.join(__dirname, "onchain_sig_verify_proof.json");

async function main() {
    const input = {
        covenant_id_hash: process.argv[2] || "123456789",
        outcome: process.argv[3] || "1",
        ts: process.argv[4] || "1710000000",
        oracle_pubkey_hash: process.argv[5] || "987654321",
        sig_r: process.argv[6] || "42",
        sig_s: process.argv[7] || "77",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch((e) => { console.error(e); process.exit(1); });