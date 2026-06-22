#!/usr/bin/env node
"use strict";
// REAL oracle-signed TWAP-band prover for twap_bound.
//
// Generates an oracle BabyJubjub keypair, signs msg = Poseidon(twap, windowId)
// with EdDSA-Poseidon, then proves the circuit. A verifying proof implies the
// oracle (holder of BabyJubjub key Ax,Ay) attested twap for windowId AND the
// public price is within bps of that twap, all WITHOUT revealing twap.
//
// Usage: node prove_twap_bound.js [price] [twap] [bps] [windowId] [covenantId] [privHex]
//   --forge      tamper the signature S (must FAIL to prove -> soundness on the sig)
//   --outofband  prove with price OUTSIDE the band (proof SUCCEEDS but valid==0)
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildEddsa, buildPoseidon } = require("circomlibjs");

const WASM = path.join(__dirname, "twap_bound_js/twap_bound.wasm");
const ZKEY = path.join(__dirname, "twap_bound.zkey");
const OUT  = path.join(__dirname, "twap_bound_proof.json");

async function main() {
    const args = process.argv.slice(2);
    const forge = args.includes("--forge");
    const oob = args.includes("--outofband");
    const pos = args.filter(a => !a.startsWith("--"));
    // Defaults: twap=10000 (e.g. price scaled), bps=200 (2%) -> band [9800, 10200].
    // Honest in-band price = 10150 (within 2%). Out-of-band price = 10500 (above ceiling).
    const twap       = pos[1] || "10000";
    const bps        = pos[2] || "200";
    const price      = pos[0] || (oob ? "10500" : "10150");
    const windowId   = pos[3] || "20260622";
    const covenantId = pos[4] || "424242";
    // 32-byte oracle private key (deterministic default for a reproducible demo).
    const privHex = pos[5] || "0102030405060708090a0102030405060708090a0102030405060708090a0102";
    const prvKey = Buffer.from(privHex, "hex");

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const toDec = (x) => F.toObject(x).toString();

    // Oracle's BabyJubjub public key.
    const pubKey = eddsa.prv2pub(prvKey);
    const Ax = toDec(pubKey[0]);
    const Ay = toDec(pubKey[1]);

    // Signed message msg = Poseidon(twap, windowId).
    const M = poseidon([BigInt(twap), BigInt(windowId)]);
    const Mdec = F.toObject(M);

    // Oracle signs msg with EdDSA-Poseidon.
    const signature = eddsa.signPoseidon(prvKey, M);
    const R8x = toDec(signature.R8[0]);
    const R8y = toDec(signature.R8[1]);
    let S = signature.S.toString();

    // Sanity: confirm the signature verifies off-circuit before proving.
    const sigOk = eddsa.verifyPoseidon(M, signature, pubKey);
    const floor = (BigInt(twap) * (10000n - BigInt(bps)));
    const ceil  = (BigInt(twap) * (10000n + BigInt(bps)));
    const ps    = BigInt(price) * 10000n;
    console.log("offchain_sig_verify=" + sigOk + " msg=" + Mdec.toString() +
        " price=" + price + " twap=" + twap + " bps=" + bps +
        " inBand=" + (ps >= floor && ps <= ceil));

    if (forge) {
        // Tamper with S so the signature is invalid. EdDSAPoseidonVerifier (enabled=1)
        // makes the witness unsatisfiable, i.e. proof generation MUST FAIL.
        S = (BigInt(S) + 1n).toString();
        console.log("FORGE: tampered S, expecting witness/proof generation to FAIL");
    }

    const input = { Ax, Ay, price, bps, windowId, covenantId, twap, R8x, R8y, S };

    const wtns = path.join(__dirname, ".wtns.tmp_twap");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    // publicSignals layout (snarkjs order): [ valid, Ax, Ay, price, bps, windowId, covenantId ]
    console.log("Proof:", OUT);
    console.log("publicSignals=" + JSON.stringify(publicSignals));
    console.log("valid(public[0])=" + publicSignals[0] +
        " (1 = oracle-signed twap & price within bps band, 0 = out of band)");
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error("PROVE_ERR:", e.message || e); process.exit(1); });
