#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "multi_sig_gating_js/multi_sig_gating.wasm");
const ZKEY = path.join(__dirname, "multi_sig_gating.zkey");
const OUT = path.join(__dirname, "multi_sig_gating_proof.json");

async function main() {
    const sigCount = process.argv[2] || "3";
    const threshold = process.argv[3] || "3";
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[4] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";
    const input = { sigCount, threshold, covenantId };
    const wtns = path.join(__dirname, ".wtns.msig.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals=", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
