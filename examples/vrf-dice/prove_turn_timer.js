#!/usr/bin/env node
"use strict";
/**
 * prove_turn_timer.js — stub for turn_timer.circom (Covex27)
 * "more game properties": per-turn timer/clock proofs (DAA elapsed <= max).
 * Refs vision 4.3 shared game primitives, Phase1, used in all games + connect4/tictactoe/chess.
 * Reuses DAA range pattern (see relative_timelock too).
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "game_properties/output/turn_timer_js/turn_timer.wasm");
const ZKEY = path.join(__dirname, "game_properties/output/turn_timer.zkey");
const OUT = path.join(__dirname, "game_properties/turn_timer_proof.json");

async function main() {
    const current = BigInt(process.argv[2] || "1000100");  // elapsed=100 <=300
    const start = BigInt(process.argv[3] || "1000000");
    const maxT = BigInt(process.argv[4] || "300");
    const player = BigInt(process.argv[5] || "1");

    const m = await mimcjs.buildMimc7();
    const moveH = m.F.toObject(m.hash(m.F.e(BigInt(777)), m.F.zero)).toString(); // demo move secret 777

    const input = {
        current_daa: current.toString(),
        turn_start_daa: start.toString(),
        max_turn_time: maxT.toString(),
        player_to_move: player.toString(),
        move_hash: moveH,
        move_secret: "777",
    };
    const wtns = path.join(__dirname, "game_properties/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
