#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const mimcjs = require("circomlibjs");

// Prove against the SERVED artifacts (deploy-refreshed) so the proof verifies with the served
// vkey the in-browser prover and verify_hash_preimage.js both use. The zk/ root output/ wasm+zkey
// are gitignored and were never rebuilt for the 3-input (covenantId) circuit; only the .r1cs is
// present locally. See verify_hash_preimage.js for the served-vkey-is-source-of-truth rationale.
const SERVED = path.join(__dirname, "../frontend/public/zk/hash_preimage");
const WASM = path.join(SERVED, "hash_preimage.wasm");
const ZKEY = path.join(SERVED, "hash_preimage_final.zkey");
const OUT = path.join(__dirname, "hash_preimage/hash_preimage_proof.json");

async function main() {
    const preimage = BigInt(process.argv[2] || "42");
    const covenantId = process.argv[3] || "12345"; // H4 cross-covenant replay binding (public)
    const m = await mimcjs.buildMimc7();
    const hash = m.F.toObject(m.hash(m.F.e(preimage), m.F.zero));

    const input = {
        commitment_hash: hash.toString(),
        covenantId: covenantId.toString(),
        preimage: preimage.toString(),
    };
    const wtns = path.join(__dirname, "hash_preimage/move.wtns");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "covenantId=", covenantId);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
