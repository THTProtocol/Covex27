#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

const WASM = path.join(__dirname, "script_constraint_js/script_constraint.wasm");
const ZKEY = path.join(__dirname, "script_constraint.zkey");
const OUT = path.join(__dirname, "script_constraints/script_constraint_proof.json");

async function main() {
    const scriptHash = process.argv[2] || "111111";
    const constraintId = process.argv[3] || "2";
    const value = process.argv[4] || "30";
    const publicRoot = await hash([scriptHash, constraintId, value]);

    const input = {
        script_hash: scriptHash,
        constraint_id: constraintId,
        value,
        public_root: publicRoot,
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "public_root=", publicRoot);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });