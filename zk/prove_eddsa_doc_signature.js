#!/usr/bin/env node
"use strict";
// REAL prover for eddsa_doc_signature.
//
// Generates a BabyJubjub keypair, derives a private document hash docHash, signs
// the authorization message M = Poseidon(docHash, covenantId) with EdDSA-Poseidon,
// and proves the circuit. A verifying proof implies the holder of (Ax, Ay) signed
// the document committed by docCommitment = Poseidon(docHash), for this covenant,
// WITHOUT revealing docHash.
//
// HONESTY: docHash here is Poseidon over a demo "document" field; an honest
// integrator MUST set docHash to a genuine hash of the real document/step/work so
// that docCommitment binds the true artifact. The BabyJubjub key is the in-circuit
// signer identity, NOT a Kaspa secp256k1 key (see circuit header).
//
// Usage: node prove_eddsa_doc_signature.js [docContent] [covenantId] [privHex]
//   --forge  produce a proof attempt with a tampered signature (must FAIL to prove)
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildEddsa, buildPoseidon } = require("circomlibjs");

const WASM = path.join(__dirname, "eddsa_doc_signature_js/eddsa_doc_signature.wasm");
const ZKEY = path.join(__dirname, "eddsa_doc_signature.zkey");
const OUT = path.join(__dirname, "eddsa_doc_signature_proof.json");

async function main() {
    const args = process.argv.slice(2);
    const forge = args.includes("--forge");
    const pos = args.filter(a => a !== "--forge");
    const docContent = pos[0] || "987654321"; // stand-in numeric document content
    const covenantId = pos[1] || "424242";
    // 32-byte private key (deterministic default for a reproducible demo).
    const privHex = pos[2] || "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    const prvKey = Buffer.from(privHex, "hex");

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const toDec = (x) => F.toObject(x).toString();

    // Signer's BabyJubjub public key.
    const pubKey = eddsa.prv2pub(prvKey);
    const Ax = toDec(pubKey[0]);
    const Ay = toDec(pubKey[1]);

    // Private document hash: hash the document content into a field element.
    const docHashEl = poseidon([BigInt(docContent)]);
    const docHash = F.toObject(docHashEl);

    // Public commitment to the document = Poseidon(docHash).
    const docCommitEl = poseidon([docHash]);
    const docCommitment = F.toObject(docCommitEl).toString();

    // Authorization message M = Poseidon(docHash, covenantId).
    const M = poseidon([docHash, BigInt(covenantId)]);
    const Mdec = F.toObject(M);

    // Sign M with EdDSA-Poseidon.
    const signature = eddsa.signPoseidon(prvKey, M);
    const R8x = toDec(signature.R8[0]);
    const R8y = toDec(signature.R8[1]);
    let S = signature.S.toString();

    // Sanity: confirm the signature verifies off-circuit before proving.
    const sigOk = eddsa.verifyPoseidon(M, signature, pubKey);
    console.log("offchain_sig_verify=" + sigOk + " M=" + Mdec.toString() + " docCommitment=" + docCommitment);

    if (forge) {
        // Tamper with S so the signature is invalid. EdDSAPoseidonVerifier
        // (enabled=1) must make the witness unsatisfiable: proof generation must
        // FAIL. If it ever succeeds, soundness is broken.
        S = (BigInt(S) + 1n).toString();
        console.log("FORGE: tampered S, expecting witness/proof generation to FAIL");
    }

    const input = {
        docHash: docHash.toString(),
        R8x, R8y, S,
        Ax, Ay,
        docCommitment,
        covenantId,
    };

    const wtns = path.join(__dirname, ".wtns.tmp.eddsa_doc");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT, "publicSignals=", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error("PROVE_ERR:", e.message || e); process.exit(1); });
