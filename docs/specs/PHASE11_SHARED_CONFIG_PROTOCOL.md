# Phase 11 Technical Specification: Shared Covenant Configuration Protocol

**Version:** 1.0  
**Status:** Draft for Implementation  
**Related Phase:** Phase 11 — Covenant Studio ↔ Covex Terminal Full Integration

---

## 1. Overview

This document defines the **Covenant Configuration Protocol v1** — the canonical data format that enables seamless bidirectional integration between:

- **Covex Terminal** (engineering configuration surface)
- **Covenant Studio** (visual design surface)

The goal is zero data loss, excellent DX, and the ability for either tool to be the "source of truth" at different stages of the workflow.

---

## 2. Core Design Principles

1. **Single Source of Truth** — One JSON document represents the complete covenant configuration.
2. **Lossless Roundtrips** — Going Terminal → Studio → Terminal must not lose data.
3. **Progressive Enhancement** — Unknown fields in `metadata` must be preserved.
4. **Versioned & Stable** — v1.0 is frozen for Phase 11. Future versions will be additive.
5. **Tool Agnostic** — The schema must be usable by third-party tools.

---

## 3. Schema Location

**Canonical JSON Schema:**
- `shared/covenant-config/covenant-config.schema.json`

**Reference TypeScript Implementation:**
- `shared/covenant-config/covenant-config.ts` (Zod + types + helpers)

---

## 4. Top-Level Structure

```json
{
  "version": "1.0",
  "covenant": { ... },
  "resolution": { ... },
  "ui": { ... },
  "metadata": { ... }
}
```

### 4.1 `version`
- Must be exactly `"1.0"` for this spec.
- Future versions will use `"1.1"`, `"2.0"`, etc.

### 4.2 `covenant` (Core Identity)
Contains stable identity and basic settings that rarely change after creation.

**Required Fields:**
- `id`: UUID v4
- `name`
- `creatorAddress`

**Important Fields:**
- `reusable`
- `allowTopups`

### 4.3 `resolution` (The Engineering Heart)
This is the most important section for Terminal users.

**Key Sub-objects:**
- `mode`: `"zk" | "oracle" | "custom_oracle"`
- `circuit`: Which ZK circuit + public inputs
- `oracle`: Which oracle(s) + configuration
- `payoutModel`: Fee + distribution logic
- `constraints`: On-chain enforceable rules (min/max stake, deadlines)

### 4.4 `ui` (The Creative Layer)
- `templateId`: Which visual template from Covenant Studio
- `theme`: Color/font overrides
- `customizations`: Template-specific settings
- `bundleUrl`: Link to uploaded custom HTML/JS/CSS bundle

### 4.5 `metadata`
Free-form object. Both tools **must** preserve unknown keys.

---

## 5. Usage Patterns (Phase 11)

### Pattern A: Terminal → Studio
1. User configures resolution + fees in Terminal.
2. Clicks "Design UI in Covenant Studio".
3. Terminal exports `CovenantConfigV1` and opens Studio with it pre-loaded.
4. Studio uses `resolution` + `covenant` to suggest appropriate templates.
5. User designs in Studio → Studio updates `ui` section only.

### Pattern B: Studio → Terminal
1. User starts in Studio with a visual template.
2. Clicks "Configure Advanced Resolution".
3. Studio opens Terminal pre-filled with `covenant` + `ui` data.
4. User chooses circuit, oracle, payout model.
5. Terminal updates `resolution` section.

### Pattern C: Roundtrip
- Full roundtrip must be lossless for all known fields.

---

## 6. Implementation Requirements

### For Covex Terminal (v1.0)
- Must be able to import + export the full schema.
- Must render a "Resolution Simulator" using data from this config.
- Must provide deep-link URLs containing the config (or reference to it).

### For Covenant Studio (v1.0)
- Must consume the schema on load.
- Must only mutate the `ui` section unless user explicitly enters advanced mode.
- Must preserve `resolution` and `metadata` exactly when exporting.

---

## 7. Versioning Strategy

- **Minor changes** (new optional fields): Bump to `1.1`, keep backward compatible.
- **Breaking changes**: New major version (`2.0`). Old configs must be migratable.
- Both tools must support reading at least the previous minor version.

---

## 8. Security & Validation

- All configs must pass the JSON Schema + Zod validation before being used for deployment.
- Never trust client-provided configs for on-chain critical values without re-validation on the backend.
- `creatorAddress` must match the connected wallet when deploying.

---

## 9. Future Extensibility (Post Phase 11)

Planned additions in later phases:
- `v1.1`: Support for visual payout tree definitions
- `v1.2`: Multi-covenant bundle support
- `v2.0`: Full on-chain constraint language (when silverc supports it)

---

## 10. Reference Implementations

- JSON Schema: `shared/covenant-config/covenant-config.schema.json`
- TypeScript + Zod: `shared/covenant-config/covenant-config.ts`
- Example configs: See factory functions in the TS file

---

**This spec is the contract for Phase 11 integration work.** Any deviation must be discussed and documented here before implementation.