#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "anon_credential_js/anon_credential.wasm");
const ZKEY = path.join(__dirname, "anon_credential.zkey");
const OUT = path.join(__dirname, "anon_credential_proof.json");

// Args: <secretCred> <attrValue> <minAttr> <covenantId>
async function main() {
    const secretCred = BigInt(process.argv[2] || "123456789");
    const attrValue = BigInt(process.argv[3] || "750"); // e.g. credit score, reputation, etc.
    const minAttr = BigInt(process.argv[4] || "700");
    const covenantId = BigInt(process.argv[5] || "42");

    // credNullifier = MiMC7(secretCred) with k=0, matching the in-circuit MiMC7(91).
    const m = await mimcjs.buildMimc7();
    const credNullifier = m.F.toObject(m.hash(m.F.e(secretCred), m.F.zero)).toString();

    const input = {
        secretCred: secretCred.toString(),
        attrValue: attrValue.toString(),
        credNullifier,
        minAttr: minAttr.toString(),
        covenantId: covenantId.toString(),
    };

    const wtns = path.join(__dirname, ".wtns.anon_credential.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
