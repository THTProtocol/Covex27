#!/usr/bin/env node
"use strict";
/**
 * prove_basic_utxo_ownership.js — stub for basic_utxo_ownership.circom (Covex27)
 * Phase 1 priority: "UTXO ownership + spend auth (Schnorr + commitments)"
 * "schnorr-like" via MiMC preimage (see circuit header for honest notes + vision refs).
 * Precomputes pubkey = H(priv) using mimcjs.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "ownership/output/basic_utxo_ownership_js/basic_utxo_ownership.wasm");
const ZKEY = path.join(__dirname, "ownership/output/basic_utxo_ownership.zkey");
const OUT = path.join(__dirname, "ownership/basic_utxo_ownership_proof.json");

async function main() {
    const priv = BigInt(process.argv[2] || "424242424242");
    const utxoId = BigInt(process.argv[3] || "0xdeadbeef1234"); // simplified
    const amount = BigInt(process.argv[4] || "50000000");

    const m = await mimcjs.buildMimc7();
    const pub = m.F.toObject(m.hash(m.F.e(priv), m.F.zero)).toString();

    const input = {
        pubkey: pub,
        utxo_id: utxoId.toString(),
        amount: amount.toString(),
        privkey: priv.toString(),
    };
    const wtns = path.join(__dirname, "ownership/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "pubkey=", pub);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
