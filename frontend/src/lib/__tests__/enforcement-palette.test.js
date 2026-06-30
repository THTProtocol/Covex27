// enforcement-palette.test.js
//
// The structural cure for honesty-palette drift. The same enforcement-reality word must render
// the same HUE everywhere or readers stop trusting any of them. This test pins the sacred hue
// per kind and asserts that ALL THREE sources agree:
//   1. lib/enforcement-palette.js   (the new single source: TrustBadge chip colors + icons)
//   2. components/ui/Badge.jsx       (the cva chip primitive, kept as inline literals for the JIT)
//   3. lib/enforcement-copy.js       (the copy half: every reality has a badge label)
// Any future edit that drifts one source's hue away from the others fails here, in CI, before
// it can ship. This is what makes "patch each surface" unnecessary going forward.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ENFORCEMENT_KINDS,
  KIND_HUE,
  KIND_TO_BADGE_VARIANT,
  TRUSTBADGE_STYLES,
  KIND_ICON,
  COMPACT_LABEL,
} from '../enforcement-palette.js';
import { REALITY_BADGE_LABEL, KNOWN_REALITIES } from '../enforcement-copy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const badgeSrc = readFileSync(resolve(HERE, '../../components/ui/Badge.jsx'), 'utf8');

// The sacred hue per canonical kind. This object is the contract; if a hue must legitimately
// change, it changes HERE and in the palette together, deliberately, never by accident.
const SACRED = {
  onchain: 'emerald',
  onchainzk: 'teal',
  hybrid: 'sky',
  oracle: 'amber',
  fullzk: 'violet',
  decorative: 'slate',
};

describe('enforcement palette single source', () => {
  it('covers exactly the six canonical kinds, no more no less', () => {
    expect([...ENFORCEMENT_KINDS].sort()).toEqual(Object.keys(SACRED).sort());
  });

  it('the palette hue matches the sacred hue for every kind', () => {
    for (const kind of ENFORCEMENT_KINDS) {
      expect(KIND_HUE[kind]).toBe(SACRED[kind]);
    }
  });

  it('no two kinds share a hue (each honesty word is visually distinct)', () => {
    const hues = ENFORCEMENT_KINDS.map((k) => KIND_HUE[k]);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('TrustBadge chip classes carry the sacred hue token for every kind', () => {
    for (const kind of ENFORCEMENT_KINDS) {
      const cls = TRUSTBADGE_STYLES[kind];
      expect(typeof cls).toBe('string');
      expect(cls).toContain(`${SACRED[kind]}-`);
    }
  });

  it('every kind has an icon and a compact label', () => {
    for (const kind of ENFORCEMENT_KINDS) {
      expect(KIND_ICON[kind]).toBeTruthy();
      expect(typeof COMPACT_LABEL[kind]).toBe('string');
      expect(COMPACT_LABEL[kind].length).toBeGreaterThan(0);
    }
  });

  it('Badge.jsx cva variant uses the SAME sacred hue as the palette (drift guard)', () => {
    for (const kind of ENFORCEMENT_KINDS) {
      const variant = KIND_TO_BADGE_VARIANT[kind];
      // Match the variant key (quoted like 'on-chain' OR bare like hybrid) -> its class string.
      const re = new RegExp(`(?:'${variant}'|\\b${variant})\\s*:\\s*'([^']*)'`);
      const m = badgeSrc.match(re);
      expect(m, `Badge.jsx must define variant "${variant}"`).toBeTruthy();
      expect(m[1], `Badge variant "${variant}" must use hue "${SACRED[kind]}"`).toContain(`${SACRED[kind]}-`);
    }
  });

  it('enforcement-copy has a non-empty badge label for every known reality', () => {
    for (const reality of KNOWN_REALITIES) {
      expect(typeof REALITY_BADGE_LABEL[reality]).toBe('string');
      expect(REALITY_BADGE_LABEL[reality].length).toBeGreaterThan(0);
    }
  });
});
