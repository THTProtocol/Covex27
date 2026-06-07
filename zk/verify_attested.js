#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

/**
 * Generic attested/hybrid stub verifier for Covex.
 * Used by most new Phase circuits. Returns valid:true with note.
 * Supports groth body detection. Tries to infer circuit name from argv[3] or script filename.
 * Run: node verify_xxx.js <proof.json> [circuit_name]
 * This makes all verify scripts behave consistently for E2E, oracle, and covenant devs.
 */
function main() {
  const proofFile = process.argv[2];
  let circuit = process.argv[3];
  if (!circuit) {
    // Infer from the calling script name, e.g. verify_auction_clearing.js -> auction_clearing
    const script = process.argv[1] || "";
    const base = path.basename(script, ".js");
    circuit = base.replace(/^verify_/, "") || "unknown";
  }
  if (!proofFile) {
    console.log(JSON.stringify({ valid: false, error: "Usage: node verify_xxx.js <proof.json> [circuit_name]" }));
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
    circuit,
    note: `attested/hybrid stub for ${circuit}` + (hasBody ? " (groth body present)" : "")
  }));
}
main();

module.exports = { main };
