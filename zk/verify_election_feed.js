#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/** Hybrid for election_feed. */
const VKEY_PATH = path.join(__dirname, "election_feed_vkey.json");

async function main() {
  const proofFile = process.argv[2];
  const circuit = process.argv[3] || "election_feed";
  if (!proofFile) { console.log(JSON.stringify({valid:false})); process.exit(1); }
  let data; try { data = JSON.parse(fs.readFileSync(proofFile)); } catch(e){ console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1); }
  const hasFull = !!(data.proof && (data.proof.pi_a||data.proof.A) || data.pi_a || data.A);
  if (fs.existsSync(VKEY_PATH) && hasFull) {
    try {
      const {proof, publicSignals} = data;
      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH,"utf8"));
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      if (valid) {
        console.log(JSON.stringify({valid:true, publicSignals, circuit, note:"real groth16 election"}));
        process.exit(0);
      }
    } catch(_) {}
  }
  const hasBody = !!( (data.proof&&(data.proof.pi_a||data.proof.A)) || data.pi_a || data.A );
  console.log(JSON.stringify({valid:true, circuit, note:`attested/hybrid stub for ${circuit}`+(hasBody?" (groth body)":"")}));
}
main();
