#!/usr/bin/env node
"use strict";
const path = require("path");
const { verifyGroth16Hybrid } = require("./lib/verify_groth16_hybrid.js");

verifyGroth16Hybrid({
    proofFile: process.argv[2],
    vkeyPath: path.join(__dirname, "collateral_ltv_vkey.json"),
    circuit: process.argv[3] || "collateral_ltv",
    argv: "verify_collateral_ltv.js",
});