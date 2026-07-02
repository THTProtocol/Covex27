// zk-set-backend-parity.test.js
//
// CROSS-LANGUAGE ZK-SET PARITY (honesty gate).
//
// The reality-badge honesty split depends on the verified-circuit id set being IDENTICAL
// across the language boundary:
//
//   frontend  lib/zk/circuits.js          VERIFIED_FULL_ZK
//   backend   src/covenant_catalog.rs     VERIFIED_FULL_ZK_CIRCUITS
//
// Today they agree only via a hand-written comment ("Server-side mirror of frontend ...")
// and a same-file COUNT assertion in each language (len == 19). A future edit could add an
// id to one side, keep the counts equal by removing a different id, and ship a covenant whose
// reality badge says one thing on the wire and another in the UI - exactly the silent mislabel
// this test exists to catch. We read BOTH sources and DIFF the actual id sets.
//
// RETIRED MODEL: the "chain-enforced ZK" / 'full-zk-chain' tier was a documented overclaim
// (no builder binds a hashlock to a circuit's ZK public output; covenant_builder.rs hashlock
// is blake2b256 of an arbitrary preimage; all ZK circuits share the same oracle-cosign path).
// It has been retired ENTIRELY: there is no CHAIN_ENFORCED_ZK set in circuits.js and no
// CHAIN_ENFORCED_ZK_CIRCUITS const in covenant_catalog.rs. This test now (a) keeps the
// verified-set parity, and (b) guards against the carve-out being resurrected on EITHER side.
//
// We parse the backend Rust file textually (the const is a simple `&[&str]` literal); the
// frontend set is imported as the real JS Set. A mismatch in EITHER direction fails.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as circuitsModule from '../circuits.js';
import { VERIFIED_FULL_ZK, IN_BROWSER_PROVERS } from '../circuits.js';
import { PROVERS } from '../provers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// frontend/src/lib/zk/__tests__ -> repo root is six levels up; then backend/src/...
const CATALOG_RS = resolve(HERE, '..', '..', '..', '..', '..', 'backend', 'src', 'covenant_catalog.rs');
const rust = readFileSync(CATALOG_RS, 'utf8');

// The frontend circuits.js source, read textually so we can assert the retired symbols are
// genuinely gone from the module surface (not merely emptied).
const CIRCUITS_JS = resolve(HERE, '..', 'circuits.js');
const circuitsSrc = readFileSync(CIRCUITS_JS, 'utf8');

// Extract the string ids from a `pub const NAME: &[&str] = &[ ... ];` literal. Tolerant of
// line wrapping and trailing commas; the ids are simple double-quoted identifiers.
function extractRustConst(source, name) {
  const re = new RegExp(`pub const ${name}\\s*:\\s*&\\[&str\\]\\s*=\\s*&\\[([\\s\\S]*?)\\];`);
  const m = source.match(re);
  if (!m) throw new Error(`could not find Rust const ${name} in covenant_catalog.rs`);
  const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return ids;
}

const rustVerified = extractRustConst(rust, 'VERIFIED_FULL_ZK_CIRCUITS');

const sortedUnique = (arr) => Array.from(new Set(arr)).sort();

describe('backend <-> frontend ZK-set parity', () => {
  it('parsed the backend VERIFIED set non-trivially', () => {
    expect(rustVerified.length).toBeGreaterThan(0);
  });

  it('the backend VERIFIED const has no duplicate ids', () => {
    expect(rustVerified.length).toBe(new Set(rustVerified).size);
  });

  it('VERIFIED_FULL_ZK id set matches backend VERIFIED_FULL_ZK_CIRCUITS exactly', () => {
    expect(sortedUnique(rustVerified)).toEqual(sortedUnique([...VERIFIED_FULL_ZK]));
  });
});

describe('IN_BROWSER_PROVERS honesty (ZK-1): every claimed in-browser prover has a real prover', () => {
  // The "in-browser provable" badge + count (ZkStudio, SandboxCircuitPreview, OnChainLockSection,
  // TransparencyModal, CovexTerminal) all gate off IN_BROWSER_PROVERS. If an id is listed there
  // without a real input builder in PROVERS, the UI paints a false "in-browser" badge and the
  // claim path is silently hidden. This test fails-closed on that drift.
  const proverKeys = new Set(Object.keys(PROVERS));

  it('PROVERS keys are a SUPERSET of IN_BROWSER_PROVERS (no phantom in-browser prover)', () => {
    const missing = [...IN_BROWSER_PROVERS].filter((id) => !proverKeys.has(id));
    expect(missing).toEqual([]);
  });

  it('every IN_BROWSER_PROVERS id is a genuinely verified circuit (subset of VERIFIED_FULL_ZK)', () => {
    const notVerified = [...IN_BROWSER_PROVERS].filter((id) => !VERIFIED_FULL_ZK.has(id));
    expect(notVerified).toEqual([]);
  });
});

describe('chain-enforced ZK tier is retired (resurrection guard)', () => {
  // The frontend module must NOT export a CHAIN_ENFORCED_ZK set or an isChainEnforcedZk
  // helper anymore. Emptying the set was the previous (incomplete) fix; the carve-out is now
  // removed outright so it cannot silently drift back to a populated state.
  it('frontend circuits.js exports no CHAIN_ENFORCED_ZK and no isChainEnforcedZk', () => {
    expect(circuitsModule.CHAIN_ENFORCED_ZK).toBeUndefined();
    expect(circuitsModule.isChainEnforcedZk).toBeUndefined();
  });

  it('frontend circuits.js source defines no chain-enforced export', () => {
    // No `export const CHAIN_ENFORCED_ZK` / `export function isChainEnforcedZk` definitions.
    expect(/export\s+const\s+CHAIN_ENFORCED_ZK\b/.test(circuitsSrc)).toBe(false);
    expect(/export\s+function\s+isChainEnforcedZk\b/.test(circuitsSrc)).toBe(false);
  });

  it('backend covenant_catalog.rs declares no CHAIN_ENFORCED_ZK_CIRCUITS const', () => {
    // The Rust mirror const is retired too. A `pub const CHAIN_ENFORCED_ZK_CIRCUITS` would
    // reintroduce the carve-out on the backend side; the prose mention in comments is fine.
    expect(/pub const\s+CHAIN_ENFORCED_ZK_CIRCUITS\b/.test(rust)).toBe(false);
  });
});
