// zk-set-backend-parity.test.js
//
// CROSS-LANGUAGE ZK-SET PARITY (honesty gate).
//
// The reality-badge honesty split depends on two id sets being IDENTICAL across the
// language boundary:
//
//   frontend  lib/zk/circuits.js          VERIFIED_FULL_ZK   /  CHAIN_ENFORCED_ZK
//   backend   src/covenant_catalog.rs     VERIFIED_FULL_ZK_CIRCUITS / CHAIN_ENFORCED_ZK_CIRCUITS
//
// Today they agree only via a hand-written comment ("Server-side mirror of frontend ...")
// and a same-file COUNT assertion in each language (len == 19 / len == 4). A future edit
// could add an id to one side, keep the counts equal by removing a different id, and ship a
// covenant whose reality badge says one thing on the wire and another in the UI - exactly the
// silent mislabel this test exists to catch. We read BOTH sources and DIFF the actual id sets.
//
// We parse the backend Rust file textually (the two consts are simple `&[&str]` literals); the
// frontend sets are imported as the real JS Sets. A mismatch in EITHER direction fails.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { VERIFIED_FULL_ZK, CHAIN_ENFORCED_ZK } from '../circuits.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// frontend/src/lib/zk/__tests__ -> repo root is six levels up; then backend/src/...
const CATALOG_RS = resolve(HERE, '..', '..', '..', '..', '..', 'backend', 'src', 'covenant_catalog.rs');
const rust = readFileSync(CATALOG_RS, 'utf8');

// Extract the string ids from a `pub const NAME: &[&str] = &[ ... ];` literal. Tolerant of
// line wrapping and trailing commas; the ids are simple double-quoted identifiers.
function extractRustConst(source, name) {
  const re = new RegExp(`pub const ${name}\\s*:\\s*&\\[&str\\]\\s*=\\s*&\\[([\\s\\S]*?)\\];`);
  const m = source.match(re);
  if (!m) throw new Error(`could not find Rust const ${name} in covenant_catalog.rs`);
  const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (ids.length === 0) throw new Error(`Rust const ${name} parsed to zero ids`);
  return ids;
}

const rustVerified = extractRustConst(rust, 'VERIFIED_FULL_ZK_CIRCUITS');
const rustChainEnforced = extractRustConst(rust, 'CHAIN_ENFORCED_ZK_CIRCUITS');

const sortedUnique = (arr) => Array.from(new Set(arr)).sort();

describe('backend <-> frontend ZK-set parity', () => {
  it('parsed the backend Rust consts non-trivially', () => {
    expect(rustVerified.length).toBeGreaterThan(0);
    expect(rustChainEnforced.length).toBeGreaterThan(0);
  });

  it('neither Rust const has duplicate ids', () => {
    expect(rustVerified.length).toBe(new Set(rustVerified).size);
    expect(rustChainEnforced.length).toBe(new Set(rustChainEnforced).size);
  });

  it('VERIFIED_FULL_ZK id set matches backend VERIFIED_FULL_ZK_CIRCUITS exactly', () => {
    expect(sortedUnique(rustVerified)).toEqual(sortedUnique([...VERIFIED_FULL_ZK]));
  });

  it('CHAIN_ENFORCED_ZK id set matches backend CHAIN_ENFORCED_ZK_CIRCUITS exactly', () => {
    expect(sortedUnique(rustChainEnforced)).toEqual(sortedUnique([...CHAIN_ENFORCED_ZK]));
  });

  it('the chain-enforced set is a strict subset of the verified set (both sides)', () => {
    for (const id of CHAIN_ENFORCED_ZK) {
      expect(VERIFIED_FULL_ZK.has(id)).toBe(true);
    }
    const rv = new Set(rustVerified);
    for (const id of rustChainEnforced) {
      expect(rv.has(id)).toBe(true);
    }
  });
});
