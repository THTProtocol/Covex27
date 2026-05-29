# HERMES FINAL TRIPLE-CHECK PROMPT — Phases 1–10 Complete Audit (Covex27)

**Purpose:** Feed this (or a lightly edited version) to Hermes / deepseek-v4-pro / equivalent high-capability agent in maximum-yolo mode for a final, ruthless, evidence-driven audit of the entire Covex27 project before mainnet launch.

**Date created:** End of Phase 10 (after Range Proof foundation + launch verification script).

---

## Core Mission

You are performing the **final pre-launch triple-check** of Covex27 after all 10 phases have been executed.

Your job is **not** to plan or write more code. Your job is to:

1. **Read the actual files on disk** (do not trust summaries or previous reports).
2. **Run real commands** (cargo check, grep, ls, head, curl against localhost or hightable.pro, `./deploy/covex-launch-verify.sh`, etc.).
3. **Produce a brutally honest report** that answers: "Is Covex actually in a state where we can responsibly point serious builders and real capital at it on mainnet after the Toccata hard fork?"

---

## Mandatory Inputs You Must Examine

- Root README.md (especially the Phase 1–10 sections and Final State)
- PHASE9_COMPLETION.md and PHASE10_COMPLETION.md (the evidence-based versions written at the end)
- docs/FINAL_STATE_OF_COVEX.md
- deploy/covex-launch-verify.sh (run it)
- backend/src/oracle.rs (range_proof handling + merkle path)
- zk/range_proof/range_proof.circom + zk/prove_range_proof.js + zk/verify_range.js
- examples/range-proof/ (all three files)
- deploy/ directory (all scripts, especially switch-to-mainnet.sh, validate-production.sh, covex-status.sh)
- docs/ directory (UNLOCK_WITH_ORACLE_SIGNATURE.md, BUILDING_ON_COVEX.md, NEXT_ZK_CIRCUITS.md, etc.)
- Any .env.production or switch-to-mainnet.sh placeholders for MAINNET_TREASURY and COVEX_ORACLE_KEY

---

## Specific Questions You Must Answer With Evidence

For each area, cite **exact file paths + line numbers or command output**:

### A. Honesty & Labeling
- Are there any remaining places that over-claim "on-chain ZK enforcement", "trustless", "no oracle", or gambling language/images?
- Is the distinction between Merkle Membership (production) and Range Proof (foundation only, zkey pending) crystal clear everywhere a user or builder would look?

### B. Technical Correctness (Phase 1–3 + 9)
- Does `cargo check` in backend/ pass cleanly?
- Does the oracle handler correctly dispatch both `merkle_membership` and `range_proof` with appropriate honest errors?
- Does the Range Proof circuit contain a real hiding commitment + range constraints (not the old broken stub)?
- Can `node zk/prove_range_proof.js` be executed without crashing and does it document the expected publicSignals layout?

### C. Production & Operations (Phases 4–6)
- Do all critical deploy scripts exist, have shebangs, and are executable?
- Does `switch-to-mainnet.sh` have clear placeholders and instructions for the real mainnet treasury + oracle key?
- Does `./deploy/covex-launch-verify.sh` run and produce a sensible verdict structure (even if it fails because no backend is live in this environment)?

### D. Ecosystem & Developer Experience (Phases 7–8)
- Is BUILDING_ON_COVEX.md honest about current silverc limitations and the oracle-attested model?
- Are the examples/ directories (merkle + range) actually useful or just marketing?

### E. Phase 9–10 Deliverables
- Is the Range Proof foundation actually usable by a third party who has a working circom 2.x binary?
- Does the launch verification script meaningfully reduce risk for a real mainnet deployment?
- Are the final state and announcement docs accurate reflections of what is on disk today?

### F. Mainnet Readiness
- What is the single biggest remaining risk or manual step before someone can safely put real KAS into a Covex covenant on mainnet?
- Is the "automatic mainnet flip after Toccata" story actually supported by the scripts, or is it still aspirational?

---

## Output Format You Must Follow

Produce a single Markdown report with these exact sections:

1. Executive Verdict (one paragraph + traffic light: GREEN / AMBER / RED)
2. Critical Blockers (if any — with file:line evidence)
3. Honest Strengths (what is genuinely solid)
4. Remaining Gaps & Risks (ranked by severity)
5. Specific File/Line Fixes Recommended (if any)
6. Recommended Next Three Engineering Actions (post-launch or pre-launch)
7. Command Evidence Appendix (paste the actual output of the most important commands you ran)

Do **not** add optimistic language. Do **not** say "looks good" if you only read docs. You must have run commands and read source.

---

## Tone & Philosophy Reminder

Covex's entire brand is **radical honesty + pragmatic progress**. Any sugar-coating or "it will be fine" language in your report is a failure of the audit.

If the project is in excellent shape, say so with evidence.  
If it still has meaningful gaps, call them out clearly and without apology.

---

**End of prompt. Begin the audit.**