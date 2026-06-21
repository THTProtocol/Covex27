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
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[4] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";

    const input = {
        current_daa: current.toString(),
        lock_threshold: threshold.toString(),
        covenantId,
    };
    const wtns = path.join(__dirname, "timelock/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "valid=", publicSignals[0], "pub=", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
