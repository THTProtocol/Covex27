#!/usr/bin/env node
"use strict";
const path = require("path");
const { verifyGroth16Hybrid } = require("./lib/verify_groth16_hybrid.js");

verifyGroth16Hybrid({
    proofFile: process.argv[2],
    vkeyPath: path.join(__dirname, "age_verification_vkey.json"),
    circuit: process.argv[3] || "age_verification",
    argv: "verify_age_verification.js",
});