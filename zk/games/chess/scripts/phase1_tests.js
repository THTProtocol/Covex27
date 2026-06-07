#!/usr/bin/env node
// =============================================================================
// phase1_tests.js - Comprehensive test runner for Phase 1 circuits
// =============================================================================
// Runs full witness generation + proof + verify for all test cases.

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
const OUTPUT = path.join(BASE, "output");
const TMP = "/tmp";

// =============================================================================
// HELPERS
// =============================================================================

function field(v) {
    // Convert a JS number or BigInt to a decimal string field element.
    // Negative numbers become p + v.
    const P = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
    if (typeof v === "bigint") {
        v = v < 0n ? P + v : v;
        return v.toString();
    }
    if (Number.isInteger(v)) {
        const bv = BigInt(v);
        return (bv < 0n ? P + bv : bv).toString();
    }
    return String(v);
}

function encode(piece_type, piece_color) {
    return field(piece_type | (piece_color << 3));
}

// =============================================================================
// TEST CASE GENERATORS
// =============================================================================

function generatePieceCodecTests() {
    const tests = [];

    // ---- Encoder: all 14 valid combos (7 types x 2 colors) ----
    for (let pt = 0; pt <= 6; pt++) {
        for (const col of [0, 1]) {
            const packed = pt | (col << 3);
            const empty = pt === 0 ? 1 : 0;
            const sliding = [3, 4, 5].includes(pt) ? 1 : 0;
            tests.push({
                label: `Encode type=${pt} color=${col}`,
                input: {
                    enc_type: pt, enc_color: col,
                    dec_packed: packed,
                    slide_type: pt,
                    color_a: 0, color_b: col === 0 ? 0 : 1,
                    pc_packed: packed, pc_target_color: col,
                    spec_type: pt, spec_target: pt
                },
                check: (sigs) => {
                    if (sigs[0] !== String(packed)) return `enc_packed: ${sigs[0]} != ${packed}`;
                    if (sigs[1] !== String(pt)) return `dec_type: ${sigs[1]} != ${pt}`;
                    if (sigs[2] !== String(col)) return `dec_color: ${sigs[2]} != ${col}`;
                    if (sigs[3] !== String(empty)) return `dec_empty: ${sigs[3]} != ${empty}`;
                    if (sigs[4] !== String(sliding)) return `sliding: ${sigs[4]} != ${sliding}`;
                    if (sigs[5] !== String(col === 0 ? 0 : 0)) return `opponent: bug`; // color_a=0,color_b=0 if col=0 else color_a=0,color_b=1
                    if (sigs[6] !== String(pt === 0 ? 0 : 1)) return `pcolor_match: ${sigs[6]}`;
                    if (sigs[7] !== "1") return `specific_match: ${sigs[7]}`;
                    return null;
                }
            });
        }
    }

    // ---- Black king edge case ----
    tests.push({
        label: `Black king (type=6,color=1 -> packed=14)`,
        input: {
            enc_type: 6, enc_color: 1,
            dec_packed: 14,
            slide_type: 6,
            color_a: 0, color_b: 1,
            pc_packed: 14, pc_target_color: 1,
            spec_type: 6, spec_target: 6
        },
        check: (sigs) => {
            if (sigs[1] !== "6") return "dec_type not 6";
            if (sigs[2] !== "1") return "dec_color not 1";
            if (sigs[3] !== "0") return "dec_empty not 0";
            if (sigs[5] !== "1") return "opponent not 1"; // 0 vs 1 = opponent
            return null;
        }
    });

    // ---- Opponent color: all 4 combos ----
    const oppTests = [[0, 0, 0], [1, 1, 0], [0, 1, 1], [1, 0, 1]];
    for (const [a, b, exp] of oppTests) {
        tests.push({
            label: `Opponent a=${a} b=${b} (exp=${exp})`,
            input: {
                enc_type: 1, enc_color: 0,
                dec_packed: 1,
                slide_type: 1,
                color_a: a, color_b: b,
                pc_packed: 1, pc_target_color: 0,
                spec_type: 1, spec_target: 1
            },
            check: (sigs) => {
                if (sigs[5] !== String(exp)) return `opponent: ${sigs[5]} != ${exp}`;
                return null;
            }
        });
    }

    // ---- IsPieceColor: wrong color ----
    tests.push({
        label: `IsPieceColor black pawn, ask white`,
        input: {
            enc_type: 1, enc_color: 1,
            dec_packed: 9,
            slide_type: 1,
            color_a: 0, color_b: 0,
            pc_packed: 9, pc_target_color: 0,
            spec_type: 1, spec_target: 1
        },
        check: (sigs) => {
            if (sigs[6] !== "0") return `pcolor_match should be 0, got ${sigs[6]}`;
            return null;
        }
    });

    // ---- IsPieceColor: empty square ----
    tests.push({
        label: `IsPieceColor on empty square`,
        input: {
            enc_type: 0, enc_color: 0,
            dec_packed: 0,
            slide_type: 0,
            color_a: 0, color_b: 0,
            pc_packed: 0, pc_target_color: 1,
            spec_type: 0, spec_target: 0
        },
        check: (sigs) => {
            if (sigs[6] !== "0") return `pcolor_match should be 0 (empty), got ${sigs[6]}`;
            if (sigs[3] !== "1") return `dec_empty should be 1, got ${sigs[3]}`;
            return null;
        }
    });

    // ---- IsSpecificPiece: mismatch ----
    tests.push({
        label: `IsSpecificPiece knight vs rook (mismatch)`,
        input: {
            enc_type: 2, enc_color: 0,
            dec_packed: 2,
            slide_type: 2,
            color_a: 0, color_b: 0,
            pc_packed: 2, pc_target_color: 0,
            spec_type: 2, spec_target: 4
        },
        check: (sigs) => {
            if (sigs[7] !== "0") return `specific_match should be 0, got ${sigs[7]}`;
            return null;
        }
    });

    // ---- Sliding: test rook explicitly ----
    tests.push({
        label: `IsSliding rook (piece_type=4)`,
        input: {
            enc_type: 4, enc_color: 0,
            dec_packed: 4,
            slide_type: 4,
            color_a: 0, color_b: 0,
            pc_packed: 4, pc_target_color: 0,
            spec_type: 4, spec_target: 4
        },
        check: (sigs) => {
            if (sigs[4] !== "1") return `sliding should be 1 for rook, got ${sigs[4]}`;
            return null;
        }
    });

    // 14 encoder + 1 bk + 4 opponent + 1 wrongcolor + 1 empty + 1 mismatch + 1 sliding = 23 tests
    return tests;
}

function generateSquareUtilsTests() {
    const tests = [];

    for (let i = 0; i < 64; i++) {
        const f = i % 8;
        const r = Math.floor(i / 8);
        tests.push({
            label: null, // don't spam for all 64
            input: {
                stc_square: i, cts_file: f, cts_rank: r,
                ds_from: i, ds_to: i,
                asa_from: i, asa_to: i,
                ivs_square: i,
                sd_from: i, sd_to: i
            },
            check: (sigs) => {
                if (sigs[0] !== String(f)) return `stc_file ${sigs[0]} != ${f}`;
                if (sigs[1] !== String(r)) return `stc_rank ${sigs[1]} != ${r}`;
                if (sigs[2] !== String(i)) return `cts_square ${sigs[2]} != ${i}`;
                if (sigs[3] !== "0") return `same-square delta_file not 0: ${sigs[3]}`;
                if (sigs[4] !== "0") return `same-square delta_rank not 0: ${sigs[4]}`;
                if (sigs[5] !== "0") return `abs_delta_file not 0`;
                if (sigs[6] !== "0") return `abs_delta_rank not 0`;
                if (sigs[10] !== "0") return `same-square sqdiff should be 0`;
                if (sigs[11] !== "1") return `ivs_valid should be 1`;
                if (sigs[14] !== "0") return `steps should be 0`;
                return null;
            }
        });
    }

    // Delta + alignment edge cases
    const edgeCases = [
        // [name, from, to]
        ["h8->a1 diagonal", 63, 0],
        ["a1->h8 diagonal", 0, 63],
        ["a1->a8 same file", 0, 56],
        ["a1->h1 same rank", 0, 7],
        ["e4->d5 knight move", 28, 35],
        ["e4->c5 knight move", 28, 34],
        ["e4->f6 knight move", 28, 45],
        ["e4->c3 knight move", 28, 18],
        ["e1->e2 (1 step)", 4, 12],
        ["d1->h5 (4 steps diag)", 3, 39],
    ];

    for (const [name, from, to] of edgeCases) {
        const ff = from % 8, fr = Math.floor(from / 8);
        const tf = to % 8, tr = Math.floor(to / 8);
        const adf = Math.abs(ff - tf);
        const adr = Math.abs(fr - tr);
        const sf = (adf === 0 && adr > 0) ? 1 : 0;
        const sr = (adr === 0 && adf > 0) ? 1 : 0;
        const sd = (adf === adr && adf > 0) ? 1 : 0;
        const steps = Math.max(adf, adr);
        const sqdiff = (adf + adr > 0) ? 1 : 0;

        tests.push({
            label: name,
            input: {
                stc_square: from, cts_file: ff, cts_rank: fr,
                ds_from: from, ds_to: to,
                asa_from: from, asa_to: to,
                ivs_square: from,
                sd_from: from, sd_to: to
            },
            check: (sigs) => {
                if (sigs[5] !== String(adf)) return `abs_delta_file ${sigs[5]} != ${adf}`;
                if (sigs[6] !== String(adr)) return `abs_delta_rank ${sigs[6]} != ${adr}`;
                if (sigs[7] !== String(sf)) return `same_file ${sigs[7]} != ${sf}`;
                if (sigs[8] !== String(sr)) return `same_rank ${sigs[8]} != ${sr}`;
                if (sigs[9] !== String(sd)) return `same_diag ${sigs[9]} != ${sd}`;
                if (sigs[10] !== String(sqdiff)) return `sqdiff ${sigs[10]} != ${sqdiff}`;
                if (sigs[14] !== String(steps)) return `steps ${sigs[14]} != ${steps}`;
                return null;
            }
        });
    }

    return tests;
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    const target = process.argv[2] || "all";

    const results = { piece_codec: null, square_utils: null };

    // Piece codec
    if (target === "all" || target === "piece_codec") {
        const wasm = "/tmp/chess_pc/test_piece_codec_js/test_piece_codec.wasm";
        const zkey = path.join(OUTPUT, "test_piece_codec.zkey");
        const vkeyPath = path.join(OUTPUT, "test_piece_codec_vkey.json");

        if (!fs.existsSync(zkey)) {
            console.log("Waiting for PC zkey...");
            return; // skip for now if zkey not ready
        }

        const tests = generatePieceCodecTests();
        console.log(`\n=== Running ${tests.length} PIECE_CODEC tests ===`);
        let passed = 0, failed = 0;
        const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

        for (let i = 0; i < tests.length; i++) {
            const tc = tests[i];
            try {
                const w = path.join(TMP, `w_pc_${i}.wtns`);
                await snarkjs.wtns.calculate(tc.input, wasm, w);
                const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, w);
                const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

                if (!valid) { failed++; console.log(`  ${tc.label}: FAIL (invalid proof)`); continue; }

                const err = tc.check ? tc.check(publicSignals) : null;
                if (err) { failed++; console.log(`  ${tc.label}: FAIL - ${err}`); }
                else { passed++; }
                try { fs.unlinkSync(w); } catch (e) {}
            } catch (e) {
                failed++;
                console.log(`  ${tc.label}: ERROR - ${e.message.split("\\n")[0]}`);
            }
        }
        console.log(`  PIECE_CODEC: ${passed} PASS, ${failed} FAIL`);
        results.piece_codec = { passed, failed, total: tests.length };
    }

    // Square utils
    if (target === "all" || target === "square_utils") {
        const wasm = "/tmp/chess_sq/test_square_utils_js/test_square_utils.wasm";
        const zkey = path.join(OUTPUT, "test_square_utils.zkey");
        const vkeyPath = path.join(OUTPUT, "test_square_utils_vkey.json");

        if (!fs.existsSync(zkey)) {
            console.log("Waiting for SQ zkey...");
            return;
        }

        const tests = generateSquareUtilsTests();
        console.log(`\n=== Running ${tests.length} SQUARE_UTILS tests ===`);
        let passed = 0, failed = 0;
        const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

        for (let i = 0; i < tests.length; i++) {
            const tc = tests[i];
            try {
                const w = path.join(TMP, `w_sq_${i}.wtns`);
                await snarkjs.wtns.calculate(tc.input, wasm, w);
                const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, w);
                const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

                if (!valid) { failed++; if (tc.label) console.log(`  ${tc.label}: FAIL (invalid proof)`); continue; }

                const err = tc.check ? tc.check(publicSignals) : null;
                if (err) { failed++; if (tc.label) console.log(`  ${tc.label}: FAIL - ${err}`); }
                else { passed++; if (tc.label) console.log(`  ${tc.label}: PASS`); }
                try { fs.unlinkSync(w); } catch (e) {}
            } catch (e) {
                failed++;
                if (tc.label) console.log(`  ${tc.label}: ERROR - ${e.message.split("\\n")[0]}`);
            }
        }
        console.log(`  SQUARE_UTILS: ${passed} PASS, ${failed} FAIL`);
        results.square_utils = { passed, failed, total: tests.length };
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("PHASE 1 RESULTS SUMMARY");
    console.log("=".repeat(60));
    for (const [name, r] of Object.entries(results)) {
        if (r) console.log(`  ${name}: ${r.passed}/${r.total} PASS (${r.failed} FAIL)`);
    }
    fs.writeFileSync(path.join(OUTPUT, "phase1_results.json"), JSON.stringify(results, null, 2));
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
