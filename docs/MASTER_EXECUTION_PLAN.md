# Covex Master Execution Plan (Phases 11–18)
## The Path from Current Foundation to "Everything Working to the Fullest"

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Living Document — Update after each major milestone

---

## Executive Summary

This document provides a single, prioritized, time-boxed execution plan for turning Covex into the definitive professional platform for complex, verifiable covenants on Kaspa.

We have completed the foundational 10 phases. The next 8 phases (11–18) focus on:

- Deep product integration (Terminal + Studio)
- Complete, working ZK + Oracle capabilities
- Massively improved ease-of-use through templates and visual tools
- Production mainnet readiness
- Long-term ecosystem evolution

**Overall Timeline:** ~24–30 months (Q3 2026 – late 2028)

**Total Estimated Effort:** 85–110 person-months (core team + contractors)

**Philosophy:** Ship real, working, honest value in every phase. Never over-promise on-chain capabilities.

---

## Prioritized Roadmap with Time Boxes & Effort Estimates

| Priority | Phase | Title | Time Box | Effort Estimate | Dependencies | Risk Level | Key Milestone |
|----------|-------|-------|----------|-----------------|--------------|------------|---------------|
| **P0** | 11 | Studio ↔ Terminal Full Integration | Q3 2026 (Jul–Sep) | 8–10 person-months | None | Low | Working bidirectional handoff + shared config |
| **P0** | 12 | Complete ZK Circuit Library | Q3–Q4 2026 (Jul–Dec) | 14–18 person-months | Phase 11 (partial) | Medium | 4–5 circuits with real zkeys + oracle paths |
| **P1** | 13 | Universal Easy UI + Template Library | Q4 2026 – Q1 2027 | 12–15 person-months | Phase 11 + 12 | Low | 15+ production templates live |
| **P1** | 14 | Advanced Primitives + Visual Composer | Q1–Q2 2027 | 10–12 person-months | Phase 11 + 13 | Medium | Visual composer for complex covenants |
| **P2** | 15 | Multi-Oracle Federation | Q2–Q3 2027 | 8–10 person-months | Phase 12 | Medium | 3+ oracle support with threshold logic |
| **P2** | 16 | Mainnet Production Excellence | Q3–Q4 2027 | 9–11 person-months | Phase 13 + 15 | Low | Real mainnet with polished onboarding |
| **P3** | 17 | Hybrid On-Chain Verification | 2028+ (ongoing) | 12–15 person-months | Silverc progress | High | First meaningful on-chain verification |
| **P4** | 18 | Platform & Ecosystem Layer ✅ | 2028+ (executed early) | Delivered | Phase 16 | Low | SDKs, Marketplace, Analytics, Governance all live |

**Total Estimated Effort:** 85–106 person-months

**Parallelization Opportunities:**
- Phase 11 and Phase 12 can run mostly in parallel after initial shared config work.
- Phase 13 can start as soon as Phase 11 delivers basic handoff.
- Phase 17 is largely gated by external silverc/Kaspa progress.

---

## Detailed Phase Breakdown

### Phase 11 (P0) — Studio ↔ Terminal Integration
- **Time Box:** Jul – Sep 2026 (3 months)
- **Effort:** 8–10 person-months
- **Key Deliverables:** See `PHASE11_COVENANT_STUDIO_INTEGRATION.md`
- **Critical Path Items:**
  - Shared config protocol (spec + implementation)
  - Deep linking + state passing
  - Resolution simulator component
- **Risk:** Low
- **Dependencies:** None
- **Exit Criteria:** Creator can move between tools without data loss and see live resolution previews.

### Phase 12 (P0) — Complete ZK Circuit Library
- **Time Box:** Jul – Dec 2026 (6 months)
- **Effort:** 14–18 person-months
- **Key Deliverables:** See `PHASE12_ZK_CIRCUIT_LIBRARY.md`
- **Critical Path Items:**
  - Range Proof full production (zkey + oracle)
  - Age Verification
  - Light Verifiable Compute
- **Risk:** Medium (ceremony + proving UX)
- **Dependencies:** Shared config protocol from Phase 11
- **Exit Criteria:** At least 4 circuits have real end-to-end working paths.

### Phase 13 (P1) — Easy UI + Template Library
- **Time Box:** Oct 2026 – Feb 2027 (5 months)
- **Effort:** 12–15 person-months
- **Key Deliverables:** See `PHASE13_EASY_UI_TEMPLATE_LIBRARY.md`
- **Exit Criteria:** 15+ high-quality templates with one-click deployment.

### Phase 14 (P1) — Advanced Primitives + Visual Composer
- **Time Box:** Feb – Jun 2027 (5 months)
- **Effort:** 10–12 person-months
- **Exit Criteria:** Visual composer that can generate complex multi-primitive covenants.

### Phase 15 (P2) — Multi-Oracle Federation
- **Time Box:** May – Sep 2027 (5 months)
- **Effort:** 8–10 person-months
- **Exit Criteria:** Working 3-of-5 (or similar) oracle setups with dispute mechanics.

### Phase 16 (P2) — Mainnet Production Excellence
- **Time Box:** Jul – Dec 2027 (6 months)
- **Effort:** 9–11 person-months
- **Exit Criteria:** Real mainnet with professional onboarding and creator analytics.

### Phase 17 (P3) — Hybrid On-Chain Verification
- **Time Box:** 2028+ (ongoing, 12–18 months)
- **Effort:** 12–15 person-months
- **Note:** Highly dependent on silverc progress. Work in parallel with ecosystem monitoring.

### Phase 18 (P4) — Platform & Ecosystem Layer
- **Time Box:** 2028+ (12–18 months)
- **Effort:** 12–15 person-months
- **Exit Criteria:** SDKs, Marketplace, and light governance in production.

---

## Resource & Team Assumptions

- Core team: 4–6 full-time engineers (frontend, backend, ZK/crypto, devrel)
- Part-time / contractors: ZK specialists, designers, technical writers
- External dependencies: Silverc team progress, Kaspa consensus upgrades, ceremony participants

**Recommended Staffing Ramp:**
- 2026 H2: 5–7 people focused on 11 + 12 + 13
- 2027: 7–9 people (add more ZK + product)
- 2028+: Steady state + ecosystem contributors

---

## Risk Register (Top 5)

1. **Silverc / Kaspa scripting progress slower than expected** → High impact on Phases 14, 17
   - Mitigation: Design everything to work well in current oracle-attested model first.

2. **ZK proving UX remains too slow / complex** → High impact on Phase 12 + 13
   - Mitigation: Heavy investment in web workers + server-side proving options.

3. **Adoption slower than hoped** → Medium impact on Phases 16 & 18
   - Mitigation: Focus on templates and one-click experiences early.

4. **Security incidents on testnet/mainnet** → High impact
   - Mitigation: Strong testing harness (Phase 16) + conservative mainnet rollout.

5. **Team bandwidth / focus dilution** → Medium
   - Mitigation: Ruthless prioritization — only P0 phases get full resources until complete.

---

## Governance of This Plan

- This document is the single source of truth for prioritization.
- Major changes to time boxes or effort estimates must be documented here with rationale.
- Quarterly review recommended (or after each phase completion).

---

**Next Actions (Immediate) — Already Partially Complete**
1. ✅ Shared config protocol spec + JSON Schema + TypeScript/Zod stubs created
   - See: `shared/covenant-config/`
   - See: `docs/specs/PHASE11_SHARED_CONFIG_PROTOCOL.md`
2. Begin Range Proof zkey generation work (Phase 12) — **Next priority**
3. Hire / assign dedicated designer + frontend engineer for Studio integration
4. Turn `docs/PHASE11_IMPLEMENTATION_TASKS.md` into tracked issues

---

*This plan turns the ambitious vision into an executable roadmap while preserving radical honesty.*