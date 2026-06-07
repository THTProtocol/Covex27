#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "script_constraint_js/script_constraint.wasm");
const ZKEY = path.join(__dirname, "script_constraint.zkey");
const OUT = path.join(__dirname, "script_constraints/script_constraint_proof.json");

async function main() {
    const scriptHash = BigInt(process.argv[2] || "111111");
    const constraintId = BigInt(process.argv[3] || "2");
    const value = BigInt(process.argv[4] || "30");
    const publicRoot = BigInt(process.argv[5] || "999999");

    const input = {
        script_hash: scriptHash.toString(),
        constraint_id: constraintId.toString(),
        value: value.toString(),
        public_root: publicRoot.toString(),
    };
    const wtns = path.join(__dirname, "script_constraints/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });