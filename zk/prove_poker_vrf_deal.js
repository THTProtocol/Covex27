#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "poker_vrf_deal_js/poker_vrf_deal.wasm");
const ZKEY = path.join(__dirname, "poker_vrf_deal.zkey");
const OUT = path.join(__dirname, "poker_vrf_deal_proof.json");

async function main() {
    const secret = process.argv[2] || "424242";
    const publicSeed = process.argv[3] || "999001";
    const dealHash = process.argv[4] || "0";
    const numPlayers = process.argv[5] || "6";
    const input = { secret, publicSeed, dealHash, numPlayers, valid: "1" };
    const wtns = path.join(__dirname, ".wtns.pvd.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });