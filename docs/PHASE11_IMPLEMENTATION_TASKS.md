# Phase 11 Implementation Tasks
## Covenant Studio ↔ Covex Terminal Full Bidirectional Integration

**Priority:** P0  
**Target Completion:** End of Q3 2026  
**Owner:** TBD (Frontend + Full-stack engineer recommended)

---

## Epic: Shared Configuration Protocol

### Task 11.1 — Finalize & Publish Shared Config Spec
- [x] JSON Schema v1.0 created
- [x] TypeScript + Zod reference implementation created
- [ ] Review + lock the schema with both teams
- [ ] Publish to a public location (e.g. GitHub + npm package later)

**Owner:** Architecture  
**Estimate:** 1 week

### Task 11.2 — Create `@covex/covenant-config` NPM Package (Stub)
- Create monorepo package or standalone package
- Export Zod schema + validation helpers
- Publish initial 1.0.0 version (even if small)

**Owner:** Backend / DevRel  
**Estimate:** 1.5 weeks

---

## Epic: Terminal Changes

### Task 11.3 — Add "Design in Covenant Studio" Button
- Location: Covenant configuration screen in Terminal
- Behavior: Export current `CovenantConfigV1`, open Studio deep link with config in URL or POST
- Must preserve all resolution settings

**Owner:** Frontend (Terminal)  
**Estimate:** 1 week

### Task 11.4 — Resolution Simulator Component
- Reusable React component that takes `resolution` object
- Shows payout breakdown for different outcomes
- Shows oracle vs ZK path clearly
- Used in both Terminal and embeddable in Studio

**Owner:** Frontend  
**Estimate:** 2 weeks

### Task 11.5 — Deep Link + State Import in Terminal
- Support loading full config from URL param or POST
- Merge strategy when partial config is received

**Owner:** Frontend  
**Estimate:** 1 week

### Task 11.6 — Export Button + "Send to Studio" Flow
- One-click export of current config as JSON
- Copy link with compressed config (base64 or short ID + backend storage)

**Owner:** Frontend + Backend  
**Estimate:** 1.5 weeks

---

## Epic: Covenant Studio Changes

### Task 11.7 — Consume Shared Config on Load
- Accept config via URL param or postMessage
- Pre-populate `covenant` + `resolution` sections
- Lock resolution fields by default (show "Advanced" button)

**Owner:** Studio Team  
**Estimate:** 2 weeks

### Task 11.8 — "Configure in Terminal" Button
- Export current visual state + send `ui` + `covenant` data to Terminal
- Open Terminal in new tab or embedded pane

**Owner:** Studio Team  
**Estimate:** 1.5 weeks

### Task 11.9 — Live Resolution Preview Inside Studio
- Embed or iframe the Resolution Simulator component
- Update in real time as user changes template parameters that affect outcomes

**Owner:** Studio + Frontend  
**Estimate:** 2 weeks

### Task 11.10 — UI Section Only Mutation Guard
- Studio must never mutate `resolution` unless user explicitly clicks "Advanced Mode"
- All changes outside `ui` must be confirmed with warning

**Owner:** Studio Team  
**Estimate:** 1 week

---

## Epic: Backend / Infrastructure

### Task 11.11 — Config Storage + Short Links (Optional but Recommended)
- Backend endpoint to store full configs temporarily (24h expiry)
- Return short ID that can be used in deep links
- Used for very large configs that don't fit in URL

**Owner:** Backend  
**Estimate:** 1.5 weeks

### Task 11.12 — Validation Endpoint
- `POST /api/config/validate`
- Returns detailed errors using the canonical schema
- Used by both Terminal and Studio before handoff

**Owner:** Backend  
**Estimate:** 1 week

---

## Epic: Testing & Documentation

### Task 11.13 — End-to-End Roundtrip Test Suite
- Automated tests that:
  1. Create config in Terminal
  2. Send to Studio
  3. Modify UI only
  4. Send back to Terminal
  5. Assert no data loss in `resolution` section

**Owner:** QA + Frontend  
**Estimate:** 2 weeks

### Task 11.14 — Integration Documentation
- Update `BUILDING_ON_COVEX.md`
- Add "Integrating with Covenant Studio" section
- Video walkthrough of the handoff flow

**Owner:** DevRel  
**Estimate:** 1.5 weeks

### Task 11.15 — Developer Preview / Beta
- Deploy integration to a staging environment
- Invite 10–15 power users for feedback
- Iterate on UX before full launch

**Owner:** Product  
**Estimate:** 3 weeks (overlapping with other tasks)

---

## Total Estimated Effort (Phase 11)

- **Core Engineering:** 12–14 weeks
- **Design + UX:** 4–5 weeks
- **Testing + Docs:** 4–5 weeks
- **With 3–4 dedicated engineers + 1 designer:** ~3–3.5 calendar months

---

## Suggested Sprint Breakdown (3-Month Plan)

**Sprint 1 (Weeks 1–4):** Schema finalization + package + basic import/export in both tools  
**Sprint 2 (Weeks 5–8):** Deep linking + Resolution Simulator + one-way handoff  
**Sprint 3 (Weeks 9–12):** Roundtrip + live preview + validation + beta testing

---

## Definition of Done for Phase 11

- A user can start in Terminal, hand off to Studio, design a UI, hand back, and deploy — with zero manual re-entry of resolution settings.
- All known fields survive multiple roundtrips.
- Both tools show clear, consistent language about what is being configured where.

---

**This task list should be imported into Linear / Jira / GitHub Projects as individual issues.**