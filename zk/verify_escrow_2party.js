#!/usr/bin/env node
"use strict";
const path = require("path");
const { verifyGroth16Hybrid } = require("./lib/verify_groth16_hybrid.js");

verifyGroth16Hybrid({
    proofFile: process.argv[2],
    // Committed, served vkey (matches the in-browser prover's served zkey). NOT the gitignored
    // zk/ root vkey, which drifts stale and would reject every real proof.
    vkeyPath: path.join(__dirname, "../frontend/public/zk/escrow_2party/escrow_2party_vkey.json"),
    circuit: process.argv[3] || "escrow_2party",
    argv: "verify_escrow_2party.js",
});