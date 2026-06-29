#!/usr/bin/env node
"use strict";
/*
 * reconcile_root_samples.js [--check]
 *
 * sync_public_zk_artifacts.sh copies a canonical ROOT sample proof (zk/<...>_proof.json)
 * into the SERVED demo (frontend/public/zk/<id>/demo_proof.json). Several root samples
 * pre-date the covenantId-binding upgrade and DRIFTED: e.g. zk/age_verification_proof.json
 * shipped 4 publicSignals (no covenant binding) while the served circuit's vkey is nPublic=5.
 * The served demos were maintained out-of-band, so root and served fell out of lockstep.
 *
 * This makes every provable circuit's ROOT sample byte-identical to its freshly regenerated,
 * covenant-bound SERVED demo_proof.json, so the sync script is idempotent and the canonical
 * source is honest. It ONLY touches circuits the registry marks provable AND that have a root
 * entry in sync_public_zk_artifacts.sh.
 *
 * merkle_proof.json is intentionally EXCLUDED: the Rust backend test reads it and it is already
 * in sync (3 signals). We never rewrite a backend-read sample from this ZK-only wave.
 *
 *   node zk/scripts/reconcile_root_samples.js          # copy served demo -> root sample
 *   node zk/scripts/reconcile_root_samples.js --check   # exit 1 if any drifts
 */
const fs = require("fs");
const path = require("path");

const ZK = path.join(__dirname, "..");
const ROOT = path.join(ZK, "..");
const SERVED_ROOT = path.join(ROOT, "frontend/public/zk");
const REG = path.join(ZK, "circuit_registry.json");
const SYNC = path.join(__dirname, "sync_public_zk_artifacts.sh");

// Backend-read sample we must not rewrite from this wave.
const EXCLUDE = new Set(["merkle_membership"]);

// Parse copy_pair <id> "$ZK/<vkey>" "$ZK/<proof>" out of the sync script => id -> root proof path.
function parseSyncMap() {
  const src = fs.readFileSync(SYNC, "utf8");
  const map = {};
  for (const m of src.matchAll(/copy_pair\s+(\S+)\s+"\$ZK\/[^"]+"\s+"\$ZK\/([^"]+)"/g)) {
    map[m[1]] = path.join(ZK, m[2]);
  }
  return map;
}

const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
const provable = new Set(reg.full_zk_offchain);
const syncMap = parseSyncMap();

const targets = Object.entries(syncMap).filter(([id]) => provable.has(id) && !EXCLUDE.has(id));
const check = process.argv.includes("--check");
const norm = (s) => s.replace(/\r\n/g, "\n");

let changed = 0, drift = 0, missingDemo = 0;
for (const [id, rootPath] of targets) {
  const demo = path.join(SERVED_ROOT, id, "demo_proof.json");
  if (!fs.existsSync(demo)) { console.error(`MISSING served demo for ${id} (run prove_gate.js --write-demos)`); missingDemo++; continue; }
  const demoData = fs.readFileSync(demo, "utf8");
  const cur = fs.existsSync(rootPath) ? fs.readFileSync(rootPath, "utf8") : "";
  if (norm(cur) === norm(demoData)) continue;
  if (check) { console.error(`ROOT-DRIFT: ${path.relative(ROOT, rootPath)} != served demo for ${id}`); drift++; continue; }
  fs.mkdirSync(path.dirname(rootPath), { recursive: true });
  fs.writeFileSync(rootPath, demoData);
  console.log(`reconciled ${id}: ${path.relative(ROOT, rootPath)} <- served demo`);
  changed++;
}

if (check) {
  if (drift || missingDemo) { console.error(`reconcile-root-samples: ${drift} drift, ${missingDemo} missing.`); process.exit(1); }
  console.log(`reconcile-root-samples: OK (${targets.length} provable root samples match their served demos).`);
  process.exit(0);
}
if (missingDemo) process.exit(1);
console.log(`reconcile-root-samples: ${changed} root sample(s) updated to match served demos (${targets.length} provable, merkle_proof.json excluded).`);
