# On-Chain Evolution Path (Phase 9)

**Date:** Phase 9 completion (Range Proof foundation added)

## Current Reality (as of Phase 9 — Range Proof Foundation Delivered)

Covex covenants are primarily **oracle-attested**:

Phase 9 added the second real circuit (RangeProof) as a solid cryptographic foundation while the ecosystem waits for richer on-chain primitives.

- ZK proof generated and verified off-chain
- Oracle signs the outcome
- Covenant on-chain mainly validates outcome range + fee parameters
- Actual economic logic often still relies on the oracle signature being trusted for correctness

This is pragmatic and already useful for many real-world applications.

## Path Toward Stronger On-Chain Guarantees

As silverc and Kaspa scripting improve, the following progression becomes possible:

### Near Term (2026-2027)
- Oracle still does heavy ZK verification
- Covenant verifies the oracle's signature on-chain (using OpCheckSig once supported)
- This moves trust from "oracle is correct about the proof" to "oracle signed this outcome"

### Medium Term (2027-2028)
- More expressive silverc allows richer on-chain predicates
- Simple proofs (range, membership) can be partially verified on-chain
- Hybrid models where part of the proof is on-chain, part attested by oracle

### Long Term (2028+)
- As the base layer supports more complex verification, some high-value circuits can move to full on-chain ZK
- Oracle role reduces to liveness / dispute resolution rather than correctness

## Current Blockers

- silverc v0.1.0 has very limited expressiveness (no rich payout logic, limited signature verification)
- Kaspa scripting is still maturing for complex covenants
- Proving system integration with on-chain verification is non-trivial

Covex will evolve alongside these improvements while always remaining honest about the current trust model.

---

This is a living document and will be updated as real progress is made.
