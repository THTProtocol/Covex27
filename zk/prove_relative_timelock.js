#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "relative_timelock_js/relative_timelock.wasm");
const ZKEY = path.join(__dirname, "relative_timelock.zkey");
const OUT = path.join(__dirname, "relative_timelock_proof.json");

async function main() {
    const current = BigInt(process.argv[2] || "2000000");
    const reference = BigInt(process.argv[3] || "1000000");
    const lockDuration = BigInt(process.argv[4] || "500000");

    const input = {
        current_daa: current.toString(),
        reference_daa: reference.toString(),
        lock_duration: lockDuration.toString(),
        valid: "1",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });