#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "velocity_limit_js/velocity_limit.wasm");
const ZKEY = path.join(__dirname, "velocity_limit.zkey");
const OUT = path.join(__dirname, "velocity_limit_proof.json");

// HONEST witness: 8 private spend amounts over a window that genuinely sum to <= limit.
// 1000+1500+2000+500+750+1250+800+1200 = 9000  <=  limit (10000) -> valid == 1
async function main() {
    const amounts = ["1000", "1500", "2000", "500", "750", "1250", "800", "1200"];
    const sum = amounts.reduce((a, v) => a + BigInt(v), 0n);
    const limit = process.argv[2] || "10000";
    const windowId = process.argv[3] || "20260622"; // e.g. a day/epoch tag
    // covenantId = sha256(deploy_tx_id) mod BN254 in production; a fixed demo value here.
    const covenantId = process.argv[4] || "12975856296764178385096300579349863837782422391258567265242335968196494733975";
    const input = { amounts, limit, windowId, covenantId };
    console.log("sum=" + sum.toString() + " limit=" + limit + " expect valid=" + (sum <= BigInt(limit) ? 1 : 0));
    const wtns = path.join(__dirname, ".wtns.vl.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("publicSignals (valid,limit,windowId,covenantId):", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
