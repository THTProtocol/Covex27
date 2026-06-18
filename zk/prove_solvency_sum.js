#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_solvency_sum.js — real Groth16 proof for solvency_sum (proof of reserves) (Covex27)
// N=4 buckets. Public: commitments[4] = Poseidon(amount_i, salt_i), threshold, covenantId.
// Private: amounts[4], salts[4]. valid (publicSignals[0]) == 1 iff sum(amounts) >= threshold.
// Usage: node prove_solvency_sum.js [threshold] [covenantId]   (amounts/salts are fixed sample)
const WASM = path.join(__dirname, "solvency_sum_js/solvency_sum.wasm");
const ZKEY = path.join(__dirname, "solvency_sum.zkey");
const OUT = path.join(__dirname, "solvency_sum_proof.json");

async function main() {
    const amounts = ["25000", "30000", "10000", "5000"]; // sum = 70000
    const salts = ["111", "222", "333", "444"];
    const threshold = (process.argv[2] || "60000").toString(); // 70000 >= 60000 -> valid = 1
    const covenantId = (process.argv[3] || "11111111111111111111").toString();

    const commitments = [];
    for (let i = 0; i < 4; i++) {
        commitments.push(await hash([amounts[i], salts[i]]));
    }

    const input = {
        commitments,
        covenantId,
        threshold,
        amounts,
        salts,
    };
    const wtns = path.join(__dirname, ".wtns_solvency_sum.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
