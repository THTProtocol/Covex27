# Covex — Comprehensive Post-Phase-18 Execution Plan to 100% Production Grade

**Date:** 2026-05-30  
**Current Overall Maturity:** ~82-85% toward "everything fully working and delightful"

This document is the single source of truth for what still needs to be done to turn Covex into a truly complete, production-grade, "billion-dollar project" feeling platform.

It is written after all 18 original phases + the major Hermes integration & polish run.

---

## 1. Executive Summary of Remaining Gaps

### What is Genuinely Excellent Today
- Core Terminal experience and SilverScript generation
- Merkle Membership ZK (fully working end-to-end)
- Advanced Primitives Composer + Multi-Oracle UI
- Range Proof (full Groth16 ceremony complete — only witness tooling blocked)
- Phase 11 shared config protocol (excellent foundation)
- Backend robustness and indexer
- Dark cyberpunk design quality
- Radical honesty in documentation and UI

### What is Still Not 100% Working (Ranked by User Impact)

| Rank | Area | Current State | Blocker Type | User Impact |
|------|------|---------------|--------------|-------------|
| 1 | Range Proof | Ceremony done, oracle wired, but no working end-to-end proofs | Toolchain (MiMC7 witness) | High — Phase 12 promise not fully delivered |
| 2 | Marketplace | UI + publish endpoint exist, but no real payments, ratings, or discovery | Scope + backend depth | High — Creators cannot monetize |
| 3 | Multi-Oracle | UI excellent, backend only does length checks | Cryptographic implementation | Medium-High — Marketing vs reality gap |
| 4 | Analytics | Basic real data, but very shallow | Data model + queries | Medium |
| 5 | Governance | Static shell | Scope | Medium |
| 6 | Template Library | 9 good templates (target was 15-20+) | Content | Medium |
| 7 | SDK | Partially real, many methods still mock | Completeness | Medium (for third parties) |
| 8 | Mainnet | Scripts + warnings ready, but not live with real treasury | Ops + funding | High (for credibility) |
| 9 | Hybrid On-Chain | Still purely aspirational | External (silverc) | Low (correctly labeled) |

---

## 2. Detailed Phased Execution Plan (What Needs to Be Done)

### Phase A — Critical Technical Completion (4-6 weeks)

**Goal:** Eliminate the biggest "not actually working" items.

**A1. Range Proof — Make It Actually Work End-to-End (Highest Priority)**
- Fix or fully workaround the MiMC7 witness generation issue.
  - Preferred path: Pure-JS MiMC7 pre-computation before calling the range_proof wasm.
  - Alternative: Rebuild with consistent older circom toolchain.
- Once working:
  - Generate 5-10 real test proofs for different ranges.
  - Verify them successfully through the live oracle.
  - Create 2-3 real example covenants that use Range Proof (including one in the template library).
- Update `test_range_proof.js` and all documentation.
- **Success Metric:** A normal user can generate a valid Range Proof, submit it, and get a real oracle signature.

**A2. Real Multi-Oracle Cryptographic Verification**
- Replace the current "any 64-char hex is valid" logic in `backend/src/oracle.rs` with actual signature verification against the public keys provided in the multi-oracle config.
- Support the `threshold` and `weight` fields properly.
- Add clear, user-friendly error messages when individual signatures fail.
- Update the `MultiOracleConfigurator` UI if any new requirements appear.

**A3. Marketplace — Make It Real (Minimum Viable)**
- Implement real storage + update logic for published templates.
- Add basic search, filtering, and "downloads" tracking.
- Add a simple rating system (even 1-5 stars with average).
- Connect the "Use Template" flow from Marketplace directly into the Terminal with full config pre-loading.
- Add a small payment simulation or real KAS flow for publishing (even if just a "pay 10 KAS to platform" button that records the intent).

### Phase B — Feature Completeness & Depth (6-8 weeks)

**B1. Expand Template Library to 15-20+ High-Quality Templates**
Must-have missing templates:
- Insurance / Risk Pool
- DAO Treasury (with multi-sig + time locks + quadratic elements)
- Multi-outcome Prediction Market
- Tournament / Bracket system
- Revenue Share with vesting schedule
- Conditional Grant with ZK proof of milestone completion
- 2-3 more coordination or game templates

Every new template should showcase at least one advanced primitive or multi-oracle setup.

**B2. Analytics Depth**
- Add per-covenant detailed views (resolution history, value over time, participant engagement if available).
- Historical charts (TVL trend, resolution success rate).
- Platform-wide (anonymized) public analytics.
- Export functionality.

**B3. Governance Surface**
- Allow users to create real proposals (stored in DB).
- Functional voting that persists.
- Basic results display.
- (Optional) Simple on-chain signaling using existing signer infrastructure.

**B4. SDK Completeness**
- Make every major method in `CovexClient.ts` call real endpoints.
- Add proper error handling and TypeScript types.
- Publish to npm (even as 0.x).
- Create 3-4 high-quality example projects.

### Phase C — Mainnet Hardening & Production Readiness (Parallel, 4-6 weeks)

**C1. Actual Mainnet Cutover**
- Execute `switch-to-mainnet.sh` with a properly secured real treasury address and production `COVEX_ORACLE_KEY`.
- Run the full `covex-launch-verify.sh` against the live mainnet instance.
- Set up proper monitoring and alerting for the mainnet deployment.

**C2. Security, Reliability & Legal**
- Add rate limiting to oracle and marketplace endpoints.
- Third-party security review of the oracle signing logic and payment verifier.
- Professional legal disclaimers and risk templates for different covenant categories.

**C3. Operational Excellence**
- Comprehensive runbooks for incident response.
- Automated health checks that run the full validation suite regularly.
- Clear communication plan for the mainnet launch.

### Phase D — Ecosystem & Long-term Evolution (Ongoing)

**D1. Real Monetization & Third-Party Growth**
- Actual KAS payments for publishing templates + revenue split.
- Review/quality process for community templates.
- "Built with Covex" showcase.

**D2. Hybrid On-Chain Verification**
- The moment silverc supports usable `OpCheckSig` or richer control flow, begin emitting real hybrid covenants.
- First prototypes should combine oracle signature + simple on-chain checks.

**D3. Advanced ZK Expansion**
- Once Range Proof is working, add Age Verification and a light Verifiable Compute example.
- Explore one more game-specific circuit if it provides clear value.

---

## 3. Prioritized Task List (Next 90 Days)

### Must Do in First 30 Days
1. Fix Range Proof witness generation (or implement clean workaround).
2. Implement real Schnorr verification for multi-oracle.
3. Make Marketplace at least minimally functional (real publish + basic discovery).
4. Add 4-6 high-value new templates.
5. Improve Analytics with per-covenant history and charts.

### Should Do in Days 31-60
6. Make Governance functional (real proposals + voting).
7. Complete the SDK (all methods real + published to npm).
8. Execute clean mainnet cutover.
9. Major UI/UX polish pass on all new pages.

### Nice to Have in Days 61-90
10. First hybrid on-chain verification prototypes.
11. Real payments in Marketplace.
12. Advanced ZK circuits (Age Verification, etc.).

---

## 4. Success Criteria for "100% Fully Working"

- A new creator can go from idea → deployed, beautiful, correctly configured covenant (with advanced features) in under 15 minutes.
- All circuits advertised as production have real, working end-to-end proofs.
- The Marketplace has real published templates with actual usage.
- High-value covenants can use multi-oracle with proper cryptographic verification.
- Mainnet is live with real economic activity.
- Third parties can build useful things on the public SDK without reverse engineering.

---

## 5. Honest Constraints (What Cannot Be 100% Today)

- True trustless on-chain ZK for complex logic (depends on silverc + Kaspa scripting progress).
- Perfect Range Proof until the witness toolchain issue is resolved.
- Full decentralized governance or slashing until there is meaningful economics.

Document these clearly and never hide them.

---

This plan, combined with the existing phase documents, should allow any competent team to take Covex from its current strong foundation to a truly complete, production-grade platform.

The foundation is excellent. Finishing the remaining work with the same level of quality and honesty will make Covex genuinely special in the Kaspa ecosystem.

**Next immediate action recommended:** Start with A1 (Range Proof witness) and A2 (real multi-oracle verification) in parallel. These two items unblock the most credibility.