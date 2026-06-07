#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "turn_timer_js/turn_timer.wasm");
const ZKEY = path.join(__dirname, "turn_timer.zkey");
const OUT = path.join(__dirname, "turn_timer_proof.json");

async function main() {
    const current = BigInt(process.argv[2] || "1000100");
    const lastMove = BigInt(process.argv[3] || "1000000");
    const maxDelta = BigInt(process.argv[4] || "300");
    const moveHash = BigInt(process.argv[5] || "777777");

    const input = {
        current_daa: current.toString(),
        last_move_daa: lastMove.toString(),
        max_delta: maxDelta.toString(),
        move_hash: moveHash.toString(),
    };
    const wtns = path.join(__dirname, "turn_timer/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });