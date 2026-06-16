#!/usr/bin/env node
"use strict";
const path = require("path");
const { verifyGroth16Hybrid } = require("./lib/verify_groth16_hybrid.js");

verifyGroth16Hybrid({
    proofFile: process.argv[2],
    // Committed, served vkey (matches the served age zkey). NOT the gitignored zk/ root vkey.
    vkeyPath: path.join(__dirname, "../frontend/public/zk/age_verification/age_verification_vkey.json"),
    circuit: process.argv[3] || "age_verification",
    argv: "verify_age_verification.js",
});