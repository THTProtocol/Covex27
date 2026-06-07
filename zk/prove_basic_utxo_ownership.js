#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

const WASM = path.join(__dirname, "basic_utxo_ownership_js/basic_utxo_ownership.wasm");
const ZKEY = path.join(__dirname, "basic_utxo_ownership.zkey");
const OUT = path.join(__dirname, "ownership/basic_utxo_ownership_proof.json");

async function main() {
    const pubkey_x = process.argv[2] || "111";
    const pubkey_y = process.argv[3] || "222";
    const amount_commit = process.argv[4] || "333";
    const owner_sig_r = process.argv[5] || "444";
    const owner_sig_s = process.argv[6] || "555";
    const utxo_hash = await hash([pubkey_x, pubkey_y, amount_commit, owner_sig_r, owner_sig_s]);

    const input = {
        pubkey_x,
        pubkey_y,
        amount_commit,
        owner_sig_r,
        owner_sig_s,
        utxo_hash,
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "utxo_hash=", utxo_hash);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });