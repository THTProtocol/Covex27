#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

const WASM = path.join(__dirname, "nullifier_set_js/nullifier_set.wasm");
const ZKEY = path.join(__dirname, "nullifier_set.zkey");
const OUT = path.join(__dirname, "nullifier/nullifier_set_proof.json");

async function main() {
    const secret = process.argv[2] || "42";
    // covenantId binds the proof to a specific covenant (the served nullifier_set.circom declares
    // it as a 4th public input: nullifier, covenantId, merkle_root, secret). Older versions of
    // this script omitted it and could no longer satisfy the served circuit; it is required.
    const covenantId = (process.argv[3] || "7").toString();
    const nullifier = await hash([secret]);
    const merkle_root = await hash([secret, nullifier]);

    const input = {
        nullifier,
        covenantId,
        merkle_root,
        secret,
    };
    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });