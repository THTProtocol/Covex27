/**
 * Golden grid React primitives.
 *
 * Thin, dependency-free wrappers over the `.golden-*` utility classes in
 * index.css (which are derived from src/lib/golden.js). Pages compose their
 * layout from these instead of hand-rolling max-width + spacing on every
 * section, so the whole app sits on one phi (1.618) rhythm and the SAME
 * proportion a creator gets from the covenant builder's Golden Grid block.
 *
 * Layout only: no color, so every primitive is light/dark safe and mobile-first
 * (the golden split collapses to a single column below md; the phi proportion
 * applies once there is room for two tracks).
 *
 * Presentational only (no hooks), so under the automatic JSX runtime there is
 * no need to import React here.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Centered page container on the golden measure (~62rem) with phi gutters.
 * Drop-in replacement for the repeated `max-w-* mx-auto px-4` pattern.
 */
export function GoldenContainer({ as: As = 'div', className, children, ...rest }) {
  return (
    <As className={cx('golden-container', className)} {...rest}>
      {children}
    </As>
  );
}

/**
 * A section whose block padding follows the phi spacing scale.
 * spacing: 'tight' | 'base' (default) | 'loose'.
 */
export function GoldenSection({ as: As = 'section', spacing = 'base', className, children, ...rest }) {
  const s = spacing === 'tight' ? 'golden-section--tight' : spacing === 'loose' ? 'golden-section--loose' : '';
  return (
    <As className={cx('golden-section', s, className)} {...rest}>
      {children}
    </As>
  );
}

/**
 * The golden split: a two-column grid at phi : 1 (or its variants). Expects
 * exactly two children (the two tracks). Stacks to one column below md.
 *   ratio: 'golden' (default, left wider) | 'reverse' (right wider) | 'even'
 *   align: 'start' (default) | 'center' | 'stretch'
 *   gap:   'base' (default, phi^2) | 'snug' (phi) | 'flush' (1/phi)
 */
export function GoldenGrid({ ratio = 'golden', align = 'start', gap = 'base', className, children, ...rest }) {
  const r = ratio === 'reverse' ? 'golden-grid--reverse' : ratio === 'even' ? 'golden-grid--even' : '';
  const a = align === 'center' ? 'golden-grid--center' : align === 'stretch' ? 'golden-grid--stretch' : '';
  const g = gap === 'snug' ? 'golden-grid--snug' : gap === 'flush' ? 'golden-grid--flush' : '';
  return (
    <div className={cx('golden-grid', r, a, g, className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * A vertical stack with a phi gap between children.
 *   gap: 'sm' (default) | 'md' | 'lg'
 */
export function GoldenStack({ as: As = 'div', gap = 'sm', className, children, ...rest }) {
  const g = gap === 'md' ? 'golden-stack--md' : gap === 'lg' ? 'golden-stack--lg' : '';
  return (
    <As className={cx('golden-stack', g, className)} {...rest}>
      {children}
    </As>
  );
}

export default GoldenGrid;
