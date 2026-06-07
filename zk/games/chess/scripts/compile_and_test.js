#!/usr/bin/env node
// =============================================================================
// compile_and_test.js — Compile, generate zkey, and prove for Phase 1 circuits
// =============================================================================
// Usage: node scripts/compile_and_test.js [piece_codec|square_utils|all]
// Default: all
//
// For each circuit:
//   1. circom compile → wasm + r1cs
//   2. snarkjs setup (Powers of Tau phase-1 + zkey)
//   3. Generate witness for 10+ test cases
//   4. snarkjs groth16 prove + verify
//   5. Report constraint count and proof times

"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE = path.resolve(__dirname, "..");
const OUTPUT = path.join(BASE, "output");
const CIRCOM = process.env.CIRCOM2 || "circom2";
const SNARKJS = path.join(BASE, "..", "..", "node_modules", ".bin", "snarkjs");
const PTAU = path.join(OUTPUT, "pot15_final.ptau");
const PTAU_POWERS = 15; // 2^15 = 32768, more than enough for our test circuits (~100-300 constraints)

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---------------------------------------------------------------------------
// Step 1: Compile a circom circuit
// ---------------------------------------------------------------------------
function circomCompile(circuitName, circuitPath) {
    const outDir = path.join(OUTPUT, `${circuitName}_js`);
    ensureDir(outDir);

    console.log(`\n=== Compiling ${circuitName} ===`);
    try {
        execSync(
            `${CIRCOM} "${circuitPath}" --r1cs --wasm --sym -o "${outDir}" --O2`,
            { stdio: "inherit", cwd: path.join(BASE, "..", "..") }
        );
    } catch (e) {
        console.error(`COMPILE FAILED for ${circuitName}:`, e.message);
        return null;
    }
    const r1csPath = path.join(outDir, `${circuitName}.r1cs`);
    const wasmPath = path.join(outDir, `${circuitName}_js`, `${circuitName}.wasm`);

    // Count constraints
    const info = JSON.parse(execSync(`"${SNARKJS}" r1cs info "${r1csPath}"`, { encoding: "utf8" }));
    console.log(`  Constraints: ${info.nConstraints}`);
    console.log(`  Variables:   ${info.nVars}`);
    console.log(`  Outputs:     ${info.nOutputs}`);

    return { r1cs: r1csPath, wasm: wasmPath, constraints: info.nConstraints };
}

// ---------------------------------------------------------------------------
// Step 2: Powers of Tau phase-1 (once, shared)
// ---------------------------------------------------------------------------
function setupPtau() {
    if (fs.existsSync(PTAU)) {
        console.log(`\n=== Reusing existing PTAU: ${PTAU} ===`);
        return;
    }
    console.log(`\n=== Generating Powers of Tau (2^${PTAU_POWERS}) ===`);
    ensureDir(OUTPUT);
    execSync(
        `"${SNARKJS}" powersoftau new bn128 ${PTAU_POWERS} "${path.join(OUTPUT, "pot15_0000.ptau")}" -v`,
        { stdio: "inherit" }
    );
    execSync(
        `"${SNARKJS}" powersoftau contribute "${path.join(OUTPUT, "pot15_0000.ptau")}" "${PTAU}" ` +
        `--name="Phase 1" -v -e="chess_test_entropy"`,
        { stdio: "inherit" }
    );
    // Apply a random beacon (fake for test)
    execSync(
        `"${SNARKJS}" powersoftau beacon "${PTAU}" "${path.join(OUTPUT, "pot15_beacon.ptau")}" ` +
        `0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 -n="Final Beacon"`,
        { stdio: "inherit" }
    );
    execSync(
        `"${SNARKJS}" powersoftau prepare phase2 "${path.join(OUTPUT, "pot15_beacon.ptau")}" "${PTAU}" -v`,
        { stdio: "inherit" }
    );
}

// ---------------------------------------------------------------------------
// Step 3: Groth16 setup (zkey + vkey)
// ---------------------------------------------------------------------------
function setupZkey(circuitName, r1csPath) {
    const zkeyPath = path.join(OUTPUT, `${circuitName}.zkey`);
    const vkeyPath = path.join(OUTPUT, `${circuitName}_vkey.json`);

    if (fs.existsSync(zkeyPath)) {
        console.log(`  Reusing existing zkey: ${zkeyPath}`);
        return { zkey: zkeyPath, vkey: vkeyPath };
    }

    console.log(`  Generating zkey for ${circuitName}...`);
    execSync(`"${SNARKJS}" groth16 setup "${r1csPath}" "${PTAU}" "${zkeyPath}"`, { stdio: "inherit" });
    const vkey = JSON.parse(execSync(`"${SNARKJS}" zkey export verificationkey "${zkeyPath}"`, { encoding: "utf8" }));
    fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));
    console.log(`  zkey + vkey generated`);
    return { zkey: zkeyPath, vkey: vkeyPath };
}

// ---------------------------------------------------------------------------
// Step 4: Run test cases
// ---------------------------------------------------------------------------
async function runTests(circuitName, testCases, wasmPath, zkeyPath, vkeyPath) {
    console.log(`\n=== Running ${testCases.length} test cases for ${circuitName} ===`);

    const results = [];
    let passed = 0, failed = 0;

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const label = tc.label || `Case ${i + 1}`;

        try {
            // Generate witness
            const witnessPath = path.join(OUTPUT, `witness_${circuitName}_${i}.wtns`);
            await snarkjs.wtns.calculate(tc.input, wasmPath, witnessPath);

            // Generate proof
            const { proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, witnessPath);

            // Verify proof
            const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
            const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

            if (valid) {
                passed++;
                const expected = tc.expected;
                let mismatch = null;
                if (expected) {
                    for (const [key, val] of Object.entries(expected)) {
                        if (String(publicSignals[expected._idx[key]]) !== String(val)) {
                            mismatch = `${key}: expected ${val}, got ${publicSignals[expected._idx[key]]}`;
                        }
                    }
                }

                results.push({
                    label,
                    status: mismatch ? "FAIL (wrong output)" : "PASS",
                    publicSignals,
                    mismatch
                });
                if (mismatch) {
                    failed++;
                    passed--;
                    console.log(`  ${label}: FAIL — ${mismatch}`);
                } else {
                    console.log(`  ${label}: PASS`);
                }
            } else {
                failed++;
                results.push({ label, status: "FAIL (invalid proof)" });
                console.log(`  ${label}: FAIL — proof verification returned false`);
            }

            // Cleanup witness file
            try { fs.unlinkSync(witnessPath); } catch (e) {}

        } catch (e) {
            failed++;
            results.push({ label, status: `ERROR: ${e.message.split("\n")[0]}` });
            console.log(`  ${label}: ERROR — ${e.message.split("\n")[0]}`);
        }
    }

    console.log(`\n  Results: ${passed} PASS, ${failed} FAIL out of ${testCases.length}`);
    return { passed, failed, results };
}

// =============================================================================
// TEST CASE GENERATORS
// =============================================================================

// Encoding helper
function encode(piece_type, piece_color) {
    const packed = piece_type | (piece_color << 3);
    return { piece_type, piece_color, packed };
}

// Decoding helper
function decode(packed) {
    const piece_type = packed & 0x7;
    const piece_color = (packed >> 3) & 0x1;
    const is_empty = piece_type === 0 ? 1 : 0;
    return { piece_type, piece_color, is_empty };
}

function generatePieceCodecTests() {
    // Helper: map output names to index in publicSignals array
    const idx = {
        enc_packed: 0,
        dec_type: 1,
        dec_color: 2,
        dec_empty: 3,
        sliding: 4,
        opponent: 5,
        pcolor_match: 6,
        specific_match: 7
    };

    const tests = [];

    // ---- Encoder tests ----
    for (let piece_type = 0; piece_type <= 6; piece_type++) {
        for (const piece_color of [0, 1]) {
            const e = encode(piece_type, piece_color);
            tests.push({
                label: `Encode type=${piece_type} color=${piece_color} (packed=${e.packed})`,
                input: {
                    enc_type: piece_type,
                    enc_color: piece_color,
                    dec_packed: e.packed,
                    slide_type: piece_type,
                    color_a: 0, color_b: 0,
                    pc_packed: e.packed,  // non-empty with correct color
                    pc_target_color: piece_color,
                    spec_type: piece_type,
                    spec_target: piece_type
                },
                expected: {
                    enc_packed: e.packed,
                    dec_type: piece_type,
                    dec_color: piece_color,
                    dec_empty: piece_type === 0 ? 1 : 0,
                    sliding: [3,4,5].includes(piece_type) ? 1 : 0,
                    opponent: 0,
                    pcolor_match: piece_type === 0 ? 0 : 1,
                    specific_match: 1,
                    _idx: idx
                }
            });
        }
    }
    // Encoder: 7 types × 2 colors = 14 test cases

    // ---- Decoder edge cases ----
    // Empty square
    tests.push({
        label: `Decode empty (packed=0)`,
        input: {
            enc_type: 0, enc_color: 0,
            dec_packed: 0,
            slide_type: 0,
            color_a: 0, color_b: 0,
            pc_packed: 0,
            pc_target_color: 0,
            spec_type: 0, spec_target: 0
        },
        expected: {
            enc_packed: 0, dec_type: 0, dec_color: 0, dec_empty: 1,
            sliding: 0, opponent: 0, pcolor_match: 0, specific_match: 1,
            _idx: idx
        }
    });

    // Black king (piece_type=6, color=1 → packed=14)
    tests.push({
        label: `Decode black king (packed=14)`,
        input: {
            enc_type: 6, enc_color: 1,
            dec_packed: 14,
            slide_type: 6,
            color_a: 0, color_b: 1,
            pc_packed: 14,
            pc_target_color: 1,
            spec_type: 6, spec_target: 6
        },
        expected: {
            enc_packed: 14, dec_type: 6, dec_color: 1, dec_empty: 0,
            sliding: 0, opponent: 1, pcolor_match: 1, specific_match: 1,
            _idx: idx
        }
    });

    // ---- Opponent color tests ----
    for (const [a, b] of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
        tests.push({
            label: `Opponent a=${a} b=${b} (expected=${a ^ b})`,
            input: {
                enc_type: 1, enc_color: 0,
                dec_packed: 1,
                slide_type: 1,
                color_a: a, color_b: b,
                pc_packed: 1, pc_target_color: 0,
                spec_type: 1, spec_target: 1
            },
            expected: {
                enc_packed: 1, dec_type: 1, dec_color: 0, dec_empty: 0,
                sliding: 0, opponent: a ^ b, pcolor_match: 1, specific_match: 1,
                _idx: idx
            }
        });
    }

    // ---- IsPieceColor: wrong color ---
    tests.push({
        label: `IsPieceColor wrong color (black pawn, ask white)`,
        input: {
            enc_type: 1, enc_color: 1,
            dec_packed: 9,  // black pawn
            slide_type: 1,
            color_a: 0, color_b: 0,
            pc_packed: 9, pc_target_color: 0,  // ask for white
            spec_type: 1, spec_target: 1
        },
        expected: {
            enc_packed: 9, dec_type: 1, dec_color: 1, dec_empty: 0,
            sliding: 0, opponent: 0, pcolor_match: 0, specific_match: 1,
            _idx: idx
        }
    });

    // ---- IsPieceColor: empty square against any color ---
    tests.push({
        label: `IsPieceColor empty square`,
        input: {
            enc_type: 0, enc_color: 0,
            dec_packed: 0,
            slide_type: 0,
            color_a: 0, color_b: 0,
            pc_packed: 0, pc_target_color: 1,
            spec_type: 0, spec_target: 0
        },
        expected: {
            enc_packed: 0, dec_type: 0, dec_color: 0, dec_empty: 1,
            sliding: 0, opponent: 0, pcolor_match: 0, specific_match: 1,
            _idx: idx
        }
    });

    // ---- IsSpecificPiece: mismatch ---
    tests.push({
        label: `IsSpecificPiece mismatch (knight vs rook)`,
        input: {
            enc_type: 2, enc_color: 0,
            dec_packed: 2,
            slide_type: 2,
            color_a: 0, color_b: 0,
            pc_packed: 2, pc_target_color: 0,
            spec_type: 2, spec_target: 4  // knight vs rook
        },
        expected: {
            enc_packed: 2, dec_type: 2, dec_color: 0, dec_empty: 0,
            sliding: 0, opponent: 0, pcolor_match: 1, specific_match: 0,
            _idx: idx
        }
    });

    // ---- IsSlidingPiece: all piece types ---
    // Already covered in encoder loop above. But add explicit sliding-edge:
    tests.push({
        label: `Sliding: pawn=no, knight=no, bishop=yes, rook=yes, queen=yes, king=no [summary]`,
        input: {
            enc_type: 3, enc_color: 0,
            dec_packed: 3,
            slide_type: 4,  // test rook
            color_a: 0, color_b: 0,
            pc_packed: 3, pc_target_color: 0,
            spec_type: 3, spec_target: 3
        },
        expected: {
            enc_packed: 3, dec_type: 3, dec_color: 0, dec_empty: 0,
            sliding: 1, opponent: 0, pcolor_match: 1, specific_match: 1,
            _idx: idx
        }
    });

    // ---- Rejected: packed=15 (invalid) ----
    // This should FAIL to compile/verify because PieceDecoder enforces !=15
    tests.push({
        label: `REJECT: packed=15 (invalid, should reject)`,
        input: {
            enc_type: 6, enc_color: 1,   // valid encoder inputs
            dec_packed: 15,               // INVALID — should cause constraint failure
            slide_type: 6,
            color_a: 0, color_b: 0,
            pc_packed: 14, pc_target_color: 1,
            spec_type: 6, spec_target: 6
        },
        expected: { _idx: idx },  // No expected values — should fail
        expectFail: true
    });

    // ---- Encoder rejection: piece_type=7 ---
    tests.push({
        label: `REJECT: encode type=7 (invalid, should reject)`,
        input: {
            enc_type: 7,
            enc_color: 0,
            dec_packed: 0,
            slide_type: 0,
            color_a: 0, color_b: 0,
            pc_packed: 0, pc_target_color: 0,
            spec_type: 0, spec_target: 0
        },
        expected: { _idx: idx },
        expectFail: true
    });

    // ---- Encoder rejection: piece_color=2 (not a bit) ---
    tests.push({
        label: `REJECT: encode color=2 (invalid, should reject)`,
        input: {
            enc_type: 1,
            enc_color: 2,
            dec_packed: 1,
            slide_type: 1,
            color_a: 0, color_b: 0,
            pc_packed: 1, pc_target_color: 0,
            spec_type: 1, spec_target: 1
        },
        expected: { _idx: idx },
        expectFail: true
    });

    return tests;
}

function generateSquareUtilsTests() {
    const idx = {
        stc_file: 0, stc_rank: 1, cts_square: 2,
        ds_dfile: 3, ds_drank: 4, ds_adfile: 5, ds_adrank: 6,
        asa_same_file: 7, asa_same_rank: 8, asa_same_diag: 9, asa_sqdiff: 10,
        ivs_valid: 11,
        sd_sign_file: 12, sd_sign_rank: 13, sd_steps: 14
    };

    const tests = [];

    // ---- SquareToCoord: all 64 squares ----
    for (let sq = 0; sq < 64; sq++) {
        const file = sq % 8;
        const rank = Math.floor(sq / 8);
        tests.push({
            label: `SquareToCoord sq=${sq} → (${file},${rank})`,
            input: {
                stc_square: sq, cts_file: file, cts_rank: rank,
                ds_from: sq, ds_to: sq,
                asa_from: sq, asa_to: sq,
                ivs_square: sq,
                sd_from: sq, sd_to: sq
            },
            expected: {
                stc_file: file, stc_rank: rank,
                cts_square: sq,
                ds_dfile: 0, ds_drank: 0, ds_adfile: 0, ds_adrank: 0,
                asa_same_file: 0, asa_same_rank: 0, asa_same_diag: 0, asa_sqdiff: 0,
                ivs_valid: 1,
                sd_sign_file: 0, sd_sign_rank: 0, sd_steps: 0,
                _idx: idx
            }
        });
    }

    // ---- DeltaSquares: adjacent squares ----
    const DELTA_TESTS = [
        // [from, to, df, dr, adf, adr]
        [0, 1,   0-1, 0-0, 1, 0],   // a1 → b1
        [0, 8,   0-0, 0-1, 0, 1],   // a1 → a2
        [0, 9,   0-1, 0-1, 1, 1],   // a1 → b2
        [63, 55, 7-7, 7-6, 0, 1],   // h8 → h7
        [63, 54, 7-6, 7-6, 1, 1],   // h8 → g7
        [4, 0,   4-0, 0-0, 4, 0],   // e1 → a1
    ];
    for (const [from, to, df, dr, adf, adr] of DELTA_TESTS) {
        // df and dr must be represented as field elements
        // Negative values become p - |val| in the field
        const p = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
        const field_df = df < 0 ? BigInt(p + BigInt(df)) : BigInt(df);
        const field_dr = dr < 0 ? BigInt(p + BigInt(dr)) : BigInt(dr);

        tests.push({
            label: `Delta ${from}→${to} (adf=${adf}, adr=${adr})`,
            input: {
                stc_square: from, cts_file: from % 8, cts_rank: Math.floor(from / 8),
                ds_from: from, ds_to: to,
                asa_from: from, asa_to: to,
                ivs_square: from,
                sd_from: from, sd_to: to
            },
            expected: {
                stc_file: from % 8,
                stc_rank: Math.floor(from / 8),
                cts_square: from,
                ds_dfile: String(field_df),
                ds_drank: String(field_dr),
                ds_adfile: adf,
                ds_adrank: adr,
                asa_same_file: (adf === 0 && adr !== 0) ? 1 : 0,
                asa_same_rank: (adr === 0 && adf !== 0) ? 1 : 0,
                asa_same_diag: (adf === adr && adf !== 0) ? 1 : 0,
                asa_sqdiff: (adf + adr > 0) ? 1 : 0,
                ivs_valid: 1,
                sd_sign_file: "0",
                sd_sign_rank: "0",
                sd_steps: Math.max(adf, adr),
                _idx: idx
            }
        });
    }

    // ---- AreSquaresAligned: same file, same rank, diagonal ---
    const ALIGN_TESTS = [
        [0, 8, 1, 0, 0],    // a1-a2: same file
        [0, 16, 1, 0, 0],   // a1-a3: same file
        [0, 1, 0, 1, 0],    // a1-b1: same rank
        [0, 2, 0, 1, 0],    // a1-c1: same rank
        [0, 9, 0, 0, 1],    // a1-b2: diagonal
        [0, 18, 0, 0, 1],   // a1-c3: diagonal
        [7, 14, 0, 0, 1],   // h1-g2: anti-diagonal
        [1, 16, 0, 0, 0],   // b1-a3: knight move (not aligned)
    ];
    for (const [from, to, sf, sr, sd] of ALIGN_TESTS) {
        const adf = Math.abs((from % 8) - (to % 8));
        const adr = Math.abs(Math.floor(from / 8) - Math.floor(to / 8));
        tests.push({
            label: `Aligned ${from}→${to} (sf=${sf}, sr=${sr}, sd=${sd})`,
            input: {
                stc_square: from, cts_file: from % 8, cts_rank: Math.floor(from / 8),
                ds_from: from, ds_to: to,
                asa_from: from, asa_to: to,
                ivs_square: from,
                sd_from: from, sd_to: to
            },
            expected: {
                stc_file: from % 8,
                stc_rank: Math.floor(from / 8),
                cts_square: from,
                ds_dfile: "0", ds_drank: "0", ds_adfile: adf, ds_adrank: adr,
                asa_same_file: sf, asa_same_rank: sr, asa_same_diag: sd,
                asa_sqdiff: (adf + adr > 0) ? 1 : 0,
                ivs_valid: 1,
                sd_sign_file: "0", sd_sign_rank: "0", sd_steps: Math.max(adf, adr),
                _idx: idx
            }
        });
    }

    // ---- IsValidSquare: valid and invalid ----
    tests.push({
        label: `IsValidSquare sq=64 (invalid)`,
        input: {
            stc_square: 63, cts_file: 7, cts_rank: 7,
            ds_from: 0, ds_to: 0,
            asa_from: 0, asa_to: 0,
            ivs_square: 64,
            sd_from: 0, sd_to: 0
        },
        expected: {
            stc_file: 7, stc_rank: 7, cts_square: 63,
            ds_dfile: 0, ds_drank: 0, ds_adfile: 0, ds_adrank: 0,
            asa_same_file: 0, asa_same_rank: 0, asa_same_diag: 0, asa_sqdiff: 0,
            ivs_valid: 1,
            sd_sign_file: "0", sd_sign_rank: "0", sd_steps: 0,
            _idx: idx
        },
        expectFail: true  // Num2Bits(6) on 64 will fail
    });

    return tests;
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    const target = process.argv[2] || "all";
    ensureDir(OUTPUT);

    setupPtau();

    const allResults = {};

    if (target === "all" || target === "piece_codec") {
        const circuitPath = path.join(BASE, "tests", "test_piece_codec.circom");
        const compiled = circomCompile("test_piece_codec", circuitPath);
        if (compiled) {
            const { zkey, vkey } = setupZkey("test_piece_codec", compiled.r1cs);
            const tests = generatePieceCodecTests();

            // Separate expected-pass and expected-fail tests
            const passTests = tests.filter(t => !t.expectFail);
            const failTests = tests.filter(t => t.expectFail);

            console.log(`\n  --- Running ${passTests.length} positive tests ---`);
            const posResults = await runTests("test_piece_codec", passTests, compiled.wasm, zkey, vkey);

            console.log(`\n  --- Running ${failTests.length} rejection tests (should fail) ---`);
            let rejectPassed = 0, rejectFailed = 0;
            for (const tc of failTests) {
                try {
                    const witnessPath = path.join(OUTPUT, `witness_test_piece_codec_rej_${failTests.indexOf(tc)}.wtns`);
                    await snarkjs.wtns.calculate(tc.input, compiled.wasm, witnessPath);
                    const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, witnessPath);
                    const vkeyObj = JSON.parse(fs.readFileSync(vkey, "utf8"));
                    const valid = await snarkjs.groth16.verify(vkeyObj, publicSignals, proof);
                    console.log(`  ${tc.label}: BAD (should have rejected but proof was valid!)`);
                    rejectFailed++;
                } catch (e) {
                    console.log(`  ${tc.label}: OK (correctly rejected: ${e.message.split("\\n")[0]})`);
                    rejectPassed++;
                }
            }
            console.log(`\n  Rejection tests: ${rejectPassed} correctly rejected, ${rejectFailed} incorrectly accepted`);

            allResults.test_piece_codec = {
                constraints: compiled.constraints,
                positive: posResults,
                rejection: { passed: rejectPassed, failed: rejectFailed }
            };
        }
    }

    if (target === "all" || target === "square_utils") {
        const circuitPath = path.join(BASE, "tests", "test_square_utils.circom");
        const compiled = circomCompile("test_square_utils", circuitPath);
        if (compiled) {
            const { zkey, vkey } = setupZkey("test_square_utils", compiled.r1cs);
            const tests = generateSquareUtilsTests();

            const passTests = tests.filter(t => !t.expectFail);
            const failTests = tests.filter(t => t.expectFail);

            console.log(`\n  --- Running ${passTests.length} positive tests ---`);
            const posResults = await runTests("test_square_utils", passTests, compiled.wasm, zkey, vkey);

            console.log(`\n  --- Running ${failTests.length} rejection tests ---`);
            let rejectPassed = 0, rejectFailed = 0;
            for (const tc of failTests) {
                try {
                    const witnessPath = path.join(OUTPUT, `witness_test_sq_rej_${failTests.indexOf(tc)}.wtns`);
                    await snarkjs.wtns.calculate(tc.input, compiled.wasm, witnessPath);
                    const { proof } = await snarkjs.groth16.prove(zkey, witnessPath);
                    console.log(`  ${tc.label}: BAD (should have rejected!)`);
                    rejectFailed++;
                } catch (e) {
                    console.log(`  ${tc.label}: OK (correctly rejected: ${e.message.split("\\n")[0]})`);
                    rejectPassed++;
                }
            }
            console.log(`\n  Rejection tests: ${rejectPassed} correctly rejected, ${rejectFailed} incorrectly accepted`);

            allResults.test_square_utils = {
                constraints: compiled.constraints,
                positive: posResults,
                rejection: { passed: rejectPassed, failed: rejectFailed }
            };
        }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("FINAL SUMMARY");
    console.log("=".repeat(60));
    for (const [circuit, result] of Object.entries(allResults)) {
        console.log(`${circuit}: ${result.constraints} constraints`);
        const totalPass = result.positive.passed + (result.rejection?.passed || 0);
        const totalFail = result.positive.failed + (result.rejection?.failed || 0);
        console.log(`  ${totalPass} PASS, ${totalFail} FAIL`);

        if (result.positive.failed > 0) {
            console.log("  FAILED POSITIVE TESTS:");
            for (const r of result.positive.results) {
                if (r.status !== "PASS") console.log(`    - ${r.label}: ${r.status}`);
            }
        }
    }
    console.log("");

    // Write results to JSON
    fs.writeFileSync(
        path.join(OUTPUT, "phase1_results.json"),
        JSON.stringify(allResults, (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
            2
        )
    );
    console.log("Detailed results written to output/phase1_results.json");
}

main().catch(e => {
    console.error("Fatal:", e);
    process.exit(1);
});
