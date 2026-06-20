"use strict";
// Read-only sanity: regenerate range_proof vkey from the SERVED frontend zkey, generate a
// real proof with the served zkey+wasm, and confirm the regenerated vkey accepts it while
// the current committed/root vkeys reject it (the bug). Writes candidate vkey + proof to /tmp.
const snarkjs = require("snarkjs");
const { buildMimc7 } = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = "/mnt/HC_Volume_105579109/Covex27";
const FE = path.join(ROOT, "frontend/public/zk/range_proof");
const FE_ZKEY = path.join(FE, "range_proof_final.zkey");
const FE_WASM = path.join(FE, "range_proof.wasm");
const FE_VKEY_CUR = path.join(FE, "range_proof_vkey.json");
const ROOT_VKEY = path.join(ROOT, "zk/range_proof/range_proof_vkey.json"); // what verify_range.js loads today
const OUT_VKEY = "/tmp/range_proof_vkey_new.json";
const OUT_PROOF = "/tmp/range_proof_proof.json";
const md5 = f => fs.existsSync(f) ? crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex").slice(0, 12) : "MISSING";

(async () => {
  const newVkey = await snarkjs.zKey.exportVerificationKey(FE_ZKEY);
  fs.writeFileSync(OUT_VKEY, JSON.stringify(newVkey, null, 2));
  console.log("regenerated vkey md5:", md5(OUT_VKEY));
  console.log("current FE vkey md5 :", md5(FE_VKEY_CUR));
  console.log("current root vkey md5:", md5(ROOT_VKEY));

  const mimc7 = await buildMimc7();
  const value = "123456789", min = "100000000", max = "200000000";
  const commitment = mimc7.F.toString(mimc7.hash(value, 0));
  const input = { value, commitment, min, max };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, FE_WASM, FE_ZKEY);
  fs.writeFileSync(OUT_PROOF, JSON.stringify({ proof, publicSignals }, null, 2));
  console.log("publicSignals:", JSON.stringify(publicSignals));

  const vNew = await snarkjs.groth16.verify(newVkey, publicSignals, proof);
  const vFEcur = await snarkjs.groth16.verify(JSON.parse(fs.readFileSync(FE_VKEY_CUR, "utf8")), publicSignals, proof);
  const vRoot = fs.existsSync(ROOT_VKEY) ? await snarkjs.groth16.verify(JSON.parse(fs.readFileSync(ROOT_VKEY, "utf8")), publicSignals, proof) : null;
  console.log("verify(NEW regenerated vkey):", vNew, "<-- must be true");
  console.log("verify(current FE vkey)     :", vFEcur);
  console.log("verify(current root/oracle vkey):", vRoot, "<-- what the oracle uses today (false = the bug)");
  if (!vNew) { console.error("ABORT: regenerated vkey does not verify the proof"); process.exit(1); }
  console.log("OK: regenerated vkey is the correct match for the served zkey.");
})().catch(e => { console.error("FATAL:", e && e.stack || e); process.exit(1); });
