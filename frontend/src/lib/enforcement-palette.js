// Single source of truth for the enforcement-reality COLOR + ICON + COMPACT-LABEL half.
// Complements lib/enforcement-copy.js (the COPY half: headline/body/verb/badge text).
//
// WHY THIS FILE EXISTS: the honesty palette is load-bearing brand. The same honesty
// word must render the same hue everywhere or readers stop trusting any of them. The
// color half was previously duplicated, with subtly divergent values, across
// components/ui/Badge.jsx (the cva chip primitive) and components/TrustBadge.jsx (the
// inspect chip), plus collapsed tones in DeployDisclosure / TransparencyModal. That
// duplication is exactly how the full-zk-rendered-as-sky and oracle-rendered-as-sky
// drifts happened. This module is the one place the chip colors live.
//
// SACRED HUE PER KIND (the load-bearing invariant, pinned by enforcement-palette.test.js):
//   onchain    = emerald  (Kaspa consensus enforces, the strongest signal)
//   onchainzk  = teal     (KIP-16 zk_game_settle: Groth16 verified ON-CHAIN by consensus; testnet)
//   hybrid     = sky      (on-chain script + an external-resolver input the chain cannot decide)
//   oracle     = amber    (external resolver signature, never Covex)
//   fullzk     = violet   (real Groth16 proof verified OFF-CHAIN by an external verifier)
//   decorative = slate    (metadata only, no enforcement)
// The exact opacity differs by surface (a chip vs a disclosure panel), but the hue
// FAMILY must never drift. The test asserts both this module and Badge.jsx agree.
//
// CVA / TAILWIND-JIT NOTE: components/ui/Badge.jsx keeps its honesty variant classes as
// inline cva literals on purpose. Tailwind's JIT only emits classes it can see as literal
// strings in source, and cva needs its variant map inline. So Badge stays the literal cva
// definition and is kept honest by the drift-guard test (Badge variant hue === this
// module's hue for the matching kind), rather than importing dynamic class strings (which
// the JIT would not emit). TrustBadge.jsx, which built its own map, now imports from here.
//
// No em dashes anywhere in this module by design (matches the honesty-copy byte gate).

import { ShieldCheck, Radio, ShieldQuestion, Link2 } from './icons.js';

// The canonical enforcement-reality kinds, as returned by TrustBadge.trustInfo().
export const ENFORCEMENT_KINDS = ['onchain', 'onchainzk', 'hybrid', 'oracle', 'fullzk', 'decorative'];

// Sacred hue family per kind. Tests pin this; never alias two kinds to one hue.
export const KIND_HUE = {
  onchain: 'emerald',
  onchainzk: 'teal',
  hybrid: 'sky',
  oracle: 'amber',
  fullzk: 'violet',
  decorative: 'slate',
};

// Maps the canonical kind to Badge.jsx's cva variant key (the chip primitive uses the
// hyphenated vocabulary). Used by the drift-guard test to assert both primitives agree.
export const KIND_TO_BADGE_VARIANT = {
  onchain: 'on-chain',
  onchainzk: 'on-chain-zk',
  hybrid: 'hybrid',
  oracle: 'oracle',
  fullzk: 'full-zk',
  decorative: 'decorative',
};

// TrustBadge inspect-chip color classes (relocated verbatim from TrustBadge.jsx so the
// chip renders byte-identically; every kind carries explicit light: overrides so the
// honesty palette stays >= 4.5:1 against white and on-chain reads strongest in BOTH themes).
export const TRUSTBADGE_STYLES = {
  onchain: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-600/60',
  // on-chain-zk gets its own TEAL styling so the KIP-16 consensus-verified ZK tier reads as a
  // distinct, on-chain-verified guarantee (not the off-chain violet full-zk, not emerald on-chain).
  onchainzk: 'bg-teal-500/10 border-teal-500/30 text-teal-300 light:bg-teal-50 light:text-teal-700 light:border-teal-600/60',
  hybrid: 'bg-sky-500/10 border-sky-500/30 text-sky-300 light:bg-sky-50 light:text-sky-700 light:border-sky-600/60',
  oracle: 'bg-amber-500/10 border-amber-500/30 text-amber-300 light:bg-amber-50 light:text-amber-700 light:border-amber-600/60',
  // full-zk gets its own violet styling so the honesty hierarchy (on-chain > full-zk > oracle >
  // decorative) reads at a glance. Aliasing it to oracle would visually equate a Groth16 proof
  // with a bare signature.
  fullzk: 'bg-violet-500/10 border-violet-500/30 text-violet-300 light:bg-violet-50 light:text-violet-700 light:border-violet-600/60',
  decorative: 'bg-white/[0.04] border-white/10 text-gray-300 light:bg-slate-100 light:border-slate-300 light:text-slate-600',
};

// Icon per kind. on-chain / on-chain-zk / full-zk all read as a verified shield; hybrid is a
// link (script + external input); oracle is a radio (a signed attestation); decorative is a
// question mark (no enforcement).
export const KIND_ICON = {
  onchain: ShieldCheck,
  onchainzk: ShieldCheck,
  hybrid: Link2,
  oracle: Radio,
  fullzk: ShieldCheck,
  decorative: ShieldQuestion,
};

// Abbreviated labels for tight contexts (Explorer card header at 375px). The honest meaning
// is preserved by the palette + the Transparency modal behind the click; only the word is
// shortened so the full chip group fits one row at the narrowest viewport. Never aliases kinds.
export const COMPACT_LABEL = {
  onchain: 'ON-CHAIN',
  onchainzk: 'ON-CHAIN ZK',
  hybrid: 'HYBRID',
  oracle: 'ORACLE',
  fullzk: 'FULL-ZK',
  decorative: 'METADATA',
};
