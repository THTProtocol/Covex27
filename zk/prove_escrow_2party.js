#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "escrow_2party_js/escrow_2party.wasm");
const ZKEY = path.join(__dirname, "escrow_2party.zkey");
const OUT = path.join(__dirname, "escrow_2party_proof.json");

async function main() {
    const depositDaa = process.argv[2] || "1000000";
    const timeoutDaa = process.argv[3] || "100";
    const currentDaa = process.argv[4] || "1000150";
    const outcome = process.argv[5] || "0"; // 0 = refund after timeout
    const covenantId = process.argv[6] || "12345"; // H4 cross-covenant replay binding (public)
    const input = { deposit_daa: depositDaa, timeout_daa: timeoutDaa, current_daa: currentDaa, outcome, covenantId };
    const wtns = path.join(__dirname, ".wtns.escrow.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "outcome=", outcome);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });