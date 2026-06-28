import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@measured/puck';
import { puckConfig, STARTER_TEMPLATES } from './puckConfig.jsx';
import { renderSafeMarkdown } from './safeMarkdown.js';

// Server-render a template through Puck's <Render> with mock live metadata, the
// SAME path the public covenant page uses. Proves blocks render real DOM, honesty
// labels are correct, and the theme-aware .cvx-* surfaces are emitted (they flip
// in light mode via .light overrides in covexPuck.css).
const LIVE = {
  name: 'Test Covenant', status: 'Active', network: 'mainnet',
  amount_kaspa: 1234, total_locked: '1,234 KAS', tx_count: 7,
  fee_pct: 2, rebate_pct: 1, pool_total: 1234, pool_yes: 800, pool_no: 434,
  odds_yes: '1.50', odds_no: '2.80', kickoff: '', settle_at: '', timelock: '',
  oracle_pubkey: '', creator: 'kaspa:q', actions: [], pool: { total: 1234 }, odds: {},
};

function renderTemplate(tpl, live = LIVE) {
  return renderToStaticMarkup(
    <Render config={puckConfig} data={tpl.data} metadata={{ live }} />
  );
}

describe('Puck template server rendering', () => {
  for (const t of STARTER_TEMPLATES) {
    it(`${t.id} renders without throwing and emits real markup`, () => {
      const html = renderTemplate(t);
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(200);
      // Theme-aware surfaces present (so light mode can flip them).
      expect(html).toMatch(/cvx-(title|body|panel|muted|footer|cta-title|accent-)/);
      // No raw script tag ever ends up in the output.
      expect(html).not.toMatch(/<script/i);
    });
  }
});

describe('EnforcementBadge honesty', () => {
  // Render the EnforcementBadge ALONE so assertions target the badge, not other
  // blocks that legitimately use words like "on-chain" in qualified feature copy.
  const badgeOnly = (er) => renderToStaticMarkup(
    <Render
      config={puckConfig}
      data={{ root: { props: {} }, content: [{ type: 'EnforcementBadge', props: { id: 'eb', note: 'How this is enforced' } }] }}
      metadata={{ live: { ...LIVE, enforcement_reality: er } }}
    />
  );

  it('on-chain reality reads "On-chain enforced", not oracle/zk', () => {
    const h = badgeOnly('on-chain');
    expect(h).toContain('On-chain enforced');
    expect(h).not.toContain('Resolver-attested');
    expect(h).not.toContain('Full ZK verified');
  });
  it('oracle/hybrid reality reads "Resolver-attested", never an on-chain-enforced claim', () => {
    const h = badgeOnly('hybrid');
    expect(h).toContain('Resolver-attested');
    expect(h).not.toContain('On-chain enforced');
  });
  it('full-zk reality is verified fail-closed by the oracle, never labeled "on-chain"', () => {
    const h = badgeOnly('full-zk');
    expect(h).toContain('Full ZK verified');
    expect(h.toLowerCase()).toContain('verified fail-closed');
    expect(h).not.toContain('On-chain enforced');
  });
  it('unknown reality degrades to "Metadata only" (no enforcement claim)', () => {
    const h = badgeOnly('decorative');
    expect(h).toContain('Metadata only');
    expect(h).not.toContain('On-chain enforced');
    expect(h).not.toContain('Resolver-attested');
  });
});

describe('FeatureGrid default copy is qualified (honesty)', () => {
  it('the "no oracle, no trust" line is conditioned on script-enforcement', () => {
    const grid = puckConfig.components.FeatureGrid.defaultProps.features
      .map((f) => f.description).join(' ');
    expect(grid).toMatch(/no oracle, no trust/i);
    // It must be qualified: appears alongside "script-enforced" wording.
    expect(grid).toMatch(/script-enforced/i);
    expect(grid).toMatch(/oracle-resolved|attested/i);
  });
});

describe('RichText markdown sanitizer', () => {
  it('forces https + rel hardening on links, drops javascript: / script / on*', () => {
    const html = renderSafeMarkdown(
      'safe [ok](https://kaspa.org) and [bad](javascript:alert(1)) and <script>alert(1)</script> <img src=x onerror=alert(1)>'
    );
    expect(html).toContain('href="https://kaspa.org"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<img/i);
  });
  it('keeps allowlisted formatting tags only', () => {
    const html = renderSafeMarkdown('**b** *i* `code`\n\n- one\n- two');
    expect(html).toMatch(/<strong>/);
    expect(html).toMatch(/<em>/);
    expect(html).toMatch(/<code>/);
    expect(html).toMatch(/<li>/);
  });
  it('drops http: and data: hrefs (https only)', () => {
    const a = renderSafeMarkdown('[x](http://evil.com)');
    expect(a).not.toContain('http://evil.com');
    const b = renderSafeMarkdown('[x](data:text/html,<b>)');
    expect(b).not.toContain('data:text/html');
  });
});

describe('SocialLinks emits only https + hardened anchors', () => {
  it('renders an https link with target/rel and drops non-https', () => {
    const html = renderToStaticMarkup(
      <Render
        config={puckConfig}
        data={{ root: { props: {} }, content: [{ type: 'SocialLinks', props: { id: 's1', alignment: 'center', x: 'https://x.com/covex', discord: 'javascript:alert(1)', telegram: '', github: '', website: 'http://insecure.com' } }] }}
        metadata={{ live: LIVE }}
      />
    );
    expect(html).toContain('href="https://x.com/covex"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain('http://insecure.com');
  });
});
