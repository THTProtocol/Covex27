# PHASE 12 — Complete Production ZK Circuit Library

**Status:** Planned (Post Phase 10)  
**Target:** Q4 2026

## Goal

Every circuit type that Covex advertises or allows users to select must have a **real, working, end-to-end production path** (circuit → proving → oracle verification → usable signature).

No more "aspirational" circuits that only exist as stubs or marketing text.

## Current State (End of Phase 10)

- **Merkle Membership**: Fully production (circuit + zkey + oracle + examples + Terminal support)
- **Range Proof**: Cryptographic foundation complete (good circuit + prover skeleton + oracle stub). **Missing**: real zkey/vkey + full oracle wiring + deployed examples.
- All other circuits (Age Verification, Verifiable Compute, Chess v1 outcome, etc.): Design targets only.

## Target State After Phase 12

At minimum **5 circuits** must have 100% working paths:

1. **Merkle Membership** (already done — maintain & improve)
2. **Range Proof** (complete this one first)
3. **Age Verification**
4. **Light Verifiable Compute** (simple RISC0 or SP1 programs)
5. **One Domain-Specific Game Circuit** (e.g. improved Chess outcome or Poker hand verification)

## Detailed Requirements Per Circuit

For each circuit to be considered "production" it must have:

- Working circuit definition (circom 2.x, gnark, or RISC0/SP1)
- Reliable proving pipeline (CLI + ideally easy web worker / browser option)
- Full oracle integration (`/api/oracle/verify-and-sign` handler + correct signature format)
- At least one real, deployed example covenant on testnet-12 that people can actually use
- Clear, honest documentation including:
  - Proving time & resource requirements
  - Trust model (what the oracle sees vs what is hidden)
  - Limitations and known weaknesses
- Terminal support (selectable as a first-class option)
- Studio template that uses it

## Priority Order

1. **Range Proof** (highest impact — private collateral, qualification, etc.)
2. **Age Verification** (very strong real-world use case)
3. **Light Verifiable Compute** (opens the door to "prove I executed X correctly")
4. Game-specific circuit (increases credibility for the gaming vertical)

## Technical Work Items

- Proper Powers of Tau contribution or reuse for Range Proof (and future circuits)
- Production-grade zkey generation + verification key export
- `verify_range.js` + oracle wiring (currently a stub that returns an honest error)
- Easy proving UX (web worker + progress UI in Terminal/Studio)
- Example covenants + documentation for each new circuit
- Performance & cost documentation (proving time, proof size, verification cost)

## Success Criteria

- A user can select "Range Proof" in the Terminal, generate a real proof for a hidden value in a range, submit it, receive a valid oracle signature, and use that signature in a live covenant.
- All advertised circuits in the UI have working "Try it" examples that actually succeed end-to-end.

## Honest Limitations (Must Be Stated Everywhere)

- Even with 5 working circuits, the system is still primarily **oracle-attested**, not on-chain ZK verified.
- Proving times and resource requirements will vary significantly between circuits. Some will be practical in a browser, others may require server-side proving.
- Complex game outcome proofs (full chess game validity, poker hand ranking under zero knowledge, etc.) remain extremely difficult and may stay out of scope or require heavy optimization.

## Dependencies & Risks

- Access to a reliable environment with working circom 2.x + ceremony participation
- Continued progress in RISC0/SP1 + Kaspa ecosystem ZK tooling
- Honest communication if any circuit turns out to be much harder than expected

---

**Phase 12 is the technical heart of making "all ZK and oracles implemented with all possible combinations" a reality instead of a promise.**

Until this phase is complete, any claim of "full ZK support" remains marketing. After this phase, we can honestly say "here are the circuits that actually work today."