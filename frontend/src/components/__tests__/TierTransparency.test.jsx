import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TierTransparency from '../TierTransparency.jsx';

// TierTransparency is the single authoritative statement of the honesty rule:
// building any covenant is free; paid adds only PRIORITY PLACEMENT and the FULL
// premium UI website template library, never a technical capability. These tests
// pin the exact load-bearing copy and the tier-reflecting line so the message
// cannot silently drift (the same component renders in the Terminal and on Pricing).

describe('TierTransparency', () => {
  it('states every build capability is free and only placement plus premium templates are paid', () => {
    const html = renderToStaticMarkup(<TierTransparency />);
    expect(html).toContain('Included on every tier (Free included)');
    expect(html).toContain('Covex never gates what you can build.');
    expect(html).toContain('Build and deploy any covenant');
    expect(html).toContain('a real in-browser ZK proof (Groth16)');
    expect(html).toContain('Lock any amount of KAS');
    // Free includes the website builder itself, with the base template set.
    expect(html).toContain('Build a full custom website in Covenant Studio, with the base template set');
    expect(html).toContain('What a paid tier adds');
    // The two paid add-ons, both stated.
    expect(html).toContain('Priority placement');
    expect(html).toContain('the best display spot');
    expect(html).toContain('The full premium UI website template library');
    expect(html).toContain('Paid tiers do not unlock any technical capability.');
    expect(html).toContain('never what you can build.');
  });

  it('defaults to FREE and shows the FREE current-tier line', () => {
    const html = renderToStaticMarkup(<TierTransparency />);
    expect(html).toContain('Your tier: FREE');
    expect(html).toContain('priority placement and the premium template library, the paid add-ons');
  });

  it('reflects a paid tier in the current-tier line', () => {
    const html = renderToStaticMarkup(<TierTransparency currentTier="PRO" />);
    expect(html).toContain('Your tier: PRO');
    expect(html).toContain('priority placement and the premium template library are active.');
    // It must NOT claim the paid tier unlocked any technical capability.
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
