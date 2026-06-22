#!/usr/bin/env node
"use strict";
// prove_weighted_multisig.js - generate an HONEST witness + Groth16 proof for weighted_multisig.
//
// Statement: sum of weights of PRESENT signers >= threshold.
//   Public:  threshold, covenantId, weight[0..6]
//   Private: present[0..6] (booleans)
//
// Honest demo witness:
//   weights  = [10, 20, 15, 5, 30, 25, 8]   (public per-signer voting power)
//   present  = [ 1,  1,  0, 0,  1,  0, 0]   (signers 0,1,4 approved -> 10+20+30 = 60)
//   threshold = 50  ->  60 >= 50  ->  valid = 1.
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "weighted_multisig_js/weighted_multisig.wasm");
const ZKEY = path.join(__dirname, "weighted_multisig.zkey");
const OUT = path.join(__dirname, "weighted_multisig_proof.json");

async function main() {
    const weight = ["10", "20", "15", "5", "30", "25", "8"];
    const present = ["1", "1", "0", "0", "1", "0", "0"]; // 10 + 20 + 30 = 60
    const threshold = process.argv[2] || "50";
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId =
        process.argv[3] ||
        "12975856296764178385096300579349863837782422391258567265242335968196494733975";

    const input = { threshold, covenantId, weight, present };
    const wtns = path.join(__dirname, ".wtns.wmsig.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
