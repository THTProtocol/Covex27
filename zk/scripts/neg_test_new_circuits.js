"use strict";
// Negative-predicate soundness for the two new circuits: a value OUTSIDE the band (merkle_range)
// and two DIFFERENT committed values (equality) must produce a VERIFYING proof whose computed
// `valid` output is 0 - proving the validity signal is a genuine CONSTRAINED output, not a stub.
const snarkjs = require("snarkjs");
const path = require("path");
const { hash } = require("../lib/poseidon_hash");
const SERVED = path.join(__dirname, "../../frontend/public/zk");

async function mrmOutOfBand() {
  const DEPTH = 4;
  const accounts = [], values = [], leaves = [];
  for (let i = 0; i < 16; i++) {
    const a = BigInt(100 + i), v = BigInt(1000 * (i + 1));
    accounts.push(a); values.push(v);
    leaves.push(BigInt(await hash([a.toString(), v.toString()])));
  }
  let level = leaves.slice(); const levels = [level];
  for (let d = 0; d < DEPTH; d++) {
    const n = []; for (let i = 0; i < level.length; i += 2) n.push(BigInt(await hash([level[i].toString(), level[i + 1].toString()])));
    levels.push(n); level = n;
  }
  const root = levels[DEPTH][0]; const idx = 5;
  const pe = [], pi = []; let pos = idx;
  for (let d = 0; d < DEPTH; d++) { const r = pos % 2; pe.push(levels[d][r ? pos - 1 : pos + 1].toString()); pi.push(r ? "1" : "0"); pos = Math.floor(pos / 2); }
  // member leaf (value 6000) but band [1,2] does NOT contain it -> valid must be 0.
  const input = { root: root.toString(), lo: "1", hi: "2", covenantId: "7", account: accounts[idx].toString(), value: values[idx].toString(), pathElements: pe, pathIndices: pi };
  const d = SERVED + "/merkle_range_membership/merkle_range_membership";
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, d + ".wasm", d + "_final.zkey");
  const ok = await snarkjs.groth16.verify(require(d + "_vkey.json"), publicSignals, proof);
  console.log(`MRM out-of-band: verifies=${ok} valid=${publicSignals[0]}  (expect verifies=true valid=0)`);
  if (!(ok === true && publicSignals[0] === "0")) process.exitCode = 1;
}

async function eocDifferent() {
  // commitmentA opens to 111, commitmentB opens to 222. Feed value=111 -> hB(111,saltB) != cB,
  // so equality is genuinely false: a verifying proof with valid=0.
  const va = "111", vb = "222", sa = "11", sb = "22";
  const cA = await hash([va, sa]);
  const cB = await hash([vb, sb]);
  const input = { commitmentA: cA, commitmentB: cB, covenantId: "7", value: va, saltA: sa, saltB: sb };
  const d = SERVED + "/equality_of_commitments/equality_of_commitments";
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, d + ".wasm", d + "_final.zkey");
  const ok = await snarkjs.groth16.verify(require(d + "_vkey.json"), publicSignals, proof);
  console.log(`EOC different-values: verifies=${ok} valid=${publicSignals[0]}  (expect verifies=true valid=0)`);
  if (!(ok === true && publicSignals[0] === "0")) process.exitCode = 1;
}

(async () => { await mrmOutOfBand(); await eocDifferent(); })().catch((e) => { console.error(e.message); process.exit(1); });
