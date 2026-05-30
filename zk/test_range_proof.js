#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");

async function main() {
    const wasm = "range_proof/output/range_proof_js/range_proof.wasm";
    const zkey = "range_proof/range_proof_final.zkey";
    const vkeyPath = "range_proof/range_proof_vkey.json";
    const proofOut = "range_proof/range_proof_proof.json";

    // Step 1: Compute MiMC7(123456789) using range_proof's own wasm
    // Method: witness calculate with a commitment we know fails, but we can
    // inspect intermediate values. OR: compute via the mimc_test wasm
    // which uses the exact same circom2 + circomlib.
    
    // Compute MiMC7 using the mimc_test wasm (compatible circom2 binary)
    await snarkjs.wtns.calculate({secret: "123456789"}, "mimc_output/mimc_test_js/mimc_test.wasm", "/tmp/rp_mimc.wtns");
    const mw = await snarkjs.wtns.exportJson("/tmp/rp_mimc.wtns");
    const commitment = mw[mw.length - 1]; // BigInt
    
    console.log("MiMC7(123456789) =", commitment.toString());

    // Step 2: Try fullProve with string inputs (snarkjs handles conversion)
    const input = {
        commitment: commitment.toString(),
        min: "100000000",
        max: "200000000",
        value: "123456789"
    };

    console.log("\nAttempting fullProve...");
    try {
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
        console.log("SUCCESS! publicSignals:", JSON.stringify(publicSignals));
        
        fs.writeFileSync(proofOut, JSON.stringify({ proof, publicSignals }, null, 2));
        console.log("Proof written to", proofOut);
        
        const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
        const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        console.log("Verification:", valid ? "VALID" : "INVALID");
    } catch (e) {
        console.log("fullProve FAILED:", String(e).split("\n")[0]);
        
        // Try witness-only
        console.log("\nAttempting witness only...");
        try {
            const wtns = "/tmp/rp_test2.wtns";
            await snarkjs.wtns.calculate(input, wasm, wtns);
            const w = await snarkjs.wtns.exportJson(wtns);
            console.log("Witness OK. Valid signal (last):", w[w.length-1].toString());
            // Now try prove
            const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns);
            console.log("Prove OK! publicSignals:", JSON.stringify(publicSignals));
            
            fs.writeFileSync(proofOut, JSON.stringify({ proof, publicSignals }, null, 2));
            console.log("Proof written to", proofOut);
            
            const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
            const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
            console.log("Verification:", valid ? "VALID" : "INVALID");
        } catch (e2) {
            console.log("Witness FAILED:", String(e2).split("\n")[0]);
        }
    }
}

main().catch(e => {
    console.error("Fatal:", e);
    process.exit(1);
});
