#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "basic_utxo_ownership_js/basic_utxo_ownership.wasm");
const ZKEY = path.join(__dirname, "basic_utxo_ownership.zkey");
const OUT = path.join(__dirname, "ownership/basic_utxo_ownership_proof.json");

async function main() {
    const utxoHash = BigInt(process.argv[2] || "123456789012345");

    const input = {
        pubkey_x: "111",
        pubkey_y: "222",
        amount_commit: "333",
        owner_sig_r: "444",
        owner_sig_s: "555",
        utxo_hash: utxoHash.toString(),
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