# Covex × Liquid Glass — Monopo Saigon / Teal Redesign

> **Branch:** covex-2.0 | **Approach:** Reskin + new logo + teal material system. Zero layout/route/functionality changes.
> **Design system:** monopo saigon (refero.design) + Liquid Glass prompt

---

## Palette (Derived from #008a7d root)

| Token | Value | Role |
|-------|-------|------|
| Covex Deep | #001f1d | Hero frames, dark sections |
| Covex Void | #00100f | Deepest black, behind-glass |
| Covex Core | #008a7d | Root teal, glass edge highlights |
| Covex Mist | #00c9b8 | Bright teal, icon strokes |
| Covex Smoke | #4d8c86 | Muted teal, secondary text |
| Covex Ash | #2a5c57 | Mid-tone, disabled states |
| Covex Paper | #f0fefd | Light editorial sections |
| Covex Ghost | rgba(0,138,125,0.08) | Glass tint |

Mercury Flow: rgb(160,224,171)→rgb(255,172,46)→rgb(165,45,37) — hover only, ≤8%.

---

## Shape Rules (monopo saigon)

- Pills/badges: border-radius 75px
- Cards/inputs/panels: border-radius 0px
- No shadows, no elevation, no decorative chrome
- Hairline borders only: 1px solid rgba(0,201,184,0.15-0.25)

---

## Typography (Inter as Roobert fallback, Raleway Google Font for editorial)

- Hero: 94px Inter weight 300, line-height 0.76, #f0fefd
- Display: 54px Raleway weight 400, italic, line-height 1.39
- Body: 18px Inter weight 400, line-height 1.21, #003330
- Nav links: 12px Inter weight 400, uppercase, rgba(240,254,253,0.7)
- Micro: 9px system-ui, rgba(0,201,184,0.35)

---

## Files to Create
1. `frontend/src/components/CovexLogo.jsx` — SVG C-disc monogram
2. `frontend/public/favicon.svg` — Square C icon

## Files to Modify
3. `frontend/index.html` — Add Raleway Google Fonts link
4. `frontend/src/index.css` — Complete teal palette replacement, 0px card radii, Mercury Flow hover, monopo typography classes
5. `frontend/src/components/ui/GlassButton.jsx` — Teal tint, Mercury Flow hover shimmer
6. `frontend/src/App.jsx` — New logo, nav teal restyle
7. `frontend/src/components/WebGLBackground.jsx` — Teal color spectrum
8. `frontend/src/pages/Explorer.jsx` — Teal accents, 0px cards, Raleway heading
9. `frontend/src/pages/Pricing.jsx` — Teal tier cards, 75px pill badges
10. `frontend/src/pages/WhatIsKaspa.jsx` — Teal accent, Paper bg editorial
11. `frontend/src/pages/Deploy.jsx` — Teal glass form
12. `frontend/src/components/ui/Card.tsx` — 0px border-radius, teal border
13. `frontend/src/components/ui/Input.tsx` — 0px border-radius, teal border
14. `frontend/src/components/ui/Badge.tsx` — 75px radius, teal tints
15. `frontend/src/components/ui/Button.tsx` — Teal glass variant
