#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_confidential_transfer.js - real Groth16 proof for confidential_transfer (Covex)
//
// HONEST witness: a balanced single-sender transfer.
//   senderOld == senderNew + amount + fee  (1000 == 300 + 690 + 10)
// The three Poseidon commitments are computed with the SAME circomlib Poseidon the circuit uses
// (lib/poseidon_hash) so the in-circuit re-opening matches.
//
// Public layout: [valid, cOld, cNew, cAmt, fee, covenantId]. publicSignals[0] must be 1.
// Usage: node prove_confidential_transfer.js [senderOld] [amount] [fee] [covenantId]
const WASM = path.join(__dirname, "confidential_transfer_js/confidential_transfer.wasm");
const ZKEY = path.join(__dirname, "confidential_transfer.zkey");
const OUT = path.join(__dirname, "confidential_transfer_proof.json");

async function main() {
    const senderOld = BigInt(process.argv[2] || "1000");
    const amount = BigInt(process.argv[3] || "690");
    const fee = BigInt(process.argv[4] || "10");
    const covenantId = (process.argv[5] || "12975856296764178385096300579349863837782422391258567265242335968196494733975");
    const senderNew = senderOld - amount - fee; // honest conservation
    if (senderNew < 0n) throw new Error("witness not balanced: senderNew would be negative");

    // Blinding factors (in production: fresh random field elements per commitment).
    const saltOld = "111111111111111111111111111111111";
    const saltNew = "222222222222222222222222222222222";
    const saltAmt = "333333333333333333333333333333333";

    const cOld = await hash([senderOld.toString(), saltOld]);
    const cNew = await hash([senderNew.toString(), saltNew]);
    const cAmt = await hash([amount.toString(), saltAmt]);

    const input = {
        cOld,
        cNew,
        cAmt,
        fee: fee.toString(),
        covenantId,
        senderOld: senderOld.toString(),
        senderNew: senderNew.toString(),
        amount: amount.toString(),
        saltOld,
        saltNew,
        saltAmt,
    };

    const wtns = path.join(__dirname, ".wtns_confidential_transfer.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals (valid,cOld,cNew,cAmt,fee,covenantId):", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
