#!/usr/bin/env node
/**
 * Full-ZK E2E matrix — local verify + optional live oracle (hightable.pro)
 * Usage:
 *   node zk/test_e2e_full_zk.js
 *   BASE_URL=https://hightable.pro node zk/test_e2e_full_zk.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ZK = __dirname;
const BASE_URL = process.env.BASE_URL || "";

const CASES = [
  {
    name: "merkle_membership",
    proof: "merkle_proof.json",
    verify: "node verify.js merkle_proof.json",
    circuit_type: "merkle_membership",
  },
  {
    name: "range_proof",
    proof: "range_proof/range_proof_proof.json",
    verify: "node verify_range.js range_proof/range_proof_proof.json",
    circuit_type: "range_proof",
    optional: true,
  },
  {
    name: "hash_preimage",
    proof: "hash_preimage/hash_preimage_proof.json",
    verify: "node verify_hash_preimage.js hash_preimage/hash_preimage_proof.json",
    circuit_type: "hash_preimage",
  },
  {
    name: "timelock_absolute",
    proof: "timelock/timelock_proof.json",
    verify: "node verify_timelock.js timelock/timelock_proof.json",
    circuit_type: "timelock_absolute",
  },
  {
    name: "tictactoe_v1",
    proof: "games/tictactoe/output/proofs/tt_move_4.json",
    verify: "node verify_tictactoe.js games/tictactoe/output/proofs/tt_move_4.json",
    circuit_type: "tictactoe_v1",
  },
  {
    name: "connect4_v1",
    proof: "games/connect4/output/proofs/c4_col3.json",
    verify: "node verify_connect4.js games/connect4/output/proofs/c4_col3.json",
    circuit_type: "connect4_v1",
  },
  {
    name: "privacy_mixer_v1",
    proof: "privacy_mixer/output/proofs/withdraw_demo.json",
    verify: "node verify_privacy_mixer.js privacy_mixer/output/proofs/withdraw_demo.json",
    circuit_type: "privacy_mixer_v1",
    optional: true,
  },
  {
    name: "chess_v1",
    proof: "games/chess/output/proofs/move_demo.json",
    verify: "node verify_chess.js games/chess/output/proofs/move_demo.json",
    circuit_type: "chess_v1",
    optional: true,
  },
];

function run(cmd) {
  return execSync(cmd, { cwd: ZK, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

async function liveOracle(circuit_type, proofPath) {
  if (!BASE_URL) return { skipped: true };
  const data = JSON.parse(fs.readFileSync(path.join(ZK, proofPath), "utf8"));
  const body = {
    covenant_id: `e2e-matrix-${circuit_type}-${Date.now()}`,
    circuit_type,
    proof: data.proof,
    public_inputs: data.publicSignals,
  };
  const res = await fetch(`${BASE_URL}/api/oracle/verify-and-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  console.log("=== Covex27 Full-ZK E2E Matrix ===\n");
  let pass = 0;
  let fail = 0;
  let skip = 0;

  for (const c of CASES) {
    const proofFull = path.join(ZK, c.proof);
    process.stdout.write(`${c.name}: `);
    if (!fs.existsSync(proofFull)) {
      console.log(c.optional ? "SKIP (no proof, optional)" : "FAIL (missing proof)");
      c.optional ? skip++ : fail++;
      continue;
    }
    try {
      const out = run(c.verify);
      const j = JSON.parse(out.split("\n").pop());
      if (!j.valid) {
        console.log("FAIL local verify:", j.error || j);
        fail++;
        continue;
      }
      if (BASE_URL) {
        const live = await liveOracle(c.circuit_type, c.proof);
        if (live.success) {
          console.log(`PASS local + live (outcome=${live.outcome})`);
          pass++;
        } else if (live.error && live.error.includes("Nullifier already spent")) {
          console.log("PASS local; live SKIP (nullifier spent — double-spend guard OK)");
          pass++;
        } else {
          console.log("FAIL live:", live.error || live);
          fail++;
        }
      } else {
        console.log("PASS local (set BASE_URL for live oracle)");
        pass++;
      }
    } catch (e) {
      console.log("FAIL:", e.message || e);
      fail++;
    }
  }

  console.log(`\nResults: ${pass} pass, ${fail} fail, ${skip} skip`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});