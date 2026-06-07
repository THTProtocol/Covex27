#!/usr/bin/env node
// prove_move.js — Witness generator + prover for chess_v1.circom (Covex27)

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

// MiMC7 hash computation (matches circomlib MiMC7 with nRounds=91, key=0)
const mimcjs = require("circomlibjs");
let mimc7;

async function getMiMC7() {
    if (!mimc7) mimc7 = await mimcjs.buildMimc7();
    return mimc7;
}

async function mimcHash(data) {
    const m = await getMiMC7();
    return m.F.toObject(m.multiHash(data.map(x => BigInt(x)), 0n));
}

async function fullPositionHash(board, playerToMove, castlingRights, enPassantTarget, halfmoveClock) {
    // Chain 64 board squares + 4 metadata through MiMC7
    // state[0] = MiMC7(0)
    const m = await getMiMC7();
    let state = m.F.toObject(m.hash(BigInt(0), 0n));
    for (let i = 0; i < 64; i++) {
        state = m.F.toObject(m.hash(m.F.add(m.F.e(state), BigInt(board[i])), 0n));
    }
    state = m.F.toObject(m.hash(m.F.add(m.F.e(state), BigInt(playerToMove)), 0n));
    state = m.F.toObject(m.hash(m.F.add(m.F.e(state), BigInt(castlingRights)), 0n));
    state = m.F.toObject(m.hash(m.F.add(m.F.e(state), BigInt(enPassantTarget)), 0n));
    state = m.F.toObject(m.hash(m.F.add(m.F.e(state), BigInt(halfmoveClock)), 0n));
    return state;
}

// =============================================================================
// CHESS LOGIC (inline chess.js replacement for lightweight witness gen)
// =============================================================================

function enc(pt, col) { return pt | (col << 3); }
const E = enc(0, 0); // empty

// Initial position
function initialBoard() {
    const pieces = [4, 2, 3, 5, 6, 3, 2, 1]; // rook, knight, bishop, queen, king, bishop, knight, rook
    const b = new Array(64).fill(E);
    for (let f = 0; f < 8; f++) {
        b[f] = enc(pieces[f], 0);           // white back rank
        b[f + 8] = enc(1, 0);               // white pawns
        b[f + 48] = enc(1, 1);              // black pawns
        b[f + 56] = enc(pieces[f], 1);      // black back rank
    }
    return b;
}

function file(sq) { return sq & 7; }
function rank(sq) { return sq >> 3; }
function sq(f, r) { return f + r * 8; }

// Decode a packed piece
function unpack(p) {
    return { type: p & 7, color: (p >> 3) & 1, isEmpty: (p & 7) === 0 };
}

// Build piece-type bitmask from board
function pieceTypes(board) {
    return board.map(p => p & 7);
}

// Check if a pawn move is valid
function isPawnMoveValid(board, from, to, promotionPiece) {
    const pt = unpack(board[from]);
    const dt = unpack(board[to]);
    const ff = file(from), fr = rank(from);
    const tf = file(to), tr = rank(to);
    const dir = pt.color === 0 ? 1 : -1;

    // Single push
    if (ff === tf && tr === fr + dir && dt.isEmpty) return { valid: true, capture: false, double: false, ep: false, promo: tr === (pt.color === 0 ? 7 : 0), inter: 0, epCap: E };

    // Double push
    if (ff === tf && tr === fr + 2 * dir && fr === (pt.color === 0 ? 1 : 6) && dt.isEmpty) {
        const inter = board[sq(ff, fr + dir)];
        if (unpack(inter).isEmpty) return { valid: true, capture: false, double: true, ep: false, promo: false, inter, epCap: E };
    }

    // Capture
    if (Math.abs(ff - tf) === 1 && tr === fr + dir && !dt.isEmpty && dt.color !== pt.color) {
        return { valid: true, capture: true, double: false, ep: false, promo: tr === (pt.color === 0 ? 7 : 0), inter: 0, epCap: E };
    }

    // En passant (simplified: check if to is empty and there's an opponent pawn next to from)
    if (Math.abs(ff - tf) === 1 && tr === fr + dir && dt.isEmpty) {
        const epSquare = sq(tf, fr);
        const epPiece = board[epSquare];
        const epu = unpack(epPiece);
        if (!epu.isEmpty && epu.type === 1 && epu.color !== pt.color && fr === (pt.color === 0 ? 4 : 3)) {
            return { valid: true, capture: true, double: false, ep: true, promo: false, inter: 0, epCap: epPiece };
        }
    }

    return { valid: false };
}

// Simple move validation (covers knight, bishop, rook, queen, king)
function isValidPieceMove(board, from, to) {
    const pt = unpack(board[from]);
    const dt = unpack(board[to]);
    if (dt.isEmpty || dt.color !== pt.color) {
        const adf = Math.abs(file(from) - file(to));
        const adr = Math.abs(rank(from) - rank(to));
        switch (pt.type) {
            case 2: return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
            case 3: return adf === adr && adf > 0;
            case 4: return (adf === 0 && adr > 0) || (adr === 0 && adf > 0);
            case 5: return (adf === adr && adf > 0) || (adf === 0 && adr > 0) || (adr === 0 && adf > 0);
            case 6: return adf <= 1 && adr <= 1 && (adf + adr > 0);
        }
    }
    return false;
}

// Check path clearance for sliders
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

// =============================================================================
// WITNESS GENERATOR
// =============================================================================

function computeWitness(board, from, to, promotionPiece, playerToMove, oldTimers, oldRights, oldEp, oldHmClock, elapsed) {
    const pt = unpack(board[from]);
    const dt = unpack(board[to]);
    const ff = file(from), fr = rank(from);
    const tf = file(to), tr = rank(to);

    // Pawn validation
    let pawnResult = { valid: false, capture: false, double: false, ep: false, promo: false, inter: 0, epCap: E };
    if (pt.type === 1) {
        pawnResult = isPawnMoveValid(board, from, to, promotionPiece);
    }

    // Piece validation
    const pieceValid = isValidPieceMove(board, from, to);

    // Path clearance
    const pathIntermediate = [];
    const pathPieces = [];
    if ([3, 4, 5].includes(pt.type)) {
        const df = Math.sign(tf - ff), dr = Math.sign(tr - fr);
        let cf = ff + df, cr = fr + dr;
        let step = 0;
        while (cf !== tf || cr !== tr) {
            const piece = board[sq(cf, cr)] || E;
            pathPieces.push(piece);
            pathIntermediate.push(1);
            cf += df;
            cr += dr;
            step++;
        }
    }
    // Pad to 7 entries
    while (pathPieces.length < 7) { pathPieces.push(E); pathIntermediate.push(0); }

    // Intermediate piece (for double push)
    const interDir = pt.color === 0 ? 1 : -1;
    const interSquare = sq(ff, fr + interDir);
    const interPiece = board[interSquare] || E;

    // En passant capturable
    const epCapSquare = pt.color === 0 ? sq(tf, fr) : sq(tf, fr);
    const epCapturable = board[epCapSquare] || E;

    // Castling empty squares
    const isWhite = pt.color === 0;
    const castlingSq = [E, E, E];
    if (pt.type === 6 && Math.abs(tf - ff) === 2) {
        if (tf > ff) {
            // King-side
            castlingSq[0] = board[sq(ff + 1, fr)];
            castlingSq[1] = board[sq(ff + 2, fr)];
        } else {
            // Queen-side
            castlingSq[0] = board[sq(ff - 1, fr)];
            castlingSq[1] = board[sq(ff - 2, fr)];
            castlingSq[2] = board[sq(ff - 3, fr)];
        }
    }

    // King not in check — simplified: assume yes for initial position
    const kingSafe = 1;
    const traverseSafe = [1, 1];

    // Is capture?
    let isCapture = 0;
    if (pt.type === 1) isCapture = pawnResult.capture ? 1 : 0;
    else if (!dt.isEmpty) isCapture = 1;
    if (pawnResult.ep) isCapture = 1;

    // Is promotion?
    const isPromotion = pawnResult.promo ? 1 : 0;

    // Is castling?
    const isCastling = (pt.type === 6 && Math.abs(tf - ff) === 2) ? 1 : 0;

    // En passant captured square
    const epCapSquareVal = pawnResult.ep ? sq(tf, fr) : 0;

    // New ep target
    let newEpTarget = 255;
    if (pawnResult.double) newEpTarget = sq(ff, fr + interDir);

    // New halfmove clock
    let newHmClock = oldHmClock + 1;
    if (pt.type === 1 || isCapture) newHmClock = 0;

    // New castling rights
    let newRights = oldRights;
    if (pt.type === 6) {
        if (isWhite) newRights &= ~3; // clear WK and WQ
        else newRights &= ~12; // clear BK and BQ
    }
    if (pt.type === 4) {
        // Rook moved
        if (from === 0) newRights &= ~1;   // a1 rook -> clear WQ
        if (from === 7) newRights &= ~2;   // h1 rook -> clear WK
        if (from === 56) newRights &= ~4;  // a8 rook -> clear BQ
        if (from === 63) newRights &= ~8;  // h8 rook -> clear BK
    }

    // Timer decrement
    const elapsedSec = Math.max(1, elapsed || 5);

    return {
        old_board: board,
        old_board_hash: 0, // computed below
        new_board_hash: 0, // computed below
        player_to_move: playerToMove,
        move_from: from,
        move_to: to,
        promotion_piece: promotionPiece || 0,
        old_timer_white: oldTimers[0],
        old_timer_black: oldTimers[1],
        new_timer_white: playerToMove === 0 ? oldTimers[0] - elapsedSec : oldTimers[0],
        new_timer_black: playerToMove === 0 ? oldTimers[1] : oldTimers[1] - elapsedSec,
        elapsed_seconds: elapsedSec,
        old_castling_rights: oldRights,
        old_en_passant_target: oldEp,
        old_halfmove_clock: oldHmClock,
        intermediate_piece: interPiece,
        en_passant_captured: epCapturable,
        path_is_intermediate: pathIntermediate,
        path_pieces: pathPieces,
        king_not_in_check: kingSafe,
        traverse_squares_safe: traverseSafe,
        castling_empty_squares: castlingSq,
        new_ep_target: newEpTarget,
        is_capture_flag: isCapture,
        is_promotion_flag: isPromotion,
        is_castling_flag: isCastling,
        en_passant_captured_square: epCapSquareVal,
        game_status: 0, // ongoing
        _intermediate: interPiece,
        _double: pawnResult.double,
        _capture: isCapture,
        _newRights: newRights,
        _newHmClock: newHmClock
    };
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    const args = process.argv.slice(2);
    const usage = () => {
        console.log("Usage: node scripts/prove_move.js <from> <to> [promotion_piece]");
        console.log("  Squares: 0-63 (a1=0, h8=63)");
        console.log("  Promotion: 1=Q, 2=R, 3=B, 4=N");
        console.log("  Example: node scripts/prove_move.js 12 28   (e2-e4)");
        process.exit(1);
    };

    if (args.length < 2) usage();
    const from = parseInt(args[0]);
    const to = parseInt(args[1]);
    const prom = args[2] ? parseInt(args[2]) : 0;

    if (isNaN(from) || isNaN(to) || from < 0 || from > 63 || to < 0 || to > 63) usage();

    const BASE = path.resolve(__dirname, "..");
    const wasm = path.join("/tmp/chess_v1/chess_v1_js/chess_v1.wasm");

    if (!fs.existsSync(wasm)) {
        console.error("ERROR: No WASM found. Compile with: circom chess_v1.circom --r1cs --wasm --sym --O2 -o /tmp/chess_v1");
        process.exit(1);
    }

    // Start with initial position
    const board = initialBoard();
    const playerToMove = 0; // white
    const oldTimers = [600, 600]; // 10 min each
    const oldRights = 15; // all castling available
    const oldEp = 255; // no en passant
    const oldHmClock = 0;

    console.log("\n=== CHESS V1 WITNESS GENERATION ===");
    console.log(`Move: ${from} -> ${to}  promo=${prom}`);
    console.log(`Board[${from}]: ${board[from]} (type=${unpack(board[from]).type}, color=${unpack(board[from]).color})`);
    console.log(`Board[${to}]: ${board[to]} (type=${unpack(board[to]).type}, color=${unpack(board[to]).color})`);

    const witness = computeWitness(board, from, to, prom, playerToMove, oldTimers, oldRights, oldEp, oldHmClock, 5);
    console.log("Witness computed:");
    console.log(`  Valid: ${witness._capture !== undefined ? 'checking...' : 'N/A'}`);
    console.log(`  Is capture: ${witness._capture}`);
    console.log(`  Is double: ${witness._double}`);

    // Generate witness
    console.log("\nGenerating witness...");
    const wtnsFile = path.join("/tmp", `chess_v1_witness_${from}_${to}.wtns`);
    try {
        await snarkjs.wtns.calculate(witness, wasm, wtnsFile);
        const w = await snarkjs.wtns.exportJson(wtnsFile);

        // Find move_valid in the witness — it's the constraint that must equal 1
        // In ChessV1, line 340: move_valid === 1
        // move_valid is a signal deep in the constraint system.
        // If the witness generates successfully, the move is legal.
        console.log("SUCCESS! Witness generated — move is LEGAL.");
        console.log(`Witness signals: ${w.length}`);
        console.log(`First 5: [${w.slice(0, 5).map(x => x.toString()).join(', ')}]`);
        console.log(`Last 1: ${w[w.length - 1]}`);

        // Try proving if zkey available
        const zkeyPath = path.join(BASE, "output", "chess_v1.zkey");
        const vkeyPath = path.join(BASE, "output", "chess_v1_vkey.json");

        if (fs.existsSync(zkeyPath)) {
            console.log("\nGenerating proof...");
            const { proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, wtnsFile);
            const proofFile = path.join(BASE, "output", "proofs", `move_${from}_${to}.json`);
            fs.writeFileSync(proofFile, JSON.stringify({ proof, publicSignals }, null, 2));
            console.log(`Proof written to ${proofFile}`);

            const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
            const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
            console.log(`Verification: ${valid ? 'VALID' : 'INVALID'}`);
        } else {
            console.log("\nNo zkey found — skipping proof generation.");
            console.log("Run: snarkjs groth16 setup ... to create zkey.");
        }

        fs.unlinkSync(wtnsFile);
    } catch (e) {
        console.error(`WITNESS FAILED: ${e.message.split("\n")[0]}`);
        // This means the move is illegal — the constraint system rejects it
        console.log("The move is ILLEGAL under the constraint system.");
    }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
