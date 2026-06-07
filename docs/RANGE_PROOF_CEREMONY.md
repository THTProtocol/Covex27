# Range Proof Ceremony — Honest Status (Phase 5)

**Circuit:** `zk/range_proof/range_proof.circom` (RangeProof 64-bit, MiMC7 commitment)  
**Constraints:** ~364  
**Verifier:** `zk/verify_range.js` + `zk/range_proof/range_proof_vkey.json`

## What exists

| Artifact | Path | Status |
|----------|------|--------|
| Source | `range_proof.circom` | Production-quality |
| R1CS + WASM | `range_proof/output/` | Compiled |
| Phase-2 zkey | `range_proof/range_proof_final.zkey` | Dev ceremony (2-step) |
| Verification key | `range_proof/range_proof_vkey.json` | Exported, committed |
| Prove script | `zk/prove_range_proof.js` | MiMC7 commitment + Groth16 |
| Oracle wiring | `backend/src/oracle.rs` | Live on hightable.pro |

## Ceremony honesty

This is a **developer-only** Powers of Tau + phase-2 setup:

1. `snarkjs powersoftau new` + single contributor
2. `snarkjs groth16 setup` on `range_proof.r1cs`

It is **not** a multi-party production ceremony. For mainnet-grade trust, run an MPC phase-2 with independent contributors and publish the transcript.

## Public signals (snarkjs order)

```
[valid, commitment, min, max]
```

- `valid` = 1 when value ∈ [min, max]
- `commitment` = MiMC7(value)

## Quick test

```bash
cd zk
node prove_range_proof.js
node verify_range.js range_proof/range_proof_proof.json
```

## Limitations

- MiMC7 commitment (not SHA256/Blake2b)
- 64-bit range only
- Dev PTAU — replace before high-value production use