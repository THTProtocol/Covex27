#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "vrf_dice_roll_js/vrf_dice_roll.wasm");
const ZKEY = path.join(__dirname, "vrf_dice_roll.zkey");
const OUT = path.join(__dirname, "vrf_dice_proof.json");

async function main() {
    const secret = BigInt(process.argv[2] || "424242");
    const seed = BigInt(process.argv[3] || "123456789012345");
    const roll = BigInt(process.argv[4] || "4");

    const input = {
        secret: secret.toString(),
        seed: seed.toString(),
        roll: roll.toString(),
        valid: "1",
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "roll=", roll.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });