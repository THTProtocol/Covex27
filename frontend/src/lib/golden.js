/**
 * Golden grid system - the single source of truth for Covex's golden-ratio
 * layout language.
 *
 * Every page (and every creator-built covenant site) places its content on the
 * same proportion: a phi (1.618) column split and a phi-stepped vertical rhythm.
 * This module exports the raw numbers; index.css mirrors them as CSS variables
 * and utility classes (.golden-*), and the <GoldenGrid>/<GoldenSection>
 * components plus the covenant builder's Golden Grid block both consume those
 * classes. Keeping the constants here means the React layer, the CSS layer, and
 * the tests never drift from one definition of phi.
 *
 * The numbers are layout only (ratios and spacing), never color, so they are
 * identical in light and dark mode and carry no theme logic.
 */

// The golden ratio and its inverse. A : B is golden when (A + B) / A == A / B.
export const PHI = 1.618033988749895;
export const PHI_INV = 0.618033988749895; // 1 / PHI

/**
 * Phi-stepped spacing scale (rem). Geometric, ratio phi, anchored at 1rem.
 * This is the canonical rhythm: section padding, stack gaps, and gutters all
 * snap to a step here instead of being hand-tuned per page, so vertical spacing
 * stays in proportion the whole way down a page.
 */
export const GOLDEN_SPACE = Object.freeze({
  '3xs': 0.382, // 1 / phi^2
  '2xs': 0.618, // 1 / phi
  xs: 1, //        anchor
  sm: 1.618, //    phi
  md: 2.618, //    phi^2
  lg: 4.236, //    phi^3
  xl: 6.854, //    phi^4
  '2xl': 11.089, // phi^5
});

/** Golden container measure (rem): the comfortable phi-scaled reading column. */
export const GOLDEN_MEASURE_REM = 62;

/**
 * The two-track golden split as a CSS `grid-template-columns` value.
 *   'golden'  -> wider track first  (phi : 1)
 *   'reverse' -> wider track second (1 : phi)
 *   'even'    -> equal halves
 * The fr values are literal so the browser parses them as flex factors (CSS
 * cannot append a unit to a var()).
 */
export function goldenColumns(ratio = 'golden') {
  if (ratio === 'reverse') return 'minmax(0, 1fr) minmax(0, 1.618fr)';
  if (ratio === 'even') return 'minmax(0, 1fr) minmax(0, 1fr)';
  return 'minmax(0, 1.618fr) minmax(0, 1fr)';
}

/** Resolve a spacing step name (or pass-through number) to rem. */
export function goldenSpace(step) {
  if (typeof step === 'number') return step;
  return GOLDEN_SPACE[step] ?? GOLDEN_SPACE.xs;
}
