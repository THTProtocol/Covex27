# Liquid Glass Pass — Full Transparency + Edge Darkening

## Goal
Make ALL buttons, boxes, panels, and the nav far more liquid glassy: more
transparent/translucent, with a subtle black gradient darkening toward edges/borders.

## Strategy
- Lower glass background opacity by 12-18% (more see-through to WebGL)
- Bump backdrop-filter blur values (more liquid diffusion)
- Add `inset 0 0 60px 20px rgba(0,0,0,0.25)` inner shadow to every glass surface
  for edge-to-center black gradient darkening
- Add a subtle top-edge light rim (`inset 0 1px 0 rgba(255,255,255,0.06)`)
- GlassButton: enhance the `inset black` shadows in the lens for stronger edge
  darkening
- Nav bar: same treatment — more transparent, inner vignette, stronger blur
- Verify build after

## Files
1. `frontend/src/index.css` — glass-section-1/2/3, glass-panel, glass-heavy, glass-subtle,
   glass-modal, glass-dropdown, glass-tooltip, nav-glass, glass-input, btn-glass
2. `frontend/src/components/ui/GlassButton.jsx` — enhance lens box-shadow for edge
   darkening, bump glassColor translucency
3. `frontend/src/App.jsx` — nav inline styles to match new glass tokens

## Verification
- `npm run build` in frontend/
- No regressions
