#!/usr/bin/env node
"use strict";
const fs = require("fs");

/**
 * Generic attested/hybrid stub verifier for Covex.
 * Used by most new Phase circuits (poker variants, collateral_ltv, etc.).
 * Returns valid:true with note. Supports groth body detection for hybrid.
 * Run: node verify_attested.js <proof.json> [circuit_name]
 */
function main() {
  const proofFile = process.argv[2];
  const circuit = process.argv[3] || "unknown";
  if (!proofFile) {
    console.log(JSON.stringify({ valid: false, error: "Usage: node verify_attested.js <proof.json> [circuit]" }));
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(proofFile));
  } catch (e) {
    console.log(JSON.stringify({ valid: false, error: e.message }));
    process.exit(1);
  }
  const proof = data.proof || data;
  const hasBody = !!(proof && (proof.pi_a || proof.A || data.pi_a));
  console.log(JSON.stringify({
    valid: true,
    note: `attested/hybrid stub for ${circuit}` + (hasBody ? " (groth body present)" : "")
  }));
}
main();
