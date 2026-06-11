# Covex UI/UX Pass 2 — Glass Unification & Shader Speed Fix

> **Goal:** Polish-and-unify. Fix shader speed (0.003→0.015 increment). Make every section/menu/UI element use liquid glass. Zero breakage.
> **Files to modify:** WebGLBackground.jsx, App.jsx, index.css, Input.tsx, Separator.jsx, Explorer.jsx, Badge.tsx
> **Files to create:** None. All changes are CSS class additions or single-value tweaks.

---

## Task 1: Shader Speed Fix

**File:** `frontend/src/components/WebGLBackground.jsx`

**Current:** `r.uniforms.time.value += 0.003` — effective ~0.054/sec (too slow per user)
**Target:** Speed up 5x → `r.uniforms.time.value += 0.015` — effective ~0.27/sec (in prompt's 0.4-0.7 ballpark after shader's `* 0.3` multiplier = ~0.45/sec effective)
**Also:** Increase fragment shader's time multiplier from `0.3` to `0.5` for visible aurora-like motion

**Patch 1 — animate() loop:**
```
- if (r.uniforms) r.uniforms.time.value += 0.003
+ if (r.uniforms) r.uniforms.time.value += 0.015
```

**Patch 2 — fragment shader multiply:**
```
- float speed = time * 0.3;
+ float speed = time * 0.5;
```

**Verification:** `npm run dev` → shader animates visibly like slow-drifting aurora, not geological.

---

## Task 2: Nav Glass Polish

**File:** `frontend/src/App.jsx`

Nav is already floating pill but needs Pass 2's exact box-shadow stack + active-link pill treatment.

**Patch — Nav className update:**
```
Current:  className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-panel rounded-full px-6"
New:      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-2 backdrop-blur-xl saturate-[140%] border border-white/10"
          style={{ maxWidth: 'min(64rem, calc(100vw - 2rem))', 
                   background: 'oklch(1 0 0 / 5%)',
                   boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 18%), inset 0 -1px 0 oklch(0 0 0 / 15%), 0 8px 32px oklch(0 0 0 / 25%), 0 2px 8px oklch(0 0 0 / 15%)' }}
```

**Active nav link pill:**
Add class to `NL` function — when `isActive` is true, add: `bg-white/[0.08] rounded-full px-4 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]`

**Verification:** Nav has deep glass shadow, active link has pill highlight.

---

## Task 3: Three-Tier Glass Section CSS

**File:** `frontend/src/index.css`

Add CSS classes for the three section tiers from Pass 2:

```css
/* Tier 1 — Hero / Primary sections */
.glass-section-1 {
  background: oklch(1 0 0 / 6%);
  backdrop-filter: blur(24px) saturate(130%);
  border: 1px solid oklch(1 0 0 / 10%);
  border-radius: 24px;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 15%), 0 16px 48px oklch(0 0 0 / 30%), 0 4px 12px oklch(0 0 0 / 20%);
  padding: 48px;
}

/* Tier 2 — Cards / Feature blocks / Info panels */
.glass-section-2 {
  background: oklch(1 0 0 / 4%);
  backdrop-filter: blur(16px) saturate(120%);
  border: 1px solid oklch(1 0 0 / 8%);
  border-radius: 16px;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 12%), 0 8px 24px oklch(0 0 0 / 20%);
  padding: 32px;
}

/* Tier 3 — Subtle containers */
.glass-section-3 {
  background: oklch(1 0 0 / 2%);
  border: 1px solid oklch(1 0 0 / 6%);
  border-radius: 12px;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 8%);
  padding: 16px 20px;
}

/* Top-edge rim for all three tiers */
.glass-section-1::before,
.glass-section-2::before,
.glass-section-3::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, oklch(1 0 0 / 10%) 0%, transparent 60px);
  pointer-events: none;
  z-index: 0;
}
```

Also add: `position: relative` requirement note — these classes need `relative` on the parent element for `::before` to work.

**Also add: Modal/Dropdown/Tooltip CSS:**
```css
/* Modal / Dialog */
.glass-modal {
  background: oklch(0.09 0.015 280 / 90%);
  backdrop-filter: blur(40px) saturate(160%);
  border: 1px solid oklch(1 0 0 / 12%);
  border-radius: 20px;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 18%), 0 24px 80px oklch(0 0 0 / 50%), 0 8px 24px oklch(0 0 0 / 30%);
}
.glass-modal-backdrop {
  background: oklch(0 0 0 / 60%);
  backdrop-filter: blur(4px);
}
/* Dropdown */
.glass-dropdown {
  background: oklch(0.10 0.015 280 / 92%);
  backdrop-filter: blur(32px) saturate(150%);
  border: 1px solid oklch(1 0 0 / 10%);
  border-radius: 14px;
  box-shadow: 0 16px 48px oklch(0 0 0 / 40%), 0 4px 12px oklch(0 0 0 / 20%);
}
/* Tooltip */
.glass-tooltip {
  background: oklch(0.15 0.015 280 / 95%);
  backdrop-filter: blur(16px);
  border: 1px solid oklch(1 0 0 / 12%);
  border-radius: 8px;
  box-shadow: 0 8px 24px oklch(0 0 0 / 30%);
  font-size: 0.75rem;
  color: oklch(1 0 0 / 80%);
}
```

**Verification:** Classes appear in devtools. Used in next tasks.

---

## Task 4: Input Box-Shadow + Backdrop-Blur

**File:** `frontend/src/components/ui/Input.tsx`

Update className to add Pass 2's inset shadows and backdrop-blur:

```tsx
// Change from:
"flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:border-[var(--accent-primary)] focus-visible:shadow-[0_0_0_3px_oklch(0.65_0.20_150_/_15%)] disabled:cursor-not-allowed disabled:opacity-50"

// To:
"flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-[8px] px-4 py-3 text-sm text-white placeholder:text-white/[0.28] transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_2px_8px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:border-[var(--accent-primary)] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_oklch(0.65_0.20_150_/_15%)] disabled:cursor-not-allowed disabled:opacity-50"
```

**Verification:** Inputs have inner glow + glass feel.

---

## Task 5: Separator Gradient Lines

**File:** `frontend/src/components/ui/Separator.jsx`

Replace solid `bg-white/[0.08]` with gradient:

```jsx
// Horizontal:
'h-[1px] w-full bg-gradient-to-r from-transparent via-white/[0.10] to-transparent border-none'

// Vertical:
'w-[1px] h-full bg-gradient-to-b from-transparent via-white/[0.10] to-transparent border-none'
```

**Verification:** Separators are gradient lines, not solid bars.

---

## Task 6: Explorer Page — Section Glass Wrapping

**File:** `frontend/src/pages/Explorer.jsx`

Wrap key sections in glass-tier containers:
- Hero section → `glass-section-1 relative mx-6 mt-8`
- Stats row → already has `glass-panel` — keep
- Tab bar + filter row → `glass-section-3 relative mx-6 mb-4`
- Covenant cards loop → each card already uses Card component (which has Tier-2-like glass). No change needed here.
- Results area → `glass-section-2 relative mx-6 mt-4`

**Also:** Add the Pass 2 table header styles:
- Any `<thead>` or header row: add `text-[0.7rem] tracking-[0.1em] uppercase text-white/40` and `bg-white/[0.05] border-b border-white/[0.08]`

**Verification:** Explorer page sections have glass containers. No naked content on shader.

---

## Task 7: Badge — Add Status Variants

**File:** `frontend/src/components/ui/Badge.tsx`

Add three new variants from Pass 2:

```tsx
// In badgeVariants object, add:
success: "border-[oklch(0.65_0.18_145_/_25%)] bg-[oklch(0.65_0.18_145_/_12%)] text-[oklch(0.75_0.18_145)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
warning: "border-[oklch(0.78_0.18_80_/_25%)] bg-[oklch(0.78_0.18_80_/_12%)] text-[oklch(0.85_0.18_80)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
error: "border-[oklch(0.6_0.22_25_/_25%)] bg-[oklch(0.6_0.22_25_/_12%)] text-[oklch(0.72_0.2_25)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
```

Keep existing variants (default, secondary, destructive, outline, max, pro, builder).

**Verification:** New badge variants render with colored glass tints.

---

## Task 8: Scrollbar Hover State

**File:** `frontend/src/index.css`

Add hover state to scrollbar thumb:

```css
::-webkit-scrollbar-thumb:hover {
  background: oklch(1 0 0 / 22%);
}
```

Already have the 4px width and transparent track. Just adding hover.

---

## Task 9: Final Verification

```bash
cd /home/b42b00/Covex27/frontend
npm run build  # must pass
npm run dev    # manual walkthrough:
# - Shader moves at aurora speed
# - Nav has deep glass shadow + active pill
# - Explorer sections wrapped in glass
# - Inputs have inner glow
# - Separators are gradient lines
# - Scrollbar has hover feedback
# - Zero console errors
# - All routes load
# - All buttons/forms/wallet work
```

---

## What's NOT changing

- GlassButton.jsx — already correct, used as-is per constraint
- WebGL shader logic — only time multiplier changes
- All page logic/routes/API calls/handlers — zero touch
- All copy/labels — verbatim
- Light mode overrides — preserved
- Card.tsx — already matches Tier 2 spec closely
- Pricing.jsx, Dashboard.jsx, Deploy.jsx, CovenantInteractive.jsx — already glassified in Pass 1, no further changes needed
