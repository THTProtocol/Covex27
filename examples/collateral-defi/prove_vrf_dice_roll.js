#!/usr/bin/env node
"use strict";
/**
 * prove_vrf_dice_roll.js — stub for vrf_dice_roll.circom (Covex27)
 * References: ZK_ORACLE... Phase 1 "Full VRF family (random, dice...)", game properties, VRF dice roll.
 * Hash-based (MiMC) + mod proof via q/r . Uses mimcjs to precompute commitment for input.
 * Like prove_hash_preimage.js + range elements.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

const WASM = path.join(__dirname, "vrf/output/vrf_dice_roll_js/vrf_dice_roll.wasm");
const ZKEY = path.join(__dirname, "vrf/output/vrf_dice_roll.zkey");
const OUT = path.join(__dirname, "vrf/vrf_dice_roll_proof.json");

async function main() {
    const seed = BigInt(process.argv[2] || "123456789012345");
    // Derive roll from the VRF hash so the mod relation always holds (fix for witness)
    // This demonstrates a *valid* VRF dice derivation per the circuit.
    const m = await mimcjs.buildMimc7();
    const vrfVal = m.F.toObject(m.hash(m.F.e(seed), m.F.zero));
    const r = vrfVal % 6n;
    const roll = r + 1n;  // 1-6
    const q = (vrfVal - r) / 6n;

    const commitment = vrfVal.toString();

    const input = {
        commitment: commitment,
        roll: roll.toString(),
        seed: seed.toString(),
        q: q.toString(),
    };
    const wtns = path.join(__dirname, "vrf/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "roll=", roll.toString(), " (derived from VRF % 6)");
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
