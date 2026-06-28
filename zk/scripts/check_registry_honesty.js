#!/usr/bin/env node
"use strict";
/*
 * check_registry_honesty.js - the cross-check half of the ZK registry gate (called by
 * scripts/check-zk-registry.sh). Fails (exit 1) on any of:
 *   (2) a circuit the registry marks full-zk-offchain / in_browser_prover that does NOT ship a
 *       served _final.zkey + wasm + vkey (over-claim).
 *   (3) a circuit the frontend marks VERIFIED_FULL_ZK (directly or via ARTIFACT_DIR alias) that
 *       has no served _final.zkey (claim with no key).
 *   (4) a served _final.zkey whose circuit is NOT recorded provable in the registry (omission).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const REG = path.join(ROOT, "zk/circuit_registry.json");
const SERVED = path.join(ROOT, "frontend/public/zk");
const CIRCUITS_JS = path.join(ROOT, "frontend/src/lib/zk/circuits.js");

const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
const src = fs.readFileSync(CIRCUITS_JS, "utf8");

function parseSet(name) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!m) throw new Error(`cannot parse set ${name}`);
  return new Set([...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]));
}
const VFZ = parseSet("VERIFIED_FULL_ZK");
const aliasMap = {};
{
  const m = src.match(/export const ARTIFACT_DIR\s*=\s*\{([\s\S]*?)\}/);
  if (m) for (const e of m[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) aliasMap[e[1]] = e[2];
}
const servedZkey = (id) => fs.existsSync(path.join(SERVED, id, `${id}_final.zkey`));
const servedWasm = (id) => fs.existsSync(path.join(SERVED, id, `${id}.wasm`));
const servedVkey = (id) =>
  fs.existsSync(path.join(SERVED, id, `${id}_vkey.json`)) ||
  fs.existsSync(path.join(SERVED, id, "verification_key.json"));

let bad = 0;
const err = (m) => { console.error(m); bad++; };

// (2) every claimed-provable circuit must actually have served zkey+wasm+vkey
for (const c of reg.circuits) {
  if (c.reality === "full-zk-offchain" || c.in_browser_prover) {
    if (!(c.served && c.served.zkey && c.served.wasm && c.served.vkey &&
          servedZkey(c.id) && servedWasm(c.id) && servedVkey(c.id))) {
      err(`OVER-CLAIM: ${c.id} marked provable but missing served zkey/wasm/vkey on disk`);
    }
  }
}
// (3) frontend VERIFIED_FULL_ZK ids must resolve to a served zkey
for (const id of VFZ) {
  const dir = aliasMap[id] || id;
  if (!servedZkey(dir)) err(`CLAIM-NO-KEY: VERIFIED_FULL_ZK has ${id} (-> ${dir}) but no served _final.zkey`);
}
// (4) any served _final.zkey must be recorded provable in the registry
for (const d of fs.readdirSync(SERVED, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const id = d.name;
  if (servedZkey(id)) {
    const rec = reg.circuits.find((c) => c.id === id);
    if (!rec) err(`OMISSION: served _final.zkey for ${id} but not in registry`);
    else if (rec.reality !== "full-zk-offchain")
      err(`UNDER-CLAIM: ${id} ships a served _final.zkey but registry reality=${rec.reality}`);
  }
}

if (bad) { console.error(`\ncheck-zk-registry: ${bad} honesty problem(s)`); process.exit(1); }
console.log(`check-zk-registry: OK (${reg.counts.full_zk_offchain_provable} provable served circuits, all keys present, no over-claim/omission).`);
