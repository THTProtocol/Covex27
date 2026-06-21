#!/usr/bin/env node
"use strict";
// REAL ownership prover for basic_utxo_ownership.
//
// Generates a BabyJubjub keypair, signs the authorization message
// M = Poseidon(amount_commit, covenantId) with EdDSA-Poseidon, then proves the
// circuit. A verifying proof implies the prover holds the BabyJubjub private key
// bound into utxo_hash and signed an authorization binding amount_commit to
// covenantId. This is a covenant-internal BabyJubjub key, NOT the Kaspa
// secp256k1 spending key (secp256k1 verification inside BN254 is infeasible).
//
// Usage: node prove_basic_utxo_ownership.js [amount_commit] [covenantId] [privHex]
//   --forge  produce a proof attempt with a tampered signature (must FAIL to prove)
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildEddsa, buildPoseidon } = require("circomlibjs");

const WASM = path.join(__dirname, "basic_utxo_ownership_js/basic_utxo_ownership.wasm");
const ZKEY = path.join(__dirname, "basic_utxo_ownership.zkey");
const OUT = path.join(__dirname, "ownership/basic_utxo_ownership_proof.json");

async function main() {
    const args = process.argv.slice(2);
    const forge = args.includes("--forge");
    const pos = args.filter(a => a !== "--forge");
    const amount_commit = pos[0] || "1000000000"; // 10 KAS in sompi, as a commitment value
    const covenantId = pos[1] || "424242";
    // 32-byte private key (deterministic default for a reproducible demo).
    const privHex = pos[2] || "0001020304050607080900010203040506070809000102030405060708090001";
    const prvKey = Buffer.from(privHex, "hex");

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const toDec = (x) => F.toObject(x).toString();

    // Owner's BabyJubjub public key.
    const pubKey = eddsa.prv2pub(prvKey);
    const Ax = toDec(pubKey[0]);
    const Ay = toDec(pubKey[1]);

    // Authorization message M = Poseidon(amount_commit, covenantId).
    const M = poseidon([BigInt(amount_commit), BigInt(covenantId)]);
    const Mdec = F.toObject(M);

    // Sign M with EdDSA-Poseidon.
    const signature = eddsa.signPoseidon(prvKey, M);
    const R8x = toDec(signature.R8[0]);
    const R8y = toDec(signature.R8[1]);
    let S = signature.S.toString();

    // Sanity: confirm the signature verifies off-circuit before proving.
    const sigOk = eddsa.verifyPoseidon(M, signature, pubKey);
    console.log("offchain_sig_verify=" + sigOk + " M=" + Mdec.toString());

    if (forge) {
        // Tamper with S so the signature is invalid. The circuit's
        // EdDSAPoseidonVerifier (enabled=1) must make the witness unsatisfiable,
        // i.e. proof generation must FAIL. If it ever succeeds, soundness is broken.
        S = (BigInt(S) + 1n).toString();
        console.log("FORGE: tampered S, expecting witness/proof generation to FAIL");
    }

    // Public note hash binds the key + amount.
    const utxoHashEl = poseidon([pubKey[0], pubKey[1], BigInt(amount_commit)]);
    const utxo_hash = F.toObject(utxoHashEl).toString();

    const input = { Ax, Ay, amount_commit, R8x, R8y, S, utxo_hash, covenantId };

    const wtns = path.join(__dirname, ".wtns.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "utxo_hash=", utxo_hash, "covenantId=", covenantId);
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error("PROVE_ERR:", e.message || e); process.exit(1); });
