#!/usr/bin/env node
"use strict";
/*
 * gen_circuit_registry.js - regenerate zk/circuit_registry.json from GROUND TRUTH.
 *
 * The registry is HONEST by construction: it is derived from what is actually committed under
 * frontend/public/zk/<id>/ (the served artifacts an in-browser prover and the production
 * verifier use), cross-checked against the canonical sets in
 * frontend/src/lib/zk/circuits.js (VERIFIED_FULL_ZK / STRICT_GROTH16). It NEVER claims a
 * circuit has a working prover unless a served _final.zkey exists, and never omits a served
 * circuit.
 *
 * Reality labels (per served artifacts):
 *   full-zk-offchain : served wasm + _final.zkey + vkey AND in VERIFIED_FULL_ZK
 *                      (real in-browser Groth16 prover; proof verified OFF-CHAIN, fail-closed;
 *                      NOT an on-chain-ZK / trustless-on-Kaspa claim).
 *   source+vkey      : served wasm + vkey but NO served _final.zkey -> a proof can NOT be
 *                      generated yet, so it is NOT claimable. Honest "compiled, not provable".
 *   vkey-only        : served vkey but no served wasm (legacy placeholder / not runnable).
 *
 * Run:  node zk/scripts/gen_circuit_registry.js            # writes zk/circuit_registry.json
 *       node zk/scripts/gen_circuit_registry.js --check    # exit 1 if the file is stale
 */
const fs = require("fs");
const path = require("path");

const ZK = path.join(__dirname, "..");
const SERVED_ROOT = path.join(ZK, "../frontend/public/zk");
const CIRCUITS_JS = path.join(ZK, "../frontend/src/lib/zk/circuits.js");
const OUT = path.join(ZK, "circuit_registry.json");

// Parse a `new Set([ ... ])` literal named NAME out of circuits.js (single source of truth).
function parseSet(src, name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`);
  const m = src.match(re);
  if (!m) throw new Error(`could not parse set ${name} from circuits.js`);
  return new Set([...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]));
}

// Parse the ARTIFACT_DIR alias map ({ catalogId: 'servedDir', ... }) so we can record catalog
// ids whose served artifacts live under a different directory (e.g. utxo_ownership ->
// basic_utxo_ownership). These do NOT have their own served dir, so they are reported as
// aliases, not as separate provable circuits (avoids a phantom over-count).
function parseAliasMap(src) {
  const m = src.match(/export const ARTIFACT_DIR\s*=\s*\{([\s\S]*?)\}/);
  const out = {};
  if (m) for (const e of m[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) out[e[1]] = e[2];
  return out;
}

const src = fs.readFileSync(CIRCUITS_JS, "utf8");
const VERIFIED_FULL_ZK = parseSet(src, "VERIFIED_FULL_ZK");
const STRICT_GROTH16 = parseSet(src, "STRICT_GROTH16");
const ARTIFACT_DIR = parseAliasMap(src);

function has(dir, name) { return fs.existsSync(path.join(SERVED_ROOT, dir, name)); }
function firstExisting(dir, names) { return names.find((n) => has(dir, n)) || null; }

// catalog ids (incl. aliases) that resolve to a given served directory.
const aliasesOf = (dir) => Object.entries(ARTIFACT_DIR).filter(([, t]) => t === dir).map(([a]) => a);
// A served dir is "verified full-zk" if its own id OR any catalog alias targeting it is in the set.
const isVerifiedFullZk = (dir) => VERIFIED_FULL_ZK.has(dir) || aliasesOf(dir).some((a) => VERIFIED_FULL_ZK.has(a));
const isStrict = (dir) => STRICT_GROTH16.has(dir) || aliasesOf(dir).some((a) => STRICT_GROTH16.has(a));

const dirs = fs.readdirSync(SERVED_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const circuits = [];
let provable = 0, sourceVkey = 0, vkeyOnly = 0;
for (const id of dirs) {
  const wasm = firstExisting(id, [`${id}.wasm`]);
  const zkey = firstExisting(id, [`${id}_final.zkey`]);
  const vkey = firstExisting(id, [`${id}_vkey.json`, `verification_key.json`]);
  if (!vkey) continue; // a served circuit must at least expose a vkey to appear in the registry

  let reality;
  if (wasm && zkey && isVerifiedFullZk(id)) { reality = "full-zk-offchain"; provable++; }
  else if (wasm) { reality = "source+vkey"; sourceVkey++; }
  else { reality = "vkey-only"; vkeyOnly++; }

  const aliases = aliasesOf(id);
  circuits.push({
    id,
    reality,
    served: { wasm: !!wasm, zkey: !!zkey, vkey: !!vkey },
    in_browser_prover: reality === "full-zk-offchain",
    backend_strict_groth16: isStrict(id),
    ...(aliases.length ? { catalog_aliases: aliases } : {}),
  });
}

const registry = {
  schema: "covex-zk-registry/2",
  generated_by: "zk/scripts/gen_circuit_registry.js (do not hand-edit; run the generator)",
  honesty: [
    "Derived from committed served artifacts under frontend/public/zk/ + the canonical sets in",
    "frontend/src/lib/zk/circuits.js. A circuit is 'full-zk-offchain' (real in-browser Groth16",
    "prover, proof verified OFF-CHAIN fail-closed) ONLY if it ships served wasm + _final.zkey +",
    "vkey AND is in VERIFIED_FULL_ZK. 'source+vkey' = compiled + vkey but NO served proving key",
    "(NOT provable yet, NOT claimable). This is OFF-CHAIN verification: Kaspa has no on-chain",
    "pairing verifier; a valid proof gates a 2-of-2 cosign + CSV timeout and only a BIP340",
    "Schnorr co-signature is checked on-chain. The trusted setup is a single-contributor Covex",
    "dev ceremony, NOT a production multi-party MPC.",
  ].join(" "),
  counts: {
    served_with_vkey: circuits.length,
    full_zk_offchain_provable: provable,
    source_plus_vkey_not_provable: sourceVkey,
    vkey_only: vkeyOnly,
  },
  // Catalog aliases: a catalog circuit id whose served artifacts live under a different served
  // directory. They are NOT separate provable circuits; the frontend VERIFIED_FULL_ZK set counts
  // both the alias and its target, so we record them here for full reconciliation.
  catalog_aliases: Object.entries(ARTIFACT_DIR).map(([alias, target]) => ({
    alias, target,
    target_provable: circuits.some((c) => c.id === target && c.reality === "full-zk-offchain"),
  })),
  // Distinct provable served directories, plus catalog ids that resolve to them via an alias.
  // This is the number the frontend VERIFIED_FULL_ZK set enumerates (19 = 18 dirs + 1 alias).
  provable_catalog_ids: provable + Object.keys(ARTIFACT_DIR).filter((a) => VERIFIED_FULL_ZK.has(a)).length,
  full_zk_offchain: circuits.filter((c) => c.reality === "full-zk-offchain").map((c) => c.id),
  circuits,
};

const json = JSON.stringify(registry, null, 2) + "\n";

// ---------------------------------------------------------------------------
// NOT_PROVABLE markers. Every served dir that exposes a vkey is EITHER provable
// (ships a served _final.zkey -> reality full-zk-offchain) OR must carry a
// per-dir frontend/public/zk/<id>/NOT_PROVABLE.json so a casual browser of the
// served paths is told, in-band, that there is no served proving key and the
// circuit is NOT claimable. No silent middle: a vkey-bearing dir with neither a
// served zkey nor a marker is a drift the registry gate must red.
//
// The marker content is HONEST per reality:
//   source+vkey : compiled circuit + vkey, but NO served proving key.
//   vkey-only   : only a vkey is served (no wasm) - legacy placeholder.
// ---------------------------------------------------------------------------
const REASONS = {
  "source+vkey":
    "compiled circuit (served wasm + vkey) but NO served _final.zkey proving key; a proof cannot be generated from the served artifacts, so this circuit is not claimable yet.",
  "vkey-only":
    "only a verification key is served (no wasm, no proving key); legacy placeholder, not runnable or claimable.",
};
function markerFor(c) {
  return JSON.stringify(
    {
      id: c.id,
      provable: false,
      reality: c.reality,
      reason: REASONS[c.reality] || "no served proving key; not claimable yet.",
      note: "Off-chain Groth16 (Kaspa has no on-chain pairing verifier). Trusted setup is a single-contributor Covex dev ceremony, NOT a production MPC. See zk/circuit_registry.json.",
    },
    null,
    2
  ) + "\n";
}
const MARKER = "NOT_PROVABLE.json";
const nonProvable = circuits.filter((c) => c.reality !== "full-zk-offchain");
const provableIds = new Set(circuits.filter((c) => c.reality === "full-zk-offchain").map((c) => c.id));

if (process.argv.includes("--check")) {
  const norm = (s) => s.replace(/\r\n/g, "\n");
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  // Normalize CRLF -> LF before comparing so the gate does not false-fail on a Windows checkout
  // with core.autocrlf=true (which checks the file out with CRLF while the generator emits LF).
  if (norm(cur) !== norm(json)) {
    console.error("circuit_registry.json is STALE. Run: node zk/scripts/gen_circuit_registry.js");
    process.exit(1);
  }
  let bad = 0;
  // Every non-provable served dir must carry an in-sync NOT_PROVABLE.json marker.
  for (const c of nonProvable) {
    const mp = path.join(SERVED_ROOT, c.id, MARKER);
    if (!fs.existsSync(mp)) { console.error(`MISSING marker: ${c.id}/${MARKER}`); bad++; continue; }
    if (norm(fs.readFileSync(mp, "utf8")) !== norm(markerFor(c))) {
      console.error(`STALE marker: ${c.id}/${MARKER} (run gen_circuit_registry.js)`); bad++;
    }
  }
  // No silent middle: a provable dir must NOT carry a marker (would be a false NOT_PROVABLE claim).
  for (const id of provableIds) {
    if (fs.existsSync(path.join(SERVED_ROOT, id, MARKER)))
      { console.error(`STRAY marker: ${id}/${MARKER} on a PROVABLE circuit`); bad++; }
  }
  if (bad) { console.error(`NOT_PROVABLE markers: ${bad} problem(s).`); process.exit(1); }
  console.log(`circuit_registry.json up to date (${provable} provable, ${sourceVkey} source+vkey, ${vkeyOnly} vkey-only); ${nonProvable.length} NOT_PROVABLE markers in sync.`);
  process.exit(0);
}

fs.writeFileSync(OUT, json);
// Write/refresh a marker into every non-provable served dir; remove any stray marker on a provable one.
let wroteMarkers = 0;
for (const c of nonProvable) { fs.writeFileSync(path.join(SERVED_ROOT, c.id, MARKER), markerFor(c)); wroteMarkers++; }
for (const id of provableIds) {
  const mp = path.join(SERVED_ROOT, id, MARKER);
  if (fs.existsSync(mp)) fs.unlinkSync(mp);
}
console.log(`Wrote ${OUT}`);
console.log(`  full-zk-offchain (provable): ${provable}`);
console.log(`  source+vkey (not provable):  ${sourceVkey}`);
console.log(`  vkey-only:                   ${vkeyOnly}`);
console.log(`  total served-with-vkey:      ${circuits.length}`);
console.log(`  NOT_PROVABLE markers written: ${wroteMarkers}`);
