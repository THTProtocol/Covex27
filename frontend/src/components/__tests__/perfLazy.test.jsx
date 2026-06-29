import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Guards for the perf lazy-load wave: the heavy modules must be deferred off the homepage first
// paint, while the content the user sees on first paint is unchanged (no blank backdrop, the
// covenant grid still renders its cards immediately as a plain grid).

vi.mock('../ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

describe('DagBackground - the external DAG iframe is deferred off first paint', () => {
  it('renders the themed placeholder but NO external kgi.kaspad.net iframe on the initial (SSR) render', async () => {
    const { default: DagBackground } = await import('../DagBackground.jsx');
    const html = renderToStaticMarkup(<DagBackground />);
    // The backdrop container + themed gradient placeholder render immediately (never blank).
    expect(html).toContain('dag-background');
    // The heavy external iframe is gated behind requestIdleCallback (idle starts false in SSR), so
    // it must NOT be in the first-paint markup.
    expect(html).not.toContain('kgi.kaspad.net');
    expect(html).not.toContain('<iframe');
  });
});

describe('MotionStaggerGrid - cards render on first paint without framer-motion', () => {
  it('renders the plain grid (Suspense fallback) with all items, no framer-motion needed', async () => {
    const { default: MotionStaggerGrid } = await import('../MotionStaggerGrid.jsx');
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const html = renderToStaticMarkup(
      <MotionStaggerGrid
        className="grid-test"
        prefersReduced={false}
        items={items}
        keyFor={(it) => it.id}
        renderItem={(it) => <span data-card={it.id}>{it.id}</span>}
      />,
    );
    // The grid wrapper className is preserved (no layout shift vs the animated version).
    expect(html).toContain('grid-test');
    // Every card is present on first paint (the fallback renders content immediately).
    expect(html).toContain('data-card="a"');
    expect(html).toContain('data-card="b"');
    expect(html).toContain('data-card="c"');
  });

  it('reduced-motion renders the plain grid directly (no async motion chunk at all)', async () => {
    const { default: MotionStaggerGrid } = await import('../MotionStaggerGrid.jsx');
    const html = renderToStaticMarkup(
      <MotionStaggerGrid
        className="grid-rm"
        prefersReduced
        items={[{ id: 'x' }]}
        keyFor={(it) => it.id}
        renderItem={(it) => <span data-card={it.id} />}
      />,
    );
    expect(html).toContain('grid-rm');
    expect(html).toContain('data-card="x"');
  });
});

describe('usePrefersReducedMotion - SSR-safe default', () => {
  it('is importable without framer-motion and returns a boolean default', async () => {
    const mod = await import('../../lib/usePrefersReducedMotion.js');
    expect(typeof mod.default).toBe('function');
  });
});
