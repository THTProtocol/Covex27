#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

const WASM = path.join(__dirname, "vrf_dice_roll_js/vrf_dice_roll.wasm");
const ZKEY = path.join(__dirname, "vrf_dice_roll.zkey");
const OUT = path.join(__dirname, "vrf_dice_proof.json");
const FACES = 6n;

async function main() {
    const secret = BigInt(process.argv[2] || "424242");
    const seed = BigInt(process.argv[3] || "123456789012345");
    const covenantId = BigInt(process.argv[4] || "1");

    const computed = BigInt(await hash([secret.toString(), seed.toString()]));
    const r = computed % FACES;
    const roll = r + 1n;
    const q = (computed - r) / FACES;

    const input = {
        secret: secret.toString(),
        seed: seed.toString(),
        covenantId: covenantId.toString(),
        roll: roll.toString(),
        q: q.toString(),
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "roll=", roll.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });