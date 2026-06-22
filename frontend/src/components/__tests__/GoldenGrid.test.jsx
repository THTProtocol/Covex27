import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@measured/puck';
import { GoldenGrid, GoldenSection, GoldenContainer, GoldenStack } from '../GoldenGrid.jsx';
import { PHI, PHI_INV, GOLDEN_SPACE, goldenColumns, goldenSpace } from '../../lib/golden.js';
import { puckConfig } from '../../lib/puckConfig.jsx';

// No jsdom: render to static markup and assert on the emitted class names, the
// same dependency-free strategy the other component tests use.

describe('golden.js (single source of truth)', () => {
  it('phi and its inverse satisfy the golden identity', () => {
    expect(PHI).toBeCloseTo(1.618033, 5);
    expect(PHI_INV).toBeCloseTo(0.618033, 5);
    // The defining property: 1/phi == phi - 1.
    expect(PHI_INV).toBeCloseTo(PHI - 1, 10);
    // And phi^2 == phi + 1.
    expect(PHI * PHI).toBeCloseTo(PHI + 1, 10);
  });

  it('the spacing scale is geometric with ratio phi', () => {
    // Each step up multiplies the previous by ~phi.
    expect(GOLDEN_SPACE.sm / GOLDEN_SPACE.xs).toBeCloseTo(PHI, 2);
    expect(GOLDEN_SPACE.md / GOLDEN_SPACE.sm).toBeCloseTo(PHI, 2);
    expect(GOLDEN_SPACE.lg / GOLDEN_SPACE.md).toBeCloseTo(PHI, 2);
    expect(GOLDEN_SPACE.xl / GOLDEN_SPACE.lg).toBeCloseTo(PHI, 2);
  });

  it('goldenColumns emits literal fr tracks for each ratio', () => {
    expect(goldenColumns('golden')).toBe('minmax(0, 1.618fr) minmax(0, 1fr)');
    expect(goldenColumns('reverse')).toBe('minmax(0, 1fr) minmax(0, 1.618fr)');
    expect(goldenColumns('even')).toBe('minmax(0, 1fr) minmax(0, 1fr)');
    expect(goldenColumns()).toBe('minmax(0, 1.618fr) minmax(0, 1fr)'); // default
  });

  it('goldenSpace resolves step names and passes numbers through', () => {
    expect(goldenSpace('sm')).toBe(1.618);
    expect(goldenSpace(3)).toBe(3);
    expect(goldenSpace('nope')).toBe(GOLDEN_SPACE.xs); // unknown -> anchor
  });
});

describe('GoldenGrid React primitives', () => {
  it('GoldenGrid applies the default golden split and forwards extra classes', () => {
    const h = renderToStaticMarkup(<GoldenGrid className="px-4"><div>a</div><div>b</div></GoldenGrid>);
    expect(h).toContain('golden-grid');
    expect(h).toContain('px-4');
    expect(h).not.toContain('golden-grid--reverse');
  });

  it('GoldenGrid honors the reverse + even ratios and center align', () => {
    expect(renderToStaticMarkup(<GoldenGrid ratio="reverse"><i/><i/></GoldenGrid>)).toContain('golden-grid--reverse');
    expect(renderToStaticMarkup(<GoldenGrid ratio="even"><i/><i/></GoldenGrid>)).toContain('golden-grid--even');
    expect(renderToStaticMarkup(<GoldenGrid align="center"><i/><i/></GoldenGrid>)).toContain('golden-grid--center');
  });

  it('GoldenSection / GoldenContainer / GoldenStack emit their classes', () => {
    expect(renderToStaticMarkup(<GoldenSection spacing="loose">x</GoldenSection>)).toMatch(/golden-section.*golden-section--loose/);
    expect(renderToStaticMarkup(<GoldenContainer>x</GoldenContainer>)).toContain('golden-container');
    expect(renderToStaticMarkup(<GoldenStack gap="lg">x</GoldenStack>)).toMatch(/golden-stack.*golden-stack--lg/);
  });
});

describe('Puck Golden Grid block', () => {
  it('is registered in the layout category', () => {
    expect(puckConfig.components.GoldenGrid).toBeTruthy();
    expect(puckConfig.categories.layout.components).toContain('GoldenGrid');
  });

  it('renders two golden columns through Puck <Render> (the public covenant-page path)', () => {
    const html = renderToStaticMarkup(
      <Render
        config={puckConfig}
        data={{ root: { props: {} }, content: [{ type: 'GoldenGrid', props: { id: 'gg', ratio: 'golden', valign: 'start' } }] }}
        metadata={{ live: {} }}
      />
    );
    expect(html).toContain('cvx-golden');
    // Two column wrappers (min-w-0) so either side can hold dropped blocks.
    expect((html.match(/min-w-0/g) || []).length).toBe(2);
  });

  it('reverse ratio + center align map to the mirrored class names', () => {
    const html = renderToStaticMarkup(
      <Render
        config={puckConfig}
        data={{ root: { props: {} }, content: [{ type: 'GoldenGrid', props: { id: 'gg2', ratio: 'reverse', valign: 'center' } }] }}
        metadata={{ live: {} }}
      />
    );
    expect(html).toContain('cvx-golden-reverse');
    expect(html).toContain('cvx-golden-center');
  });
});
