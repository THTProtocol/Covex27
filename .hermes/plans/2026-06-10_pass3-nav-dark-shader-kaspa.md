# Covex UI/UX Pass 3 — Nav Restructure, Dark-Only, Shader Fix & Kaspa Polish

> **Goal:** Four surgical fixes. Nav three-zone full-width layout. Delete light mode. Shader readability (vignette + opacity bump). Kaspa section glass polish.
> **Files:** App.jsx, ThemeProvider.jsx, index.html, index.css, WhatIsKaspa.jsx

---

## Fix 1 — Nav: Full-Width Three-Zone Layout

**File:** `frontend/src/App.jsx`

Current: Centered pill with all items in one row.  
Target: Full-width bar. Logo far left. Nav links absolute-centered. Wallet+network far right.

**Changes:**

1. Nav className: replace `rounded-full` pill → `w-[calc(100%-32px)] max-w-[1400px]` full-width bar, `rounded-2xl`
2. Inner wrapper: `flex items-center justify-between w-full px-8 h-14`
3. **Zone 1 (Logo)**: stays as-is but remove the wordmark — just the logo icon + "COVEX" gradient text
4. **Zone 2 (Center links)**: `absolute left-1/2 -translate-x-1/2 flex items-center gap-1`
   - Each link pill: `px-5 py-2 text-[0.9rem] font-medium tracking-[0.01em] text-white/60 hover:bg-white/[0.06] hover:text-white/95 rounded-full transition-all whitespace-nowrap`
   - Active: `bg-white/[0.08] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]`
5. **Zone 3 (Right)**: WalletButton + NetworkSwitcher in `flex items-center gap-2`
   - NetworkSwitcher restyle: `rounded-full border border-oklch(0.65 0.18 145 / 20%) bg-oklch(0.65 0.18 145 / 10%) text-oklch(0.75 0.18 145) text-[0.72rem] font-semibold tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`
6. **Remove ThemeToggle** from Zone 3 entirely

---

## Fix 2 — Delete Light Mode

**Files:** App.jsx, ThemeProvider.jsx, index.html, index.css

**App.jsx:** Remove `import ThemeToggle from './components/ThemeToggle'` and `<ThemeToggle />` from JSX.

**ThemeProvider.jsx:** Simplify to always-dark:
```jsx
export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }, []);
  return <ThemeContext.Provider value={{ theme: 'dark', setTheme: () => {} }}>{children}</ThemeContext.Provider>;
}
```
Keep `useTheme()` export for backward compat (some components may read `theme`).

**index.html:** Add `<html lang="en" class="dark">` — guarantees dark from first paint, no FOUC.

**index.css:** Remove all `.light` override blocks (~200 lines). Replace with single inert block:
```css
/* Light mode: permanently disabled. Dark only. */
.light { display: none; }
```

---

## Fix 3 — Shader Readability

**Files:** index.css, App.jsx

**Part A — Bump glass opacities:**

| Class | Old bg opacity | New bg opacity |
|-------|---------------|---------------|
| `.glass-section-1` | `oklch(1 0 0 / 6%)` | `oklch(0.06 0.01 280 / 75%)` |
| `.glass-section-2` | `oklch(1 0 0 / 4%)` | `oklch(0.07 0.01 280 / 70%)` |
| `.glass-section-3` | `oklch(1 0 0 / 2%)` | `oklch(0.08 0.01 280 / 65%)` |
| `.glass-panel` | `oklch(1 0 0 / 5%)` | `oklch(0.08 0.01 280 / 70%)` |
| `.glass-heavy` | `oklch(1 0 0 / 8%)` | `oklch(0.06 0.01 280 / 80%)` |

Blur values also increase: Tier 1 → `blur(32px)`, Tier 2 → `blur(24px)`, Tier 3 → `blur(16px)`.

**Part B — Shader vignette overlay:**

Add CSS class:
```css
.shader-vignette {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, oklch(0 0 0 / 35%) 100%),
    linear-gradient(180deg, oklch(0 0 0 / 20%) 0%, transparent 20%, transparent 80%, oklch(0 0 0 / 20%) 100%);
}
```

In App.jsx, add `<div className="shader-vignette" />` right after `<WebGLBackground />`.

---

## Fix 4 — Kaspa Page Polish

**File:** `frontend/src/pages/WhatIsKaspa.jsx`

Wrap entire page content in:
```jsx
<div className="glass-section-1 relative max-w-5xl mx-auto mt-8 mb-20">
```

**Specific changes:**
- Header: Gradient heading (`text-gradient` class), remove the icon box
- Section headings: Add `label-caps` for secondary labels, `text-gradient` for main headings
- Stat cards (Network Specs grid): Add `glass-section-3` class
- Research library cards: Add `glass-section-3` class + hover-glow
- "How Covex Uses This" section: Already has glass-panel — bump to `glass-section-2`
- CTA button at bottom: Replace with GlassButton accent variant
- Technical labels/params (K PARAMETER, BLUE/RED SETS, etc.): Wrap in glass badge style
- No text changes. All content/copy stays.

---

## Verification

```bash
cd /home/b42b00/Covex27/frontend && npm run build
```
Must pass with zero errors.

Manual checklist:
- [ ] Nav is full-width, logo left, links centered, wallet right
- [ ] No theme toggle visible anywhere
- [ ] Page always renders dark
- [ ] Vignette darkens shader edges
- [ ] Text is fully readable through all glass panels
- [ ] Kaspa page matches glass aesthetic
- [ ] All routes load
- [ ] Wallet connect works
- [ ] Network switcher works
