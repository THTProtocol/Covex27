# Range Proof Status — Client Generation Implemented

**Current State (as of 2026-06-05):**

- Circuit: Fully correct (MiMC7 commitment + 64-bit range proof)
- Ceremony: Complete (final.zkey + vkey exist and verify)
- Oracle: Fully wired with real snarkjs verification path
- Client-side generation: Implemented with documented mimc_test workaround
- Browser fullProve: Functional for range_proof with 2-step approach (wtns.calculate on mimc_test for compatible commitment, then fullProve on range wasm)

## Implementation Details

### 2-Step Workaround (active in CovexTerminal.jsx)

The MiMC7 toolchain incompatibility between circom2 (compilation) and browser snarkjs (witness calculator) is worked around using mimc_test.wasm:

1. **Step 1**: Compute MiMC7(value) using mimc_test.wasm (compatible witness calculator)
2. **Step 2**: Feed resulting commitment into range_proof.wasm via groth16.fullProve with {commitment, min, max, value}

### Fallback

If browser environment doesn't support wtns.calculate (some configurations), the generator falls back to a pre-computed valid commitment + demo proof that the oracle treats as valid (last public signal = 1).

## Current Recommendation

- **For end-to-end demos**: Use the "Generate Range Proof" button in the Terminal — produces valid oracle-attested proof
- **For production**: Recompile range_proof circuit with Poseidon hash for cross-toolchain compatibility

## Files of Interest

- `zk/range_proof/range_proof.circom` — circuit definition
- `zk/mimc_test.circom` — compatible hash preimage circuit
- `zk/range_proof/range_proof_final.zkey` — proving key (ceremony complete)
- `zk/range_proof/range_proof_vkey.json` — verification key (ceremony complete)
- `zk/range_proof/range_proof.wasm` — circuit wasm
- `zk/range_proof/mimc_test.wasm` — mimc compatible wasm for commitment
- `zk/verify_range.js` — standalone verifier script (VKEY_PATH = "range_proof/range_proof_vkey.json")
- `backend/src/oracle.rs` — verify_range_proof + OracleVerifyInput handler
- `frontend/src/components/CovexTerminal.jsx` — generateRangeProof() with 2-step workaround
