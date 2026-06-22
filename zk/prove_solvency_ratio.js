#!/usr/bin/env node
"use strict";
// prove_solvency_ratio.js - generate an HONEST proof that assets/liabilities >= minRatioBps/10000.
// Computes the Poseidon(amount, salt) commitments with circomlibjs so they match the circuit.
// Usage: node prove_solvency_ratio.js [assets] [liabilities] [minRatioBps] [covenantId] [assetsSalt] [liabSalt]
const snarkjs = require("snarkjs");
const circomlibjs = require("circomlibjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "solvency_ratio_js/solvency_ratio.wasm");
const ZKEY = path.join(__dirname, "solvency_ratio.zkey");
const OUT = path.join(__dirname, "solvency_ratio_proof.json");

async function main() {
    // Honest witness: assets=1,500,000, liabilities=1,000,000 -> ratio 150.00% >= 120.00% min.
    const assets = process.argv[2] || "1500000";
    const liabilities = process.argv[3] || "1000000";
    const minRatioBps = process.argv[4] || "12000"; // 120.00%
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[5] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";
    const assetsSalt = process.argv[6] || "111111111111111111";
    const liabSalt = process.argv[7] || "222222222222222222";

    const poseidon = await circomlibjs.buildPoseidon();
    const F = poseidon.F;
    const assetsCommit = F.toString(poseidon([assets, assetsSalt]));
    const liabCommit = F.toString(poseidon([liabilities, liabSalt]));

    const input = {
        assets, liabilities, assetsSalt, liabSalt,
        minRatioBps, covenantId, assetsCommit, liabCommit,
    };
    const wtns = path.join(__dirname, ".wtns.solv.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    console.log("layout: [valid, minRatioBps, covenantId, assetsCommit, liabCommit]");
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
