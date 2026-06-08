#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "pot_split_math_js/pot_split_math.wasm");
const ZKEY = path.join(__dirname, "pot_split_math.zkey");
const OUT = path.join(__dirname, "pot_split/pot_split_math_proof.json");

async function main() {
    const totalPot = BigInt(process.argv[2] || "1000000000");
    const feeBps = BigInt(process.argv[3] || "200");
    const returnBps = BigInt(process.argv[4] || "100");
    const fee = (totalPot * feeBps) / 10000n;
    const ret = (totalPot * returnBps) / 10000n;
    const winnerShare = totalPot - fee - ret;

    const input = {
        total_pot: totalPot.toString(),
        fee_bps: feeBps.toString(),
        pot_return_bps: returnBps.toString(),
        winner_share: winnerShare.toString(),
        fee: fee.toString(),
        ret: ret.toString(),
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "winner_share=", winnerShare.toString());
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });