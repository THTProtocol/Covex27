#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "age_verification_js/age_verification.wasm");
const ZKEY = path.join(__dirname, "age_verification.zkey");
const OUT = path.join(__dirname, "age_verification_proof.json");

async function main() {
    const birthYear = BigInt(process.argv[2] || "1990");
    const currentYear = BigInt(process.argv[3] || "2026");
    const minAge = BigInt(process.argv[4] || "18");
    const covenantId = BigInt(process.argv[5] || "1");
    const m = await mimcjs.buildMimc7();
    const commitment = m.F.toObject(m.hash(m.F.e(birthYear), m.F.zero)).toString();
    const input = {
        commitment,
        covenantId: covenantId.toString(),
        current_year: currentYear.toString(),
        min_age: minAge.toString(),
        birth_year: birthYear.toString(),
    };
    const wtns = path.join(__dirname, ".wtns.age.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });