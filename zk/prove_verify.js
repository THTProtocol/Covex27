#!/usr/bin/env node
"use strict";
// prove_verify.js - regenerates zk/merkle_proof.json for the CURRENTLY SERVED
// merkle_membership circuit (3-input / nPublic=3).
//
// SOURCE OF TRUTH = frontend/public/zk/merkle_membership/{.wasm,_final.zkey,_vkey.json}.
// Those served artifacts are what the in-browser ZK Studio prover and the production
// zk/verify.js (and therefore the Rust oracle verify_merkle_proof) check against. We
// only READ them here - we never regenerate, re-key, or replace any served artifact.
//
// Circuit interface (zk/merkle_membership.circom):
//   public input  rootHash      = MiMC7(secretLeaf, 0)   (91 rounds, k=0)
//   public input  covenantId    = H4 covenant-binding field element
//   private input secretLeaf
//   public output valid         = 1 when rootHash === MiMC7(secretLeaf)
// snarkjs public-signal order is outputs-first then public inputs in declaration order:
//   publicSignals = [ valid, rootHash, covenantId ]   (length 3, matches vkey nPublic=3)
const snarkjs = require("snarkjs");
const cl = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ZK_DIR = __dirname;
const SERVED = path.join(ZK_DIR, "../frontend/public/zk/merkle_membership");
const WASM = path.join(SERVED, "merkle_membership.wasm");
const ZKEY = path.join(SERVED, "merkle_membership_final.zkey");
const VKEY_PATH = path.join(SERVED, "merkle_membership_vkey.json");

const SECRET = 42n;
// Representative H4 covenant-binding value (any field element; non-trivial so the
// public-input slot is exercised). The Rust test only asserts a valid proof verifies
// and a tampered one is rejected - it does not pin a specific covenantId.
const COVENANT_ID = 7n;

async function main() {
    process.stdout.write("=== COVEX27 ZK MERKLE MEMBERSHIP ROUNDTRIP (served 3-input circuit) ===\n\n");

    process.stdout.write("STEP 1: Compute MiMC7(secretLeaf, 0) for rootHash\n");
    const mimc7 = await cl.buildMimc7();
    const F = mimc7.F;
    const rootHash = BigInt(F.toString(mimc7.hash(SECRET, 0n)));
    process.stdout.write("MiMC7(" + SECRET + ",0) = " + rootHash.toString() + "\n\n");

    process.stdout.write("STEP 2: Full prove with the SERVED wasm + SERVED final zkey\n");
    const input = {
        rootHash: rootHash.toString(),
        covenantId: COVENANT_ID.toString(),
        secretLeaf: SECRET.toString(),
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    process.stdout.write("publicSignals count = " + publicSignals.length + "\n");
    process.stdout.write("  valid      = " + publicSignals[0] + "\n");
    process.stdout.write("  rootHash   = " + publicSignals[1] + "\n");
    process.stdout.write("  covenantId = " + publicSignals[2] + "\n\n");
    fs.writeFileSync(path.join(ZK_DIR, "merkle_proof.json"), JSON.stringify({ proof, publicSignals }, null, 2));

    process.stdout.write("STEP 3: Verify against the SERVED vkey\n");
    const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
    const v = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    process.stdout.write("VERIFICATION RESULT: " + (v ? "VALID OK" : "INVALID FAIL") + "\n\n");
    if (!v) throw new Error("served vkey REJECTED a freshly generated valid proof");

    process.stdout.write("STEP 4: Negative - wrong rootHash public input\n");
    const badRoot = [publicSignals[0], "9999999999999999999999", publicSignals[2]];
    const r1 = await snarkjs.groth16.verify(vkey, badRoot, proof);
    process.stdout.write("Wrong rootHash: " + (r1 ? "ACCEPTED (BUG)" : "REJECTED OK") + "\n");
    if (r1) throw new Error("vkey ACCEPTED a wrong-rootHash public input");

    process.stdout.write("Negative - wrong covenantId public input\n");
    const badCid = [publicSignals[0], publicSignals[1], "12345"];
    const r1b = await snarkjs.groth16.verify(vkey, badCid, proof);
    process.stdout.write("Wrong covenantId: " + (r1b ? "ACCEPTED (BUG)" : "REJECTED OK") + "\n\n");
    if (r1b) throw new Error("vkey ACCEPTED a wrong-covenantId public input");

    process.stdout.write("STEP 5: Negative - tampered proof\n");
    const badProof = JSON.parse(JSON.stringify(proof));
    badProof.pi_a[0] = badProof.pi_a[0].replace(/^./, "3");
    try {
        const r2 = await snarkjs.groth16.verify(vkey, publicSignals, badProof);
        process.stdout.write("Tampered proof: " + (r2 ? "ACCEPTED (BUG)" : "REJECTED OK") + "\n");
        if (r2) throw new Error("vkey ACCEPTED a tampered proof");
    } catch (e) {
        if (/ACCEPTED/.test(e.message)) throw e;
        process.stdout.write("Tampered proof: REJECTED (threw) OK\n");
    }
    process.stdout.write("\n");

    process.stdout.write("STEP 6: Negative - wrong secret (witness constraint fails)\n");
    try {
        await snarkjs.groth16.fullProve(
            { rootHash: rootHash.toString(), covenantId: COVENANT_ID.toString(), secretLeaf: "999" },
            WASM, ZKEY
        );
        process.stdout.write("UNEXPECTED: prove passed with wrong secret\n");
        throw new Error("witness accepted a wrong secret (constraint not enforced)");
    } catch (e) {
        if (/constraint not enforced/.test(e.message)) throw e;
        process.stdout.write("Witness correctly rejected (constraint violated) OK\n");
    }

    process.stdout.write("\n=== SUMMARY ===\n");
    process.stdout.write("Circuit:      MerkleMembership (MiMC7 preimage + covenantId binding)\n");
    process.stdout.write("Secret:       " + SECRET + "\n");
    process.stdout.write("covenantId:   " + COVENANT_ID + "\n");
    process.stdout.write("MiMC7(42,0):  " + rootHash.toString() + "\n");
    process.stdout.write("nPublic:      " + vkey.nPublic + " (publicSignals=" + publicSignals.length + ")\n");
    process.stdout.write("Prove+Verify: " + (v ? "PASS" : "FAIL") + "\n");
    process.stdout.write("VKey SHA256:  " + crypto.createHash("sha256").update(JSON.stringify(vkey)).digest("hex") + "\n");
    process.stdout.write("Proof:        merkle_proof.json\n");
    process.stdout.write("ZKey:         frontend/public/zk/merkle_membership/merkle_membership_final.zkey (served)\n");
    process.stdout.write("\n=== ZK ROUNDTRIP COMPLETE ===\n");
}
main().catch(e => { process.stderr.write("FATAL: " + (e.message || e) + "\n"); process.exit(1); });
