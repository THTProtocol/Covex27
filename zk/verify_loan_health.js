#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { verifyGroth16Hybrid } = require("./lib/verify_groth16_hybrid.js");

// Load the vkey that PAIRS with the served zkey real provers use. The committed, SERVED
// frontend artifact (frontend/public/zk/loan_health/) is the single source of truth;
// the old zk/ root path is gitignored and absent in a clean checkout, so the verifier
// failed closed on every real proof ("missing verifying key"). Same fix as verify.js /
// verify_range.js / verify_poker_vrf_deal.js.
const VKEY_CANDIDATES = [
    path.join(__dirname, "..", "frontend", "public", "zk", "loan_health", "loan_health_vkey.json"),
    path.join(__dirname, "loan_health_vkey.json"),
];
const VKEY_PATH = VKEY_CANDIDATES.find((p) => fs.existsSync(p)) || VKEY_CANDIDATES[0];

verifyGroth16Hybrid({
    proofFile: process.argv[2],
    vkeyPath: VKEY_PATH,
    circuit: process.argv[3] || "loan_health",
    argv: "verify_loan_health.js",
});
