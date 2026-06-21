#!/usr/bin/env node
"use strict";
// REAL prover for credential_nullifier.
//
// Models an ISSUER holding a BabyJubjub keypair (Ax, Ay). The issuer signs the
// credential commitment  credentialCommitment = Poseidon(credentialSecret)  with
// EdDSA-Poseidon, producing (R8x, R8y, S). The holder then proves:
//   - the issuer signed THIS exact credential commitment (issuer attestation), and
//   - nullifier = Poseidon(credentialSecret, externalNullifier) (one-time action tag).
//
// A verifying proof implies the prover holds an issuer-attested credential and has
// emitted the correctly-derived one-time nullifier for this action domain.
//
// Usage: node prove_credential_nullifier.js [credentialSecret] [externalNullifier] [covenantId] [issuerPrivHex]
//   --forge  tamper the issuer signature S; witness/proof generation MUST FAIL.
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildEddsa, buildPoseidon } = require("circomlibjs");

const WASM = path.join(__dirname, "credential_nullifier_js/credential_nullifier.wasm");
const ZKEY = path.join(__dirname, "credential_nullifier.zkey");
const OUT = path.join(__dirname, "credential_nullifier_proof.json");

async function main() {
    const args = process.argv.slice(2);
    const forge = args.includes("--forge");
    const pos = args.filter(a => a !== "--forge");
    const credentialSecret = BigInt(pos[0] || "13371337133713371337");
    const externalNullifier = BigInt(pos[1] || "20260621"); // per-action domain separator
    const covenantId = (pos[2] || "987654321987654321").toString();
    // Issuer's 32-byte BabyJubjub private key (deterministic default for a reproducible demo).
    const issuerPrivHex = pos[3] || "0a0b0c0d0e0f00010203040506070809000102030405060708090a0b0c0d0e0f";
    const prvKey = Buffer.from(issuerPrivHex, "hex");

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const toDec = (x) => F.toObject(x).toString();

    // Issuer BabyJubjub public key.
    const pubKey = eddsa.prv2pub(prvKey);
    const Ax = toDec(pubKey[0]);
    const Ay = toDec(pubKey[1]);

    // credentialCommitment = Poseidon(credentialSecret). This is the message the issuer signs.
    const commitEl = poseidon([credentialSecret]);
    const commitField = F.e(commitEl);           // field element form for signing
    const commitDec = F.toObject(commitEl).toString();

    // Issuer signs the commitment with EdDSA-Poseidon.
    const signature = eddsa.signPoseidon(prvKey, commitField);
    const R8x = toDec(signature.R8[0]);
    const R8y = toDec(signature.R8[1]);
    let S = signature.S.toString();

    // Sanity: confirm the signature verifies off-circuit before proving.
    const sigOk = eddsa.verifyPoseidon(commitField, signature, pubKey);
    console.log("offchain_issuer_sig_verify=" + sigOk + " commitment=" + commitDec);

    if (forge) {
        // Tamper S so the issuer signature is invalid. EdDSAPoseidonVerifier(enabled=1)
        // must make the witness unsatisfiable, i.e. proof generation MUST FAIL. If it ever
        // succeeds, soundness is broken.
        S = (BigInt(S) + 1n).toString();
        console.log("FORGE: tampered issuer S, expecting witness/proof generation to FAIL");
    }

    // Deterministic one-time nullifier = Poseidon(credentialSecret, externalNullifier).
    const nfEl = poseidon([credentialSecret, externalNullifier]);
    const nullifier = F.toObject(nfEl).toString();

    const input = {
        Ax, Ay,
        externalNullifier: externalNullifier.toString(),
        nullifier,
        covenantId,
        credentialSecret: credentialSecret.toString(),
        R8x, R8y, S,
    };

    const wtns = path.join(__dirname, ".wtns_credential_nullifier.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "nullifier=", nullifier, "covenantId=", covenantId);
    console.log("publicSignals:", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error("PROVE_ERR:", e.message || e); process.exit(1); });
