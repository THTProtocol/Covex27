# PHASE 17 — Hybrid On-Chain Verification (Silverc Evolution)

**Status:** Planned  
**Target:** 2028+

## Goal

As Kaspa scripting (silverc and consensus upgrades) improves, gradually move verification and resolution logic on-chain where it provides meaningful security or UX benefits — reducing reliance on the oracle over time.

## Current Reality (Phases 1–16)

- Most resolution logic lives off-chain.
- The oracle attests outcomes.
- On-chain covenants mostly enforce fees, ranges, and basic constraints.
- This is the pragmatic model given silverc v0.1.0 limitations.

## Phase 17 Direction

This phase is heavily dependent on external progress in the Kaspa ecosystem. We cannot control when richer scripting becomes available.

### Planned Workstreams

1. **Track & Exploit Silverc Improvements Aggressively**
   - Monitor every silverc release for new capabilities (better signature verification, richer control flow, new opcodes, etc.).
   - Immediately prototype hybrid patterns as soon as they become viable.

2. **Hybrid Verification Patterns (Oracle + On-Chain)**
   - Oracle still does heavy ZK verification off-chain.
   - Covenant on-chain verifies the oracle's signature (once `OpCheckSig` or equivalent is practical).
   - On-chain enforcement of simple constraints (ranges, time locks, basic multi-sig) becomes stronger.

3. **Selective On-Chain ZK Verification**
   - For the simplest circuits (e.g. basic membership or range checks), explore whether partial or full verification can move on-chain.
   - Start with "optimistic" models: assume oracle is honest, allow on-chain challenges with ZK fraud proofs if silverc supports them.

4. **Gradual Trust Surface Reduction**
   - High-value use cases (large escrows, insurance, prediction markets) get priority for hybrid models.
   - Lower-value or simple use cases may stay oracle-heavy for cost/UX reasons.

## Success Criteria

- At least one major covenant type has a meaningfully stronger on-chain component than was possible in 2026–2027.
- The oracle's role has evolved from "trusted for correctness" toward "trusted for liveness + dispute resolution" in at least some high-value flows.
- Clear documentation exists showing exactly how much trust has been moved on-chain vs what remains with oracles.

## Honest Assessment

This is the most uncertain phase in the entire roadmap because it depends on external technical progress in Kaspa.

We commit to:
- Being extremely aggressive about adopting improvements as soon as they are safe.
- Never over-promising timelines.
- Maintaining full honesty about what is still oracle-dependent.

---

**Phase 17 represents the long-term philosophical direction of Covex:** use off-chain power (ZK + oracles) today to deliver real utility, while continuously pushing verification on-chain as the base layer allows it. This is how we eventually deliver on the original vision of maximally trust-minimized covenants.