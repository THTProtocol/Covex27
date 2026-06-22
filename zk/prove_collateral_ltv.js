#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "collateral_ltv_js/collateral_ltv.wasm");
const ZKEY = path.join(__dirname, "collateral_ltv.zkey");
const OUT = path.join(__dirname, "collateral_ltv_proof.json");

async function main() {
    const collateral = process.argv[2] || "200000";
    const debt = process.argv[3] || "100000";
    const maxLtvBps = process.argv[4] || "7500";
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[5] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";
    const input = { collateral, debt, maxLtvBps, covenantId };
    const wtns = path.join(__dirname, ".wtns.ltv.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });