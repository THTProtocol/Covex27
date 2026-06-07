#!/usr/bin/env node
"use strict";
/**
 * prove_nullifier_set.js — stub for nullifier_set.circom (standalone) (Covex27)
 * Refs: vision "Nullifier set proofs (standalone... double-spend prevention with ZK)", privacy, UTXO.
 * Builds on existing nullifier_v1 + mixer lib. Demo: derive + != spent.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "nullifier/output/nullifier_set_js/nullifier_set.wasm");
const ZKEY = path.join(__dirname, "nullifier/output/nullifier_set.zkey");
const OUT = path.join(__dirname, "nullifier/nullifier_set_proof.json");

async function main() {
    const secret = BigInt(process.argv[2] || "111222333");
    const nk = BigInt(process.argv[3] || "999888777");
    const spent = BigInt(process.argv[4] || "0");  // the public spent one to != 

    const m = await mimcjs.buildMimc7();
    // Compute nullifier exactly as circuit (MiMC7(secret + nk) k=0 via the lib)
    const nullifierBig = m.F.toObject( m.hash( m.F.e(secret + nk), m.F.zero ) );

    const input = {
        nullifier: nullifierBig.toString(),
        spent_nullifier: spent.toString(),
        secret: secret.toString(),
        nullifier_key: nk.toString(),
    };
    const wtns = path.join(__dirname, "nullifier/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "nullifier=", nullifierBig.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
