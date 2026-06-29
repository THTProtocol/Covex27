#!/usr/bin/env node
"use strict";
/*
 * served_prove.js <circuit_id> <prove_script.js> <out_proof.json>
 *
 * Generates a REAL Groth16 proof for <circuit_id> using ONLY the committed SERVED artifacts
 * (frontend/public/zk/<id>/<id>.wasm + <id>_final.zkey) - exactly what an in-browser prover or
 * the production verifier uses. Root zk/<id>.zkey files are gitignored and drift, so a
 * gold-standard test must never touch them.
 *
 * It reuses each circuit's canonical witness-input logic WITHOUT duplicating it: it installs a
 * Module-require hook so that when prove_<id>.js does `require("snarkjs")` it receives a wrapper
 * whose wtns.calculate / groth16.prove / groth16.fullProve force the SERVED wasm + zkey. The
 * circuit's `input` object is untouched; only the artifact paths are pinned to the served tree.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");
const realSnark = require("snarkjs");

const [, , circuitId, proveScript, outProof] = process.argv;
if (!circuitId || !proveScript || !outProof) {
  console.error("usage: served_prove.js <circuit_id> <prove_script.js> <out_proof.json>");
  process.exit(2);
}
const ZK = path.join(__dirname, "..");
const SERVED = path.join(ZK, "../frontend/public/zk", circuitId);
const SERVED_WASM = path.join(SERVED, `${circuitId}.wasm`);
const SERVED_ZKEY = path.join(SERVED, `${circuitId}_final.zkey`);
for (const p of [SERVED_WASM, SERVED_ZKEY]) {
  if (!fs.existsSync(p)) { console.error("missing served artifact:", p); process.exit(3); }
}

let captured = null;
// Build a wrapper snarkjs that pins served artifacts. We cannot mutate the frozen real module,
// so we shallow-copy the namespaces we override.
const wrapped = Object.assign(Object.create(Object.getPrototypeOf(realSnark)), realSnark);
wrapped.wtns = Object.assign({}, realSnark.wtns, {
  calculate: (input, _wasm, wtnsOut) => realSnark.wtns.calculate(input, SERVED_WASM, wtnsOut),
});
wrapped.groth16 = Object.assign({}, realSnark.groth16, {
  prove: async (_zkey, wtns) => { const r = await realSnark.groth16.prove(SERVED_ZKEY, wtns); captured = r; return r; },
  fullProve: realSnark.groth16.fullProve
    ? async (input, _wasm, _zkey) => { const r = await realSnark.groth16.fullProve(input, SERVED_WASM, SERVED_ZKEY); captured = r; return r; }
    : undefined,
  verify: realSnark.groth16.verify.bind(realSnark.groth16),
});

// Hook require so the prove script gets `wrapped` for "snarkjs".
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "snarkjs") return wrapped;
  return origRequire.apply(this, arguments);
};

// Some prove scripts (e.g. prove_range_proof.js) gate on fs.existsSync(<root _final.zkey>)
// and early-return WITHOUT calling snarkjs when the gitignored root zkey is absent. Our
// require-hook already forces the SERVED wasm + _final.zkey for the actual prove call, so make
// existsSync report true for any *_final.zkey / *.wasm probe. This never weakens soundness: the
// proof is always generated against the committed served artifacts, never a root one.
const origExists = fs.existsSync.bind(fs);
fs.existsSync = function (p) {
  const s = String(p);
  if (/_final\.zkey$/.test(s) || /\.wasm$/.test(s)) return true;
  return origExists(p);
};

// Redirect any *_proof.json write to temp (never clobber committed files) and capture as fallback.
const origWrite = fs.writeFileSync.bind(fs);
fs.writeFileSync = function (file, data, ...rest) {
  try { const j = JSON.parse(typeof data === "string" ? data : data.toString());
    if (j && j.proof && j.publicSignals && !captured) captured = j; } catch (_) {}
  const base = path.basename(String(file));
  if (/proof\.json$/.test(base)) return origWrite(path.join(os.tmpdir(), `sp_${process.pid}_${base}`), data, ...rest);
  return origWrite(file, data, ...rest);
};
// Neutralize process.exit so an async main() that finishes with exit(0) still lets us emit.
const realExit = process.exit.bind(process);
process.exit = () => {};

(async () => {
  try {
    // The prove script reads its own process.argv[2..] for circuit inputs (birth year, etc).
    // We share the process, so reset argv to just [node, script] BEFORE requiring it so it uses
    // its built-in defaults (a known-valid witness) instead of our [circuitId, proveScript, out].
    process.argv = [process.argv[0], path.resolve(proveScript)];
    require(path.resolve(proveScript));
    for (let i = 0; i < 400 && !captured; i++) await new Promise((r) => setTimeout(r, 50));
    if (!captured) { console.error("no proof captured for", circuitId); realExit(4); }
    origWrite(outProof, JSON.stringify({ proof: captured.proof, publicSignals: captured.publicSignals }, null, 2));
    console.log(`served-proof ${circuitId} publicSignals=${JSON.stringify(captured.publicSignals)}`);
    realExit(0);
  } catch (e) { console.error("served_prove error:", e && e.message ? e.message : String(e)); realExit(5); }
})();
