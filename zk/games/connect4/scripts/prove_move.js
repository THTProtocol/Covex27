#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const BASE = path.resolve(__dirname, "..");
const WASM = path.join(BASE, "output", "connect4_v1_js", "connect4_v1.wasm");
const ZKEY = path.join(BASE, "output", "connect4_v1.zkey");

let mimc7;
async function getMiMC7() {
    if (!mimc7) mimc7 = await mimcjs.buildMimc7();
    return mimc7;
}

async function boardHash(board, player) {
    const m = await getMiMC7();
    const F = m.F;
    let state = m.hash(F.zero, F.zero);
    for (const v of board) state = m.hash(F.add(state, F.e(BigInt(v))), F.zero);
    state = m.hash(F.add(state, F.e(BigInt(player))), F.zero);
    return F.toObject(state);
}

function idx(col, row) { return col + row * 7; }

async function main() {
    const col = parseInt(process.argv[2] || "3", 10);
    const player = parseInt(process.argv[3] || "1", 10);

    const oldBoard = new Array(42).fill(0);
    const landingRow = 0;
    const newBoard = [...oldBoard];
    newBoard[idx(col, landingRow)] = player;

    const oldHash = await boardHash(oldBoard, player);
    const nextPlayer = player === 1 ? 2 : 1;
    const newHash = await boardHash(newBoard, nextPlayer);

    const input = {
        old_board_hash: oldHash.toString(),
        new_board_hash: newHash.toString(),
        player_to_move: player.toString(),
        move_column: col.toString(),
        game_status: "0",
        old_board: oldBoard.map(String),
        new_board: newBoard.map(String),
        landing_row: landingRow.toString(),
        win_witness_cells: ["0", "0", "0", "0"],
        win_witness_active: "0",
    };

    const wtns = path.join(BASE, "output", "move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    const out = path.join(BASE, "output", "proofs", `c4_col${col}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof written:", out);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });