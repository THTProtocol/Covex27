#!/usr/bin/env node
// prove_move.js — Witness generator + prover for chess_v1.circom (Covex27)

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const BASE = path.resolve(__dirname, "..");
const WASM = path.join(BASE, "output", "chess_v1_build", "chess_v1_js", "chess_v1.wasm");
const ZKEY = path.join(BASE, "output", "chess_v1.zkey");
const VKEY = path.join(BASE, "output", "chess_v1_vkey.json");

let mimc7;
async function getMiMC7() {
    if (!mimc7) mimc7 = await mimcjs.buildMimc7();
    return mimc7;
}

async function fullPositionHash(board, playerToMove, castlingRights, enPassantTarget, halfmoveClock) {
    const m = await getMiMC7();
    const F = m.F;
    // Matches FullPositionHasher: h0 = MiMC7(0), then chain absorb board + metadata
    let state = m.hash(F.zero, F.zero);
    const chain = [...board, playerToMove, castlingRights, enPassantTarget, halfmoveClock];
    for (const v of chain) {
        state = m.hash(F.add(state, F.e(BigInt(v))), F.zero);
    }
    return F.toObject(state);
}

function enc(pt, col) { return pt | (col << 3); }
const E = enc(0, 0);

function initialBoard() {
    const pieces = [4, 2, 3, 5, 6, 3, 2, 1];
    const b = new Array(64).fill(E);
    for (let f = 0; f < 8; f++) {
        b[f] = enc(pieces[f], 0);
        b[f + 8] = enc(1, 0);
        b[f + 48] = enc(1, 1);
        b[f + 56] = enc(pieces[f], 1);
    }
    return b;
}

function file(sq) { return sq & 7; }
function rank(sq) { return sq >> 3; }
function sq(f, r) { return f + r * 8; }

function unpack(p) {
    return { type: p & 7, color: (p >> 3) & 1, isEmpty: (p & 7) === 0 };
}

function pieceAttacksSquare(board, from, target, pieceType, pieceColor) {
    const ff = file(from), fr = rank(from);
    const tf = file(target), tr = rank(target);
    const adf = Math.abs(ff - tf), adr = Math.abs(fr - tr);
    switch (pieceType) {
        case 1: {
            const dir = pieceColor === 0 ? 1 : -1;
            return adf === 1 && tr - fr === dir;
        }
        case 2: return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
        case 3: return adf === adr && adf > 0 && pathClear(board, from, target);
        case 4: return ((adf === 0 && adr > 0) || (adr === 0 && adf > 0)) && pathClear(board, from, target);
        case 5: return ((adf === adr && adf > 0) || adf === 0 || adr === 0) && adf + adr > 0 && pathClear(board, from, target);
        case 6: return adf <= 1 && adr <= 1 && adf + adr > 0;
        default: return false;
    }
}

function pathClear(board, from, to) {
    const ff = file(from), fr = rank(from);
    const tf = file(to), tr = rank(to);
    const df = Math.sign(tf - ff), dr = Math.sign(tr - fr);
    let cf = ff + df, cr = fr + dr;
    while (cf !== tf || cr !== tr) {
        if (!unpack(board[sq(cf, cr)]).isEmpty) return false;
        cf += df;
        cr += dr;
    }
    return true;
}

function findKingSquare(board, color) {
    for (let i = 0; i < 64; i++) {
        const p = unpack(board[i]);
        if (p.type === 6 && p.color === color) return i;
    }
    return -1;
}

function attackersOnSquare(board, target, attackerColor) {
    const squares = [], active = [];
    for (let i = 0; i < 64; i++) {
        const p = unpack(board[i]);
        if (!p.isEmpty && p.color === attackerColor && pieceAttacksSquare(board, i, target, p.type, p.color)) {
            squares.push(i);
            active.push(1);
        }
    }
    while (squares.length < 12) { squares.push(0); active.push(0); }
    return { squares: squares.slice(0, 12), active: active.slice(0, 12) };
}

function isPawnMoveValid(board, from, to, promotionPiece) {
    const pt = unpack(board[from]);
    const dt = unpack(board[to]);
    const ff = file(from), fr = rank(from);
    const tf = file(to), tr = rank(to);
    const dir = pt.color === 0 ? 1 : -1;

    if (ff === tf && tr === fr + dir && dt.isEmpty)
        return { valid: true, capture: false, double: false, ep: false, promo: tr === (pt.color === 0 ? 7 : 0), inter: 0, epCap: E };

    if (ff === tf && tr === fr + 2 * dir && fr === (pt.color === 0 ? 1 : 6) && dt.isEmpty) {
        const inter = board[sq(ff, fr + dir)];
        if (unpack(inter).isEmpty)
            return { valid: true, capture: false, double: true, ep: false, promo: false, inter, epCap: E };
    }

    if (Math.abs(ff - tf) === 1 && tr === fr + dir && !dt.isEmpty && dt.color !== pt.color)
        return { valid: true, capture: true, double: false, ep: false, promo: tr === (pt.color === 0 ? 7 : 0), inter: 0, epCap: E };

    if (Math.abs(ff - tf) === 1 && tr === fr + dir && dt.isEmpty) {
        const epSquare = sq(tf, fr);
        const epPiece = board[epSquare];
        const epu = unpack(epPiece);
        if (!epu.isEmpty && epu.type === 1 && epu.color !== pt.color)
            return { valid: true, capture: true, double: false, ep: true, promo: false, inter: 0, epCap: epPiece };
    }
    return { valid: false };
}

function isValidPieceMove(board, from, to) {
    const pt = unpack(board[from]);
    const dt = unpack(board[to]);
    if (pt.isEmpty) return false;
    if (!dt.isEmpty && dt.color === pt.color) return false;
    const adf = Math.abs(file(from) - file(to));
    const adr = Math.abs(rank(from) - rank(to));
    switch (pt.type) {
        case 2: return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
        case 3: return adf === adr && adf > 0 && pathClear(board, from, to);
        case 4: return ((adf === 0 && adr > 0) || (adr === 0 && adf > 0)) && pathClear(board, from, to);
        case 5: return ((adf === adr && adf > 0) || adf === 0 || adr === 0) && adf + adr > 0 && pathClear(board, from, to);
        case 6: return adf <= 1 && adr <= 1 && adf + adr > 0;
        default: return false;
    }
}

function replicateBoardUpdater(oldBoard, from, to, promotionPiece, isCapture, isEnPassant, isPromotion, epCapSq, newEpTarget, oldHm) {
    const pt = unpack(oldBoard[from]);
    const newPieceType = isPromotion ? promotionPiece : pt.type;
    const newPiece = enc(newPieceType, pt.color);
    const nb = new Array(64);
    for (let i = 0; i < 64; i++) {
        if (i === to) nb[i] = newPiece;
        else if (i === from) nb[i] = E;
        else if (isEnPassant && i === epCapSq) nb[i] = E;
        else nb[i] = oldBoard[i];
    }
    // Match BoardUpdater.circom logic (increments on pawn/capture, else 0)
    const resetClock = (pt.type === 1 ? 1 : 0) + isCapture;
    const newHm = resetClock === 0 ? 0 : oldHm + 1;
    return { newBoard: nb, newEpTarget, newHalfmoveClock: newHm };
}

function pad12(arr, fill = 0) {
    const out = arr.slice(0, 12);
    while (out.length < 12) out.push(fill);
    return out;
}

function pad8(arr, fill = 0) {
    const out = arr.slice(0, 8);
    while (out.length < 8) out.push(fill);
    return out;
}

function pad100(arr, fill = 0) {
    const out = arr.slice(0, 100);
    while (out.length < 100) out.push(fill);
    return out;
}

async function computeWitness(board, from, to, promotionPiece, playerToMove, oldTimers, oldRights, oldEp, oldHmClock, elapsed, historyHashes = [], historyLen = 0) {
    const pt = unpack(board[from]);
    const dt = unpack(board[to]);
    const ff = file(from), fr = rank(from);
    const tf = file(to), tr = rank(to);

    let pawnResult = { valid: false, capture: false, double: false, ep: false, promo: false, inter: 0, epCap: E };
    if (pt.type === 1) pawnResult = isPawnMoveValid(board, from, to, promotionPiece);

    const pathIntermediate = [], pathPieces = [];
    if ([3, 4, 5].includes(pt.type)) {
        const df = Math.sign(tf - ff), dr = Math.sign(tr - fr);
        let cf = ff + df, cr = fr + dr;
        while (cf !== tf || cr !== tr) {
            pathPieces.push(board[sq(cf, cr)] || E);
            pathIntermediate.push(1);
            cf += df; cr += dr;
        }
    }
    while (pathPieces.length < 7) { pathPieces.push(E); pathIntermediate.push(0); }

    const interDir = pt.color === 0 ? 1 : -1;
    const interPiece = board[sq(ff, fr + interDir)] || E;
    const epCapturable = board[sq(tf, fr)] || E;

    const castlingSq = [E, E, E];
    if (pt.type === 6 && Math.abs(tf - ff) === 2) {
        if (tf > ff) {
            castlingSq[0] = board[sq(ff + 1, fr)];
            castlingSq[1] = board[sq(ff + 2, fr)];
        } else {
            castlingSq[0] = board[sq(ff - 1, fr)];
            castlingSq[1] = board[sq(ff - 2, fr)];
            castlingSq[2] = board[sq(ff - 3, fr)];
        }
    }

    let isCapture = pt.type === 1 ? (pawnResult.capture ? 1 : 0) : (!dt.isEmpty ? 1 : 0);
    if (pawnResult.ep) isCapture = 1;
    const isPromotion = pawnResult.promo ? 1 : 0;
    const isCastling = (pt.type === 6 && Math.abs(tf - ff) === 2) ? 1 : 0;
    const epCapSquareVal = pawnResult.ep ? sq(tf, fr) : 0;

    let newEpTarget = 255;
    if (pawnResult.double) newEpTarget = sq(ff, fr + interDir);

    const resetClock = (pt.type === 1 ? 1 : 0) + (isCapture ? 1 : 0);
    const newHmClock = resetClock === 0 ? 0 : oldHmClock + 1;

    let newRights = oldRights;
    if (pt.type === 6) newRights &= pt.color === 0 ? ~3 : ~12;
    if (pt.type === 4) {
        if (from === 0) newRights &= ~1;
        if (from === 7) newRights &= ~2;
        if (from === 56) newRights &= ~4;
        if (from === 63) newRights &= ~8;
    }

    const elapsedSec = Math.max(1, elapsed || 5);
    const newTw = playerToMove === 0 ? oldTimers[0] - elapsedSec : oldTimers[0];
    const newTb = playerToMove === 1 ? oldTimers[1] - elapsedSec : oldTimers[1];
    const nextPlayer = 1 - playerToMove;

    const isEnPassant = pawnResult.ep ? 1 : 0;
    const { newBoard, newHalfmoveClock: computedHm, newEpTarget: computedEp } = replicateBoardUpdater(
        board, from, to, promotionPiece, isCapture, isEnPassant, isPromotion, epCapSquareVal, newEpTarget, oldHmClock
    );

    const oldHash = await fullPositionHash(board, playerToMove, oldRights, oldEp, oldHmClock);
    const newHash = await fullPositionHash(newBoard, nextPlayer, newRights, computedEp, computedHm);

    const opponentColor = 1 - playerToMove;
    const kingSq = findKingSquare(board, playerToMove);
    const preAtk = attackersOnSquare(board, kingSq, opponentColor);

    const postKingSq = findKingSquare(newBoard, playerToMove);
    const postAtk = attackersOnSquare(newBoard, postKingSq, opponentColor);

    const baseRank = 7 * playerToMove;
    const traverseSq0 = 5 + 8 * baseRank;
    const traverseSq1 = 6 + 8 * baseRank;
    const trav0 = attackersOnSquare(board, traverseSq0, opponentColor);
    const trav1 = attackersOnSquare(board, traverseSq1, opponentColor);

    const oppKingSq = findKingSquare(newBoard, nextPlayer);
    const oppAtk = attackersOnSquare(newBoard, oppKingSq, playerToMove);

    return {
        old_board_hash: oldHash.toString(),
        new_board_hash: newHash.toString(),
        player_to_move: playerToMove,
        move_from: from,
        move_to: to,
        promotion_piece: promotionPiece || 0,
        new_timer_white: newTw,
        new_timer_black: newTb,
        game_status: 0, // ongoing
        old_board: board,
        old_timer_white: oldTimers[0],
        old_timer_black: oldTimers[1],
        elapsed_seconds: elapsedSec,
        old_castling_rights: oldRights,
        old_en_passant_target: oldEp,
        old_halfmove_clock: oldHmClock,
        intermediate_piece: interPiece,
        en_passant_captured: epCapturable,
        path_is_intermediate: pathIntermediate,
        path_pieces: pathPieces,
        castling_empty_squares: castlingSq,
        new_ep_target: computedEp,
        is_capture_flag: isCapture,
        is_promotion_flag: isPromotion,
        is_castling_flag: isCastling,
        en_passant_captured_square: epCapSquareVal,
        history_hashes: pad100(historyHashes),
        history_len: historyLen,
        insufficient_material: 0,
        candidate_from: pad8([]),
        candidate_to: pad8([]),
        candidate_active: pad8([]),
        pre_attack_witness_squares: preAtk.squares,
        pre_attack_witness_active: preAtk.active,
        post_attack_witness_squares: postAtk.squares,
        post_attack_witness_active: postAtk.active,
        traverse0_witness_squares: trav0.squares,
        traverse0_witness_active: trav0.active,
        traverse1_witness_squares: trav1.squares,
        traverse1_witness_active: trav1.active,
        opp_witness_squares: oppAtk.squares,
        opp_witness_active: oppAtk.active,
    };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log("Usage: node scripts/prove_move.js <from> <to> [promotion]");
        process.exit(1);
    }
    const from = parseInt(args[0]), to = parseInt(args[1]);
    const prom = args[2] ? parseInt(args[2]) : 0;

    if (!fs.existsSync(WASM)) {
        console.error(`Missing WASM: ${WASM}`);
        console.error("Run: bash scripts/setup_chess.sh (compile step)");
        process.exit(1);
    }

    const board = initialBoard();
    const witness = await computeWitness(board, from, to, prom, 0, [600, 600], 15, 255, 0, 5);

    console.log(`\n=== chess_v1 witness: ${from} -> ${to} ===`);
    const wtnsFile = path.join(BASE, "output", `witness_${from}_${to}.wtns`);

    try {
        await snarkjs.wtns.calculate(witness, WASM, wtnsFile);
        console.log("Witness: OK (move legal)");

        if (fs.existsSync(ZKEY)) {
            const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtnsFile);
            const proofFile = path.join(BASE, "output", "proofs", `move_${from}_${to}.json`);
            fs.mkdirSync(path.dirname(proofFile), { recursive: true });
            fs.writeFileSync(proofFile, JSON.stringify({ proof, publicSignals }, null, 2));
            const vkey = JSON.parse(fs.readFileSync(VKEY, "utf8"));
            const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
            console.log(`Proof: ${valid ? "VALID" : "INVALID"}`);
            console.log(`Saved: ${proofFile}`);

            const verifyScript = path.join(BASE, "..", "..", "verify_chess.js");
            if (fs.existsSync(verifyScript)) {
                fs.writeFileSync("/tmp/chess_proof_test.json", JSON.stringify({ proof, publicSignals }));
                const { execSync } = require("child_process");
                const out = execSync(`node "${verifyScript}" /tmp/chess_proof_test.json`, { encoding: "utf8" });
                console.log(`Oracle verifier: ${out.trim()}`);
            }
        } else {
            console.log("No zkey yet — run: bash scripts/setup_chess.sh");
        }
        fs.unlinkSync(wtnsFile);
    } catch (e) {
        console.error(`FAILED: ${e.message}`);
        process.exit(1);
    }
}

main().catch(e => { console.error(e); process.exit(1); });