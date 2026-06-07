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

## Phase 3 Continuation (this cycle): On-Chain Prep + SilverScript Sig Consumption + More Circuits

**Status:** Prep work + stubs in place. Oracle now pluggable and extended for "onchain_sig_verify" + "decentralized_liveness". New Kaspa primitives (script_constraint, relative_timelock, utxo_ownership) ready for covenant authors to reference in SilverScript (aa20-aa23 opcodes for script match + timelock + ownership checks + oracle pubkey binding).

### Concrete On-Chain Prep Items Delivered
- **Oracle sig as witness**: All oracle outcomes produce `signature` + `message` ("covex-oracle:<covenant_id>:<outcome>:<ts>") usable directly in covenant unlock script (OpCheckSig once silverc/Kaspa exposes full Schnorr or equivalent). compute-payout in main.rs already builds `unlock_witness` text for users.
- **SilverScript / opcode mapping notes** (for Covenant Studio + Terminal authors):
  - aa20/aa21/aa22/aa23: script constraints, timelocks (DAA relative/absolute via selected-parent), UTXO ownership (schnorr pubkey match on input), pot split math.
  - Oracle pubkey binding: embed oracle pubkey hash in covenant script; require matching sig on outcome for resolution (hybrid today; stronger when OpCheckSig + multi-sig available).
  - VRF + on-chain: vrf_dice_roll / vrf_random proofs + oracle sig for fair deal/shuffle; later on-chain VRF verify if BLS12-381 or native added.
- **onchain_sig_verify circuit (Phase 3 stub)**: New minimal circuit + verifier for "prove I have a valid oracle (or multi) sig without revealing priv". Starts oracle-attested/hybrid; graduates when on-chain verify lands. (See zk/ for stub if added; registry entry "onchain_sig_verify".)
- **decentralized_liveness**: Stub oracle_liveness_stub.js + wiring for multi-oracle health (checkLiveness). Future: 5+ operators, threshold, staking/slashing in oracle net.
- **Evolution enforcement in metadata**: Every covenant can store `reality` ("full-zk" | "hybrid" | "oracle-attested") + `has_artifacts` + `circuit_category`. Explorer/Terminal respect it. No silent trust escalation.

### Next On-Chain Milestones (when silverc/Kaspa scripting allows)
1. Covenant scripts that directly verify oracle Schnorr sig on (outcome) as unlock condition (no more pure trusted oracle for payout).
2. Simple property proofs (range, merkle root match, timelock DAA) partially in-script (hybrid on-chain ZK elements).
3. Full Groth16/RISC0 verifier precompile or opcode (longer term) for high-value circuits (e.g. private transfer, collateral liquidation with on-chain LTV check).
4. Selected-parent chain + DAA timelock enforcement directly in script for turn timers without oracle for timeout.

See also: docs/MAINNET.md, deploy/ scripts, Covenant-Studio for visual SilverScript authoring, and the pluggable registry for adding "onchain_*" variants.

**Honest note**: Today the heavy lift (ZK verify or game engine) is oracle-side; on-chain primarily checks "did the (disclosed) oracle sign this outcome for this covenant?" + basic script constraints. This is already powerful for real-stake games/DeFi on Kaspa and matches the pragmatic path in the vision doc.

This doc updated during aggressive "continue" execution to make COVEX ultimate.

---

This is a living document and will be updated as real progress is made.
