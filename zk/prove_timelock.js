#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "timelock/output/timelock_absolute_js/timelock_absolute.wasm");
const ZKEY = path.join(__dirname, "timelock/output/timelock_absolute.zkey");
const OUT = path.join(__dirname, "timelock/timelock_proof.json");

async function main() {
    const current = BigInt(process.argv[2] || "1000000");
    const threshold = BigInt(process.argv[3] || "500000");

    const input = {
        current_daa: current.toString(),
        lock_threshold: threshold.toString(),
    };
    const wtns = path.join(__dirname, "timelock/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "valid=", publicSignals[2] || publicSignals[publicSignals.length - 1]);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });