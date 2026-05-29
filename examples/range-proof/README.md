# Range Proof (Phase 9 Foundation) — Covex Example

**Status:** Circuit foundation complete. Full proving pipeline + oracle verification = next iteration after ceremony.

This example demonstrates the **second real ZK circuit** added in Phase 9.

## What the Circuit Actually Proves (Honest Description)

You know a secret `value` such that:
- `MiMC7(value) == public commitment`  (you know the preimage, value is hidden)
- `value >= public min`
- `value <= public max`

The proof reveals **nothing** about the actual value — only that it lies inside the declared range and matches the commitment.

**Realistic use cases (post full integration):**
- Private collateral checks ("my hidden balance is between 100–500 KAS")
- Qualification proofs without revealing exact age / score / TVL
- Range-based access control for covenants

## Current Honest State (End of Phase 9)

| Item                        | Status                          | Notes |
|-----------------------------|---------------------------------|-------|
| Circuit source (.circom)    | ✅ Complete & reviewed         | `zk/range_proof/range_proof.circom` |
| Compilable in proper env    | ✅ (with real circom 2.x)      | The npm circom 0.5 in this repo is legacy/broken for new builds; use production circom binary |
| Witness calculation         | Documented                     | See `zk/prove_range_proof.js` skeleton |
| Groth16 proving key (zkey)  | Not generated                  | Requires ptau + phase-2 (pot10_final.ptau is present for small circuits) |
| vkey + standalone verifier  | Not generated                  | Target: `zk/verify_range.js` |
| Oracle endpoint support     | Stubbed (clear error)          | Returns explicit "foundation only" message. See backend/src/oracle.rs:verify_range_proof_async |
| End-to-end example          | This doc + placeholder script  | Ready for when artifacts land |

**This is NOT yet usable for real value on-chain.** It is the solid technical foundation promised in Phase 9.

## Files

- `README.md` — This file (radical honesty)
- `submit-to-oracle.sh` — Placeholder (will work once oracle supports the circuit fully)
- `notes.md` — How the eventual unlock flow would look

## How to Compile & Generate Artifacts (Production Steps)

In an environment with a working `circom` v2 binary (Rust implementation):

```bash
cd zk/

# 1. Compile
circom range_proof/range_proof.circom --r1cs --wasm --sym -o range_proof/output

# 2. (Optional but recommended) Export r1cs info
# snarkjs r1cs info range_proof/output/range_proof.r1cs

# 3. Generate witness (example values)
# node range_proof/output/range_proof_js/generate_witness.js range_proof/output/range_proof_js/range_proof.wasm input.json witness.wtns

# 4. Full setup + prove (heavy — use pot10_final.ptau or contribute to ceremony)
# snarkjs groth16 setup ... 
# snarkjs groth16 prove range_proof_final.zkey ...

# 5. Once you have range_proof_final.zkey + range_proof_vkey.json, wire them into a verify_range.js and the oracle.
```

See also: `zk/prove_range_proof.js` (the runnable skeleton with exact expected publicSignals layout).

## Next Steps After Phase 9

- Generate real proving artifacts in a clean prod build environment.
- Implement `zk/verify_range.js` (modeled exactly on `zk/verify.js`).
- Extend oracle handler to actually call snarkjs for range_proof.
- Add a first real usage (e.g. a covenant that uses range_proof for a private TVL gate).
- Update Covex Terminal UI to support submitting range proofs (Section C½ pattern already exists).

## References

- Circuit: [zk/range_proof/range_proof.circom](/home/kasparov/Covex27/zk/range_proof/range_proof.circom)
- Oracle stub: [backend/src/oracle.rs](/home/kasparov/Covex27/backend/src/oracle.rs) (search "range_proof")
- Roadmap: [docs/NEXT_ZK_CIRCUITS.md](/home/kasparov/Covex27/docs/NEXT_ZK_CIRCUITS.md)
- Phase 9 Report: [PHASE9_COMPLETION.md](/home/kasparov/Covex27/PHASE9_COMPLETION.md)

---

**Phase 9 delivered the foundation. The next concrete artifact (working zkey + live oracle path) is the immediate post-launch task.**

*Built as part of the ruthless 10-phase plan for a credible, honest Covex on Kaspa.*