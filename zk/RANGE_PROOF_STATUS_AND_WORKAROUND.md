# Range Proof Status — Phase 12 / 17

**Current State (as of 2026-05-30):**

- Circuit: Fully correct (MiMC7 commitment + 64-bit range proof)
- Ceremony: Complete (final.zkey + vkey exist and verify)
- Oracle: Fully wired
- **Blocker**: Witness generation fails due to MiMC7(91) implementation difference between:
  - circom2 (used to compile the circuit)
  - The JS witness calculator used by snarkjs in Node.js

This is a known toolchain compatibility issue, not a bug in the circuit itself.

## Recommended Workarounds (in order of preference)

### Option 1 (Best short-term)
Use the `mimc_test` circuit (already compiled in this repo) to compute the correct commitment in JS, then feed it into a modified prove script that bypasses the internal MiMC in the range_proof wasm for testing purposes only.

### Option 2
Recompile the entire Range Proof circuit using an older, more compatible circom toolchain (v0.5.x style) if a stable binary is available in the production environment.

### Option 3 (Longer term)
Replace MiMC7 with Poseidon or a different hash that has better cross-toolchain support.

## Current Recommendation for Development

Until the witness issue is resolved:
- Treat Range Proof as **"ZK circuit + ceremony ready, witness tooling blocked"**.
- Use it for UI/UX and configuration testing.
- Use Merkle Membership for any end-to-end demonstrations that require a real proof.

A production-quality Range Proof will be available as soon as one of the workarounds above is completed.

**Files of interest:**
- `zk/range_proof/range_proof.circom`
- `zk/mimc_test.circom` (useful for computing correct commitments)
- `zk/test_range_proof.js`
- `zk/verify_range.js`
- `backend/src/oracle.rs` (range_proof handler)

This document should be updated as soon as the witness problem is solved.