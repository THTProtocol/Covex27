import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TierTransparency from '../TierTransparency.jsx';

// TierTransparency is the single authoritative statement of the honesty rule:
// paid = priority PLACEMENT only, never capability. These tests pin the exact
// load-bearing copy and the tier-reflecting line so the message cannot silently
// drift (the same component is rendered in the Terminal and on Pricing).

describe('TierTransparency', () => {
  it('states every build capability is free and only placement is paid', () => {
    const html = renderToStaticMarkup(<TierTransparency />);
    expect(html).toContain('Included on every tier (Free included)');
    expect(html).toContain('Covex never gates what you can build.');
    expect(html).toContain('Build and deploy any covenant');
    expect(html).toContain('a real in-browser ZK proof (Groth16)');
    expect(html).toContain('Lock any amount of KAS');
    expect(html).toContain('What a paid tier adds');
    expect(html).toContain('priority placement only');
    expect(html).toContain('Paid tiers do not unlock any feature.');
    expect(html).toContain('Paid only changes where it appears on Covex.');
  });

  it('defaults to FREE and shows the FREE current-tier line', () => {
    const html = renderToStaticMarkup(<TierTransparency />);
    expect(html).toContain('Your tier: FREE');
    expect(html).toContain('The only thing not active is priority placement');
  });

  it('reflects a paid tier in the current-tier line', () => {
    const html = renderToStaticMarkup(<TierTransparency currentTier="PRO" />);
    expect(html).toContain('Your tier: PRO');
    expect(html).toContain('priority placement is active.');
    // It must NOT claim the paid tier unlocked any feature.
    expect(html).not.toContain('unlocks');
  });

  it('contains no em dash or en dash anywhere in the rendered output', () => {
    const html = renderToStaticMarkup(<TierTransparency currentTier="MAX" />);
    // Reference the dash code points (not the literal glyphs) so this test file
    // itself stays byte-clean under the strict em-dash gate.
    const EM_DASH = String.fromCharCode(0x2014);
    const EN_DASH = String.fromCharCode(0x2013);
    expect(html.includes(EM_DASH)).toBe(false);
    expect(html.includes(EN_DASH)).toBe(false);
  });
});
