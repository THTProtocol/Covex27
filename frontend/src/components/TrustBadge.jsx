/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
import { useState } from 'react';
import { Info } from '../lib/icons.js';
import { TRUSTBADGE_STYLES, KIND_ICON, COMPACT_LABEL } from '../lib/enforcement-palette.js';
import TransparencyModal from './TransparencyModal';

/**
 * Honest resolution-trust indicator. Driven by the covenant's server-computed
 * `enforcement_reality` (covex_catalog::reality_for_script): the chain either
 * enforces the spend condition (on-chain), an oracle asserts the outcome
 * (oracle-attested), or it is a metadata-only marker (decorative). We never imply
 * enforcement that is not there - a plain self-pay covenant reads "Metadata only",
 * not "On-chain script".
 *
 * CANONICAL ENFORCEMENT-REALITY PALETTE (must stay in sync with ui/Badge.jsx,
 * see that file's header for rationale). Honesty palette is load-bearing brand,
 * and these two primitives are the source of truth all other surfaces import
 * from (puckConfig's EnforcementBadge, Explorer cards, Sandbox panels).
 *   on-chain   = emerald  (Kaspa consensus enforces - strongest signal)
 *   on-chain-zk= teal     (KIP-16 zk_game_settle: Groth16 verified ON-CHAIN by consensus; gated until proven on Covex prover infra)
 *   hybrid     = sky      (script + external resolver input)
 *   oracle     = amber    (external resolver signature, not chain-gated)
 *   full-zk    = violet   (real Groth16 proof verified OFF-CHAIN, gating a 2-of-2 cosign + CSV timeout)
 *   decorative = slate    (metadata only, no enforcement)
 * The classes below already match this palette - TrustBadge has always used
 * amber for oracle, so no visual change is required after the Badge.jsx
 * alignment, only this pin to prevent future drift.
 */
// A single binary_oracle_select covenant is one LEG of a parimutuel market, not a
// bare on-chain primitive: its custody is script-locked but WHICH side wins is set by
// the secret the deployer-bound resolver reveals. It must read as a market, never "no trust".
const isMarketLeg = (covenant) => /binary_oracle_select/.test(covenant?.covenant_type || '');

// Detect the KIP-16 on-chain-ZK kind from covenant data WITHOUT a new backend enum: the redeem
// kind string is "zk_game_settle" (or "zk_game_settle:<min_sequence>"), and a live game pot may
// also carry settle_mode === 'zk_game_settle'. Any of these marks the on-chain-zk tier, whose
// Groth16 proof is verified by Kaspa consensus (OpZkPrecompile 0xa6), not an oracle.
const isZkGameSettle = (covenant) =>
  /(^|[^a-z])zk_game_settle/.test(
    `${covenant?.redeem_kind || ''} ${covenant?.covenant_type || ''} ${covenant?.kind || ''} ${covenant?.settle_mode || ''}`,
  );

// Resolve the circuit id off a covenant (custom_ui_config.circuit is the canonical slot;
// covenant.zk_circuit / covenant.circuit are tolerated for older callers).
function circuitIdOf(covenant) {
  if (!covenant) return null;
  const cfg = covenant.custom_ui_config;
  if (typeof cfg === 'object' && cfg && typeof cfg.circuit === 'string') return cfg.circuit;
  if (typeof covenant.zk_circuit === 'string') return covenant.zk_circuit;
  if (typeof covenant.circuit === 'string') return covenant.circuit;
  return null;
}

// SCOPED to the OFF-CHAIN circom circuits: all 19 of those verified ZK circuits are full-zk, a
// real Groth16 proof verified OFF-CHAIN (by you, the counterparty, or any external verifier)
// gating a 2-of-2 cosign + CSV timeout. No circom circuit's proof is bound to a chain-checked
// hashlock, and Kaspa has no on-chain pairing verifier on that path, so there is no
// "chain-enforced ZK" tier for them; the only on-chain check is the BIP340 Schnorr co-signature.
// The KIP-16 zk_game_settle kind is the SEPARATE on-chain-zk tier below, not a circom circuit.
function fullZkInfo() {
  return {
    kind: 'fullzk',
    label: 'ZK proof, verified off-chain',
    desc: 'A real Groth16 proof, verified off-chain by you, the counterparty, or any external verifier (snarkjs against the served vkey). Kaspa has no on-chain pairing verifier on this path, so the proof gates a 2-of-2 cosign + CSV timeout. Not on-chain consensus and not trustless, but a stronger guarantee than a bare attestation.',
  };
}

// The KIP-16 on-chain-ZK tier (zk_game_settle). Distinct from full-zk: the Groth16 proof is
// verified ON-CHAIN by Kaspa consensus via OpZkPrecompile (0xa6), with no oracle and no
// co-signature in the payout, so a loser cannot forge a win. Covex keeps this path GATED until it
// is proven on its own prover infrastructure, so the copy never reads as a live guarantee.
function onChainZkInfo() {
  return {
    kind: 'onchainzk',
    label: 'On-chain ZK (KIP-16)',
    desc: 'On-chain ZK (KIP-16): Groth16 verified by Kaspa consensus; no oracle or co-sign in payout. Gated until proven live on Covex prover infrastructure.',
  };
}

// Accepts EITHER (covenant) for back-compat, OR (covenant, { reality, circuitId })
// where the explicit props override what we would derive. All verified ZK circuits
// collapse to a single full-zk tier (oracle-verified off-chain); circuitId is still
// read so the TransparencyModal can name the circuit, but it no longer changes the tier.
export function trustInfo(covenant, opts) {
  const explicitReality = opts && opts.reality;
  const explicitCircuit = opts && opts.circuitId;
  const reality = explicitReality || covenant?.enforcement_reality;
  const circuitId = explicitCircuit || circuitIdOf(covenant);

  // On-chain-ZK (KIP-16 zk_game_settle) is its own distinct tier. Honor it whether the backend
  // exposes enforcement_reality === 'on-chain-zk' OR the covenant data carries the zk_game_settle
  // kind string (no new backend enum required). It outranks the other ZK/oracle branches because
  // its proof is verified by consensus, not off-chain.
  if (reality === 'on-chain-zk' || (!explicitReality && isZkGameSettle(covenant))) {
    return onChainZkInfo();
  }

  // Parimutuel markets are a hybrid: custody and every payout leg are on-chain
  // (P2SH, hashlock + winner key), but WHICH outcome wins is set by the single
  // committed secret the deployer-bound resolver reveals. Never claim "no trust".
  if (!explicitReality && (covenant?.covenant_type === 'prediction-market' || isMarketLeg(covenant))) {
    return {
      kind: 'hybrid',
      label: 'On-chain custody, resolver-decided',
      desc: 'Every payout leg is script-locked on-chain, but which outcome wins is decided by the secret the deployer-bound resolver reveals (an external oracle provider the deployer binds by pubkey at deploy; Covex never attests real-world facts). On-chain-enforced, not trustless.',
    };
  }
  if (reality === 'on-chain') {
    return {
      kind: 'onchain',
      label: 'On-chain enforced',
      desc: 'Kaspa consensus enforces the spend condition (script-locked). No oracle, no trust.',
    };
  }
  if (reality === 'hybrid') {
    return {
      kind: 'hybrid',
      label: 'Hybrid',
      desc: 'An on-chain script gates release but checks an input supplied by the deployer-bound resolver (an external resolver the deployer chooses; for two-party game pots the input today comes from the recomputable Covex-run referee engine). Not trustless: trust sits with that resolver.',
    };
  }
  // All verified ZK circuits are full-zk: a real Groth16 proof verified OFF-CHAIN
  // (by you, the counterparty, or any external verifier) gating a 2-of-2 cosign + CSV
  // timeout. No circuit reduces to a chain-checked hashlock, and Kaspa has no on-chain
  // pairing verifier, so there is no chain-enforced ZK reality - full-zk is the strongest ZK pill.
  if (reality === 'full-zk') {
    return fullZkInfo();
  }
  if (reality === 'oracle-attested') {
    return {
      kind: 'oracle',
      label: 'Resolver attested',
      desc: 'The outcome is asserted by the deployer-bound resolver signature (an external resolver the deployer chooses; for two-party game pots the outcome input today comes from the recomputable Covex-run referee engine). Covex does not attest real-world facts. Funds are not script-gated to it yet.',
    };
  }
  if (reality === 'decorative') {
    return {
      kind: 'decorative',
      label: 'Metadata only',
      desc: 'The chain does not enforce this covenant outcome. Not for value at stake.',
    };
  }
  // Fallback for older API responses that predate enforcement_reality. A
  // covenant declaring a non-none ZK circuit means a real proof is verified
  // fail-closed off-chain by an external verifier: tag it full-zk so the honesty
  // hierarchy survives even when the reality field is missing.
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if (circuitId && circuitId !== 'none') {
    return fullZkInfo();
  }
  if (/zk|oracle|chess|turn_timer|range|merkle|game|predict/.test(cat)) {
    return {
      kind: 'oracle',
      label: 'Resolver attested',
      desc: 'Outcomes are attested and signed by the deployer-bound resolver (an external resolver the deployer chooses; for two-party game pots the outcome input today comes from the recomputable Covex-run referee engine). Covex does not attest real-world facts.',
    };
  }
  return {
    kind: 'decorative',
    label: 'Metadata only',
    desc: 'The chain does not enforce this covenant outcome.',
  };
}

// COMPACT_LABEL, the chip color map (TRUSTBADGE_STYLES), and the per-kind icon (KIND_ICON)
// now live in lib/enforcement-palette.js, the single source of truth for the honesty color
// half. Importing them here is what keeps this chip in lockstep with ui/Badge.jsx and stops
// the palette drift that previously rendered full-zk and oracle in the wrong hue.

export default function TrustBadge({ covenant, size = 'sm', showDesc = false, inspect = true, compact = false, reality, circuitId }) {
  const [open, setOpen] = useState(false);
  // Pass explicit overrides through so callers that already know the reality /
  // circuit (sandbox, terminal) don't have to construct a fake covenant.
  const t = trustInfo(covenant, { reality, circuitId });
  const styles = TRUSTBADGE_STYLES[t.kind];
  const Icon = KIND_ICON[t.kind];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs';
  const label = compact ? COMPACT_LABEL[t.kind] : t.label;
  // Honest aria-label: screen readers get the full reality phrase (not "FULL-ZK"
  // compacted text), so the meaning reads correctly even in the compact 375px variant.
  const aria = `${t.label}. ${t.desc}`;
  const inner = (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wider ${pad} ${styles} ${inspect ? 'cursor-pointer hover:brightness-110 transition' : ''}`}
      title={compact ? t.label : undefined}
      aria-label={aria}>
      <Icon size={size === 'sm' ? 11 : 14} /> {label}
      {inspect && !compact && <Info size={size === 'sm' ? 10 : 12} className="opacity-50" />}
    </span>
  );
  return (
    <span className="inline-flex flex-col gap-1" title={inspect ? 'Press to see how this is verified' : t.desc}>
      {inspect ? (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} className="inline-flex text-left" aria-label={aria}>
          {inner}
        </button>
      ) : inner}
      {showDesc && <span className="text-[11px] text-gray-400 light:text-slate-500 max-w-xs leading-snug normal-case break-words">{t.desc}</span>}
      {open && <TransparencyModal covenant={covenant} onClose={() => setOpen(false)} />}
    </span>
  );
}
