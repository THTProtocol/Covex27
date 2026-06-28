#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

// prove_threshold_sig_knowledge.js - real Groth16 proof for threshold_sig_knowledge (Covex27).
// K=2-of-N Shamir share knowledge. Held shares at x=1,2 reconstruct secret S=f(0)=2*y0-y1.
// Public: shareCommit[2], groupCommit, covenantId. valid (publicSignals[0]) == 1 iff the held
// shares reconstruct the committed group secret.
// Usage: node prove_threshold_sig_knowledge.js [out] [covenantId] [--false]
//   --false : keep the same shares (so their commitments still open) but bind groupCommit to a
//             DIFFERENT secret -> reconstruction != secret -> VERIFYING proof with valid==0.
const ID = "threshold_sig_knowledge";
const SERVED = path.join(__dirname, "../frontend/public/zk", ID);
const WASM = path.join(SERVED, `${ID}.wasm`);
const ZKEY = path.join(SERVED, `${ID}_final.zkey`);

async function main() {
    const outArg = process.argv[2] || path.join(__dirname, `${ID}_proof.json`);
    const covenantId = (process.argv[3] || "11111111111111111111").toString();
    const wantFalse = process.argv.includes("--false");

    // Degree-1 polynomial f(x) = a0 + a1*x, secret S = a0. Shares y_i = f(i).
    const a0 = 1234567n; // the group secret S = f(0)
    const a1 = 7654321n;
    const share = [a0 + a1 * 1n, a0 + a1 * 2n]; // f(1), f(2)
    const salt = ["1001", "2002"];
    // recon = 2*y0 - y1 = 2*(a0+a1) - (a0+2a1) = a0  (correct).

    const shareCommit = [];
    for (let i = 0; i < 2; i++) shareCommit.push(await hash([share[i].toString(), salt[i]]));

    // The secret the prover claims and binds via groupCommit.
    let secret = a0;
    if (wantFalse) {
        // Bind groupCommit to a DIFFERENT secret S'. The held shares still open their commitments,
        // but recon (== a0) != S', so eqRecon.out == 0 -> valid == 0. groupCommit === Poseidon(S')
        // is satisfied because we pass that S' as the private `secret` witness (so all === hold),
        // but the Lagrange reconstruction check fails -> a VERIFYING proof carrying valid==0.
        secret = a0 + 999n;
    }
    const groupCommit = await hash([secret.toString()]);

    const input = {
        shareCommit,
        groupCommit,
        covenantId,
        share: share.map((s) => s.toString()),
        salt,
        secret: secret.toString(),
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    fs.writeFileSync(outArg, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", outArg, "valid(publicSignals[0]):", publicSignals[0], "all:", JSON.stringify(publicSignals));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
