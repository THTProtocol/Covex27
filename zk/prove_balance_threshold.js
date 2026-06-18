#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_balance_threshold.js — real Groth16 proof for balance_threshold (Covex27)
// Public: commitment = Poseidon(balance, salt), min_balance, covenantId. Private: balance, salt.
// valid (publicSignals[0]) == 1 iff balance >= min_balance.
// Usage: node prove_balance_threshold.js [balance] [salt] [min_balance] [covenantId]
const WASM = path.join(__dirname, "balance_threshold_js/balance_threshold.wasm");
const ZKEY = path.join(__dirname, "balance_threshold.zkey");
const OUT = path.join(__dirname, "balance_threshold_proof.json");

async function main() {
    const balance = BigInt(process.argv[2] || "50000");
    const salt = BigInt(process.argv[3] || "424242424242");
    const minBalance = BigInt(process.argv[4] || "10000");
    const covenantId = (process.argv[5] || "11111111111111111111").toString();

    const commitment = await hash([balance.toString(), salt.toString()]);

    const input = {
        commitment,
        covenantId,
        min_balance: minBalance.toString(),
        balance: balance.toString(),
        salt: salt.toString(),
    };
    const wtns = path.join(__dirname, ".wtns_balance_threshold.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
