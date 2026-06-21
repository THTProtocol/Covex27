#!/usr/bin/env node
"use strict";
// REAL issuer-signed-attribute-threshold prover for signed_attribute_threshold.
//
// Generates an issuer BabyJubjub keypair, signs msg = Poseidon(subject, attrValue)
// with EdDSA-Poseidon, then proves the circuit. A verifying proof implies the
// issuer (holder of BabyJubjub key Ax,Ay) attested attrValue for subject AND
// attrValue >= minThreshold, all WITHOUT revealing attrValue.
//
// Usage: node prove_signed_attribute_threshold.js [attrValue] [minThreshold] [subject] [covenantId] [privHex]
//   --forge       tamper the signature S (must FAIL to prove -> soundness on the sig)
//   --underthresh prove with attrValue < minThreshold (proof SUCCEEDS but valid==0)
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildEddsa, buildPoseidon } = require("circomlibjs");

const WASM = path.join(__dirname, "signed_attribute_threshold_js/signed_attribute_threshold.wasm");
const ZKEY = path.join(__dirname, "signed_attribute_threshold.zkey");
const OUT  = path.join(__dirname, "signed_attribute_threshold_proof.json");

async function main() {
    const args = process.argv.slice(2);
    const forge = args.includes("--forge");
    const under = args.includes("--underthresh");
    const pos = args.filter(a => !a.startsWith("--"));
    const attrValue    = pos[0] || (under ? "640" : "780");   // e.g. a credit score
    const minThreshold = pos[1] || "700";                      // public floor
    const subject      = pos[2] || "123456789";                // who the attribute is about
    const covenantId   = pos[3] || "424242";
    // 32-byte issuer private key (deterministic default for a reproducible demo).
    const privHex = pos[4] || "0102030405060708090a0102030405060708090a0102030405060708090a0102";
    const prvKey = Buffer.from(privHex, "hex");

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const toDec = (x) => F.toObject(x).toString();

    // Issuer's BabyJubjub public key.
    const pubKey = eddsa.prv2pub(prvKey);
    const Ax = toDec(pubKey[0]);
    const Ay = toDec(pubKey[1]);

    // Signed message msg = Poseidon(subject, attrValue).
    const M = poseidon([BigInt(subject), BigInt(attrValue)]);
    const Mdec = F.toObject(M);

    // Issuer signs msg with EdDSA-Poseidon.
    const signature = eddsa.signPoseidon(prvKey, M);
    const R8x = toDec(signature.R8[0]);
    const R8y = toDec(signature.R8[1]);
    let S = signature.S.toString();

    // Sanity: confirm the signature verifies off-circuit before proving.
    const sigOk = eddsa.verifyPoseidon(M, signature, pubKey);
    console.log("offchain_sig_verify=" + sigOk + " msg=" + Mdec.toString() +
        " attrValue=" + attrValue + " minThreshold=" + minThreshold);

    if (forge) {
        // Tamper with S so the signature is invalid. EdDSAPoseidonVerifier (enabled=1)
        // makes the witness unsatisfiable, i.e. proof generation MUST FAIL.
        S = (BigInt(S) + 1n).toString();
        console.log("FORGE: tampered S, expecting witness/proof generation to FAIL");
    }

    const input = { Ax, Ay, subject, minThreshold, covenantId, attrValue, R8x, R8y, S };

    const wtns = path.join(__dirname, ".wtns.tmp_sat");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    // publicSignals layout (snarkjs order): [ valid, Ax, Ay, subject, minThreshold, covenantId ]
    console.log("Proof:", OUT);
    console.log("publicSignals=" + JSON.stringify(publicSignals));
    console.log("valid(public[0])=" + publicSignals[0] +
        " (1 = signed & attrValue>=minThreshold, 0 = below threshold)");
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error("PROVE_ERR:", e.message || e); process.exit(1); });
