import { describe, it, expect } from 'vitest';
import { puckConfig, STARTER_TEMPLATES, LIVE_TOKENS, matchTemplate } from './puckConfig.jsx';

const COMPONENTS = new Set(Object.keys(puckConfig.components));
const TOKENS = new Set(LIVE_TOKENS.map((t) => t.token));

// Collect every {{token}} string (incl. dotted heads like live.actions are never
// used in templates; templates only use flat tokens) from a template's props.
function collectTokens(node, out) {
  if (typeof node === 'string') {
    const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(node)) !== null) out.add(m[1].split('.')[0]);
  } else if (Array.isArray(node)) {
    node.forEach((n) => collectTokens(n, out));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach((v) => collectTokens(v, out));
  }
  return out;
}

describe('STARTER_TEMPLATES integrity', () => {
  it('exposes the 7 expected templates', () => {
    expect(STARTER_TEMPLATES).toHaveLength(7);
    const ids = STARTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(7); // unique ids
  });

  for (const t of STARTER_TEMPLATES) {
    describe(`template: ${t.id}`, () => {
      it('has valid Puck data shape', () => {
        expect(t.data).toBeTruthy();
        expect(Array.isArray(t.data.content)).toBe(true);
        expect(t.data.content.length).toBeGreaterThan(0);
        expect(t.data.root && typeof t.data.root.props === 'object').toBe(true);
      });

      it('uses only registered block types', () => {
        for (const item of t.data.content) {
          expect(COMPONENTS.has(item.type), `unknown block type "${item.type}" in ${t.id}`).toBe(true);
        }
      });

      it('every block has a unique id', () => {
        const ids = t.data.content.map((i) => i.props && i.props.id);
        expect(ids.every(Boolean)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('uses only live tokens that exist in LIVE_TOKENS', () => {
        const used = collectTokens(t.data, new Set());
        for (const tok of used) {
          expect(TOKENS.has(tok), `template ${t.id} uses unknown token {{${tok}}}`).toBe(true);
        }
      });
    });
  }
});

describe('matchTemplate', () => {
  it('routes known covenant types to the right template', () => {
    expect(matchTemplate('binary_oracle_select')).toBe('prediction-market');
    expect(matchTemplate('chess')).toBe('chess-arena');
    expect(matchTemplate('escrow_2party')).toBe('escrow-2party');
    expect(matchTemplate('timelock')).toBe('vesting-timelock');
    expect(matchTemplate('fundraiser')).toBe('fundraiser');
    expect(matchTemplate('tournament')).toBe('tournament');
  });
  it('falls back to the generic template for unknown types', () => {
    expect(matchTemplate('something-unheard-of')).toBe('generic-covenant');
    expect(matchTemplate('')).toBe('generic-covenant');
    expect(matchTemplate(null)).toBe('generic-covenant');
  });
});
