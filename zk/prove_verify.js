#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const ZK_DIR = __dirname;
const SECRET=42n;

async function main() {
    process.stdout.write("=== COVEX27 PHASE 2 — ZK MERKLE MEMBERSHIP ROUNDTRIP ===\n\n");

    process.stdout.write("STEP 1: Compute MiMC7(42) via HashHelper\n");
    const hashWasm = path.join(ZK_DIR, "hash_output/hash_helper_js/hash_helper.wasm");
    const hashWtns = path.join(ZK_DIR, "hash_witness.wtns");
    await snarkjs.wtns.calculate({ secret: SECRET.toString() }, hashWasm, hashWtns);
    const hWitness = await snarkjs.wtns.exportJson(hashWtns);
    const rootHash = BigInt(hWitness[1]);
    process.stdout.write("MiMC7(42) = " + rootHash.toString() + "\n\n");

    process.stdout.write("STEP 2: Generate MerkleMembership witness\n");
    const memberWasm = path.join(ZK_DIR, "output/merkle_membership_js/merkle_membership.wasm");
    const memberWtns = path.join(ZK_DIR, "member_witness.wtns");
    await snarkjs.wtns.calculate(
        { rootHash: rootHash.toString(), secretLeaf: SECRET.toString() },
        memberWasm, memberWtns
    );
    const mWitness = await snarkjs.wtns.exportJson(memberWtns);
    process.stdout.write("Witness: valid=" + mWitness[1].toString() + " rootHash=...\n\n");

    process.stdout.write("STEP 3: Generate Groth16 proof\n");
    const zkeyPath = path.join(ZK_DIR, "merkle_membership_final.zkey");
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, memberWtns);
    process.stdout.write("Proof generated. publicSignals count=" + publicSignals.length + "\n");
    process.stdout.write("  valid=" + publicSignals[0] + "\n");
    process.stdout.write("  rootHash=" + publicSignals[1] + "\n\n");
    fs.writeFileSync(path.join(ZK_DIR, "merkle_proof.json"), JSON.stringify({ proof, publicSignals }, null, 2));

    process.stdout.write("STEP 4: Verify\n");
    const vkey = JSON.parse(fs.readFileSync(path.join(ZK_DIR, "merkle_membership_vkey.json"), "utf8"));
    const v = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    process.stdout.write("VERIFICATION RESULT: " + (v ? "VALID OK" : "INVALID FAIL") + "\n\n");

    process.stdout.write("STEP 5: Negative — wrong rootHash public input\n");
    const bad1 = [publicSignals[0], "9999999999999999999999"];
    const r1 = await snarkjs.groth16.verify(vkey, bad1, proof);
    process.stdout.write("Wrong rootHash: " + (r1 ? "ACCEPTED (BUG)" : "REJECTED OK") + "\n\n");

    process.stdout.write("STEP 6: Negative — tampered proof\n");
    const badProof = JSON.parse(JSON.stringify(proof));
    badProof.pi_a[0] = badProof.pi_a[0].replace(/^./, "3");
    try {
        const r2 = await snarkjs.groth16.verify(vkey, publicSignals, badProof);
        process.stdout.write("Tampered proof: " + (r2 ? "ACCEPTED (BUG)" : "REJECTED OK") + "\n");
    } catch(e) {
        process.stdout.write("Tampered proof: REJECTED (threw) OK\n");
    }
    process.stdout.write("\n");

    process.stdout.write("STEP 7: Negative — wrong secret (witness constraint fails)\n");
    try {
        await snarkjs.wtns.calculate({ rootHash: rootHash.toString(), secretLeaf: "999" }, memberWasm, path.join(ZK_DIR, "bad.wtns"));
        process.stdout.write("UNEXPECTED: witness passed with wrong secret\n");
    } catch(e) {
        process.stdout.write("Witness correctly rejected (constraint violated) OK\n");
    }
    process.stdout.write("\n=== SUMMARY ===\n");
    process.stdout.write("Circuit:    MerkleMembership (MiMC7 preimage proof)\n");
    process.stdout.write("Secret:     42\n");
    process.stdout.write("MiMC7(42):  " + rootHash.toString() + "\n");
    process.stdout.write("Prove+Verify: " + (v ? "PASS" : "FAIL") + "\n");
    const crypto = require("crypto");
    process.stdout.write("VKey SHA256: " + crypto.createHash("sha256").update(JSON.stringify(vkey)).digest("hex") + "\n");
    process.stdout.write("Proof:       merkle_proof.json\n");
    process.stdout.write("ZKey:        merkle_membership_final.zkey\n");
    process.stdout.write("\n=== PHASE 2 ZK ROUNDTRIP COMPLETE ===\n");

    try { fs.unlinkSync(hashWtns); } catch(e) {}
    try { fs.unlinkSync(memberWtns); } catch(e) {}
    try { fs.unlinkSync(path.join(ZK_DIR, "bad.wtns")); } catch(e) {}
}
main().catch(e => { process.stderr.write("FATAL: " + (e.message || e) + "\n"); process.exit(1); });
