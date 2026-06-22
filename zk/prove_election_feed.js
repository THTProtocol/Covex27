#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "election_feed_js/election_feed.wasm");
const ZKEY = path.join(__dirname, "election_feed.zkey");
const OUT = path.join(__dirname, "election_feed_proof.json");

// Usage: node prove_election_feed.js [tallyA] [tallyB] [winner] [threshold] [covenantId] [outFile]
// Public signals: [tallyA, tallyB, winner, threshold, covenantId]; valid is the output (publicSignals[0]).
async function main() {
    const tallyA = process.argv[2] || "1200";
    const tallyB = process.argv[3] || "1000";
    const winner = process.argv[4] || "0";
    const threshold = process.argv[5] || "100";
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[6] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";
    const out = process.argv[7] || OUT;
    const input = { tallyA, tallyB, winner, threshold, covenantId };
    const wtns = path.join(__dirname, ".wtns.election." + path.basename(out) + ".tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(out, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", out, "publicSignals=", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
