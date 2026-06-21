#!/usr/bin/env node
"use strict";
// REAL stealth-address ownership prover (Schnorr-style knowledge of discrete log).
//
// Picks a BabyJubjub scalar s, computes the stealth address point
// stealthPub = Base8 * s with circomlibjs (the SAME Base8 the circuit hard-codes),
// then proves the circuit. A verifying proof implies the prover knows s such that
// Base8 * s == stealthPub, proven in zero knowledge (s never revealed). This is a
// covenant-internal BabyJubjub key, NOT a Kaspa secp256k1 key (secp256k1 inside
// BN254 is infeasible).
//
// Usage: node prove_stealth_address_ownership.js [sDec] [covenantId]
//   --forge  prove with a WRONG public point (stealthPub != Base8*s). The circuit's
//            equality constraints must make the witness unsatisfiable, i.e. proof
//            generation must FAIL. If it ever succeeds, soundness is broken.
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildBabyjub } = require("circomlibjs");

const WASM = path.join(__dirname, "stealth_address_ownership_js/stealth_address_ownership.wasm");
const ZKEY = path.join(__dirname, "stealth_address_ownership.zkey");
const OUT = path.join(__dirname, "ownership/stealth_address_ownership_proof.json");

async function main() {
    const args = process.argv.slice(2);
    const forge = args.includes("--forge");
    const pos = args.filter(a => a !== "--forge");
    // Deterministic default scalar for a reproducible demo (well under 2^253).
    const s = BigInt(pos[0] || "987654321012345678901234567890");
    const covenantId = pos[1] || "424242";

    const bj = await buildBabyjub();
    const F = bj.F;
    const toDec = (x) => F.toObject(x).toString();

    // Honest derivation: P = Base8 * s, identical to the in-circuit EscalarMulFix.
    const P = bj.mulPointEscalar(bj.Base8, s);
    let stealthPubX = toDec(P[0]);
    let stealthPubY = toDec(P[1]);
    console.log("derived stealthPub: X=" + stealthPubX + " Y=" + stealthPubY);

    if (forge) {
        // Claim a public point that is NOT Base8*s. Witness must be unsatisfiable
        // because stealthPubX === mulFix.out[0] cannot hold.
        stealthPubX = (BigInt(stealthPubX) + 1n).toString();
        console.log("FORGE: corrupted stealthPubX, expecting witness/proof generation to FAIL");
    }

    const input = {
        s: s.toString(),
        stealthPubX,
        stealthPubY,
        covenantId,
    };

    const wtns = path.join(__dirname, ".wtns_stealth.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error("PROVE_ERR:", e.message || e); process.exit(1); });
