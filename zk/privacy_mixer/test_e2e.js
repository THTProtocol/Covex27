#!/usr/bin/env node
"use strict";
/**
 * E2E: deposit note → register leaf → prove withdraw → verify → oracle (if server up)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const snarkjs = require("snarkjs");

const ZK = path.resolve(__dirname, "..");
const BASE = __dirname;

async function main() {
    console.log("=== Privacy Mixer E2E ===\n");

    const depOut = execSync(`node ${path.join(BASE, "scripts/prove_deposit.js")} 555555 666666 100000000`, { encoding: "utf8" });
    const dep = JSON.parse(depOut);
    console.log("1. Deposit note leaf:", dep.leaf_hash.slice(0, 20) + "...");

    execSync(`node ${path.join(BASE, "scripts/prove_withdraw.js")} 555555 666666 100000000 777777`, { stdio: "inherit" });

    const proofFile = path.join(BASE, "output/proofs/withdraw_demo.json");
    const vkey = JSON.parse(fs.readFileSync(path.join(ZK, "privacy_mixer_v1_vkey.json"), "utf8"));
    const { proof, publicSignals } = JSON.parse(fs.readFileSync(proofFile, "utf8"));
    const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    console.log("\n2. Local Groth16 verify:", ok ? "PASS" : "FAIL");
    console.log("3. mixer_valid:", publicSignals[0]);
    console.log("4. nullifier:", publicSignals[2]);

    const verifyOut = execSync(`node ${path.join(ZK, "verify_privacy_mixer.js")} ${proofFile}`, { encoding: "utf8" });
    console.log("5. verify_privacy_mixer.js:", verifyOut.trim());

    console.log("\n=== E2E COMPLETE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });