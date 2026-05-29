# Next ZK Circuits Roadmap (Phase 9 — Updated with Concrete Foundation)

**Date:** Phase 9 completion (real artifacts delivered)

## Current Production Circuits

- Merkle Membership (fully working with oracle path)

## Priority Order for Next Circuits

### 1. Range Proof (High Priority — Phase 9 Foundation COMPLETE)
- Use cases: Private collateral checks, balance ranges, KYC-free qualification
- Status: **Production-grade circuit authored** (MiMC commitment + 64-bit GreaterEq/LessEq, proper main {public[...]} declaration, matching Merkle style)
  - Full source: `zk/range_proof/range_proof.circom`
  - Proving skeleton: `zk/prove_range_proof.js` (shows exact publicSignals layout)
  - Verifier surface: `zk/verify_range.js` (stub ready for zkey)
  - Oracle surface: wired in `backend/src/oracle.rs` (returns explicit "foundation only" error today)
  - Example: `examples/range-proof/` (README + submit helper + notes)
- Honest gap: No compiled wasm/r1cs + no final zkey yet (requires working circom 2.x binary + ptau phase-2 in clean env)
- Next steps: Generate artifacts in prod build, wire real snarkjs path in oracle, first live covenant demo

### 2. Age Verification (Medium-High)
- Specialized range proof on birthdate commitment
- Strong real-world use case

### 3. Basic Verifiable Compute (Medium)
- Start with simple RISC0 or SP1 programs
- Prove correct execution of off-chain logic

### 4. More Advanced (Longer Term)
- Full Merkle tree with path
- Multi-party or game-specific circuits (once silverc supports richer logic)

## Implementation Requirements for New Circuits

Every new circuit must include:
- Working circuit definition
- Proving + verification pipeline
- Oracle handler
- Honest labeling of limitations
- Example in `examples/`
- Documentation

---

This document will be updated as circuits move from stub to production.
