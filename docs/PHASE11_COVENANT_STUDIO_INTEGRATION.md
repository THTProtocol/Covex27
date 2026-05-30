# PHASE 11 — Covenant Studio ↔ Covex Terminal Full Bidirectional Integration

**Status:** Planned (Post Phase 10)  
**Target:** Q3 2026

## Goal

Make Covenant Studio and the Covex Terminal feel like two sides of the same coin. A creator should be able to move fluidly between "serious engineering configuration" and "beautiful visual design" without friction, data loss, or manual copy-pasting.

## Core Principles

- **Terminal** remains the neutral, powerful, honest engineering surface.
- **Studio** remains the creative, visual, delightful experience surface.
- Data and configuration must flow in both directions cleanly.
- The user never feels like they are using "two different products".

## Key Deliverables

### 1. Deep Linking & Context Handoff
- From Terminal: "Design Beautiful UI in Studio" button
  - Opens Covenant Studio in a new tab
  - Pre-loads the current circuit type, fee structure, oracle requirements, payout model, and any custom parameters
- From Studio: "Configure Advanced Resolution & Oracles" button
  - Opens Covex Terminal (or embedded view) with the current visual design context preserved
  - User can tweak ZK circuit choice, oracle selection, fee splits, etc., then return to Studio

### 2. Shared Configuration Protocol
- Define a clean JSON schema (`covenant-config-v1.json`) that both tools understand.
- Both tools must be able to import/export this format losslessly.
- Include versioning so future changes are backward compatible.

### 3. Live Resolution Preview in Studio
- Inside Covenant Studio, the creator must be able to simulate:
  - "If outcome = 0 (claimant wins), what exactly happens to the funds?"
  - "If outcome = 1 and time expires, what happens?"
  - Visual payout breakdown with the exact parameters configured in Terminal
- This preview must use the **real** resolution logic that will be deployed.

### 4. Unified Deployment Wizard (Optional but Recommended)
- A flow that feels like one product:
  1. Choose or design template in Studio (visual)
  2. Configure resolution, fees, ZK, oracles in Terminal (engineering)
  3. Review + Deploy (unified final step)

### 5. Template & Asset Synchronization
- Templates created in Studio should be savable and reusable directly from Terminal.
- Custom UI bundles should be versioned and selectable in Terminal.

## Technical Work

- Define the shared `covenant-config` schema (in a new `shared/` or `packages/` directory)
- Add deep-link + state passing mechanisms (URL params + localStorage + optional backend sync for logged-in users)
- Build the "Resolution Simulator" component that can be embedded in Studio
- Update both codebases to support the new handoff flows
- Add comprehensive E2E tests for the full create → configure → design → deploy flow

## Success Metrics

- A new creator can go from "I want to run a chess match" to "I have a beautiful, correctly configured, deployed covenant" in under 12 minutes with almost no manual configuration.
- Power users report that they can still do advanced custom work without the integration getting in the way.
- Zero data loss when moving between the two tools.

## Honest Limitations (Must Be Documented)

- This phase is **purely about UX and integration**. It does not add new on-chain capabilities or new ZK circuits.
- The actual power of what can be expressed is still limited by silverc v0.1.0 (and whatever version exists at the time).
- Beautiful UIs do not magically make weak on-chain logic stronger.

## Risks & Mitigations

- Risk: Blurring the "engineering vs creative" boundary too much.
  - Mitigation: Keep Terminal visually distinct and "serious". Never hide advanced options.
- Risk: Increased complexity in both codebases.
  - Mitigation: Treat the shared config schema as the single source of truth. Minimize duplication.

---

**This phase is the highest-leverage UX improvement possible after the core 10-phase foundation is solid.**

Once completed, the platform will finally feel like "the best possible version" for the majority of creators who are not hardcore engineers.