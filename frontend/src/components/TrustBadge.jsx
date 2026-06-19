import { useState } from 'react';
import { ShieldCheck, Radio, ShieldQuestion, Link2, Info, ChevronRight } from 'lucide-react';
import TransparencyModal from './TransparencyModal';
import { isChainEnforcedZk } from '../lib/zk/circuits';
import { REALITY_BADGE_LABEL, REALITY_BODY } from '../lib/enforcement-copy';

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
 *   hybrid     = sky      (script + oracle input)
 *   oracle     = amber    (Covex oracle signature, not chain-gated)
 *   full-zk    = violet   (real proof, oracle-verified fail-closed)
 *   decorative = slate    (metadata only, no enforcement)
 * The classes below already match this palette - TrustBadge has always used
 * amber for oracle, so no visual change is required after the Badge.jsx
 * alignment, only this pin to prevent future drift.
 */
// A single binary_oracle_select covenant is one LEG of a parimutuel market, not a
// bare on-chain primitive: its custody is script-locked but WHICH side wins is set by
// the secret the disclosed oracle reveals. It must read as a market, never "no trust".
const isMarketLeg = (covenant) => /binary_oracle_select/.test(covenant?.covenant_type || '');

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

// Build the chain-enforced-ZK trust info from enforcement-copy so the label + body
// (and therefore the aria-label / tooltip / TransparencyModal copy on the way down)
// stay byte-identical with the rest of the honesty surface. NEVER soften: this is the
// 4-of-19 carve-out where the Groth16 proof reduces to a hashlock Kaspa actually checks.
function fullZkChainInfo() {
  return {
    kind: 'fullzkchain',
    label: REALITY_BADGE_LABEL['full-zk-chain'], // "Chain-enforced ZK"
    desc: REALITY_BODY['full-zk-chain'],
  };
}

function fullZkInfo() {
  return {
    kind: 'fullzk',
    label: 'ZK proof, oracle-verified',
    desc: 'A real Groth16 proof, verified fail-closed by the disclosed Covex oracle. Not on-chain consensus and not trustless, but a stronger guarantee than a bare attestation.',
  };
}

// Accepts EITHER (covenant) for back-compat, OR (covenant, { reality, circuitId })
// where the explicit props override what we would derive. circuitId is what lets us
// branch full-zk into the chain-enforced 4 vs the oracle-cosigned 15: callers that
// already know the circuit (sandbox, terminal) can pass it directly; Explorer/Markets
// pass only the covenant and we read it off custom_ui_config.
export function trustInfo(covenant, opts) {
  const explicitReality = opts && opts.reality;
  const explicitCircuit = opts && opts.circuitId;
  const reality = explicitReality || covenant?.enforcement_reality;
  const circuitId = explicitCircuit || circuitIdOf(covenant);

  // Parimutuel markets are a hybrid: custody and every payout leg are on-chain
  // (P2SH, hashlock + winner key), but WHICH outcome wins is set by the single
  // committed secret the disclosed oracle reveals. Never claim "no trust".
  if (!explicitReality && (covenant?.covenant_type === 'prediction-market' || isMarketLeg(covenant))) {
    return {
      kind: 'hybrid',
      label: 'On-chain custody, oracle-resolved',
      desc: 'Every payout leg is script-locked on-chain, but which outcome wins is decided by the secret the disclosed Covex oracle reveals. On-chain-enforced, not trustless.',
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
      desc: 'An on-chain script gates release but checks an oracle-supplied input.',
    };
  }
  // Explicit chain-enforced-ZK reality OR a full-zk circuit that is in the 4-of-19 set
  // whose proof reduces to a hashlock the chain itself checks. THIS is the honesty pivot:
  // collapsing all 19 to one violet pill hid the fact that only 4 are end-to-end.
  if (reality === 'full-zk-chain') {
    return fullZkChainInfo();
  }
  if (reality === 'full-zk') {
    return isChainEnforcedZk(circuitId) ? fullZkChainInfo() : fullZkInfo();
  }
  if (reality === 'oracle-attested') {
    return {
      kind: 'oracle',
      label: 'Oracle attested',
      desc: 'The outcome is asserted by the Covex oracle signature. Funds are not script-gated to it yet.',
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
  // fail-closed: tag it full-zk (chain-enforced if in the 4-set) so the
  // 4-tier hierarchy survives even when the reality field is missing.
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if (circuitId && circuitId !== 'none') {
    return isChainEnforcedZk(circuitId) ? fullZkChainInfo() : fullZkInfo();
  }
  if (/zk|oracle|chess|turn_timer|range|merkle|game|predict/.test(cat)) {
    return {
      kind: 'oracle',
      label: 'Oracle attested',
      desc: 'Outcomes are attested and signed by the Covex oracle.',
    };
  }
  return {
    kind: 'decorative',
    label: 'Metadata only',
    desc: 'The chain does not enforce this covenant outcome.',
  };
}

// Abbreviated labels for tight contexts (Explorer card header at 375px). The
// honest meaning is preserved by the styling palette + the Transparency modal
// behind the click; we just shorten the word so the full chip group still fits
// on one row at the narrowest supported viewport. Never aliases across kinds.
const COMPACT_LABEL = {
  onchain: 'ON-CHAIN',
  hybrid: 'HYBRID',
  oracle: 'ORACLE',
  fullzk: 'FULL-ZK',
  // Chain-enforced ZK reads as a stronger claim than plain full-zk and must NOT
  // be aliased back to 'FULL-ZK' even at 375px. The emerald edge does the heavy
  // lifting visually; the compact text just shortens "Chain-enforced ZK".
  fullzkchain: 'ZK ON-CHAIN',
  decorative: 'METADATA',
};

export default function TrustBadge({ covenant, size = 'sm', showDesc = false, inspect = true, compact = false, reality, circuitId }) {
  const [open, setOpen] = useState(false);
  // Pass explicit overrides through so callers that already know the reality /
  // circuit (sandbox, terminal) don't have to construct a fake covenant.
  const t = trustInfo(covenant, { reality, circuitId });
  const styles = {
    onchain: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-600/60',
    hybrid: 'bg-sky-500/10 border-sky-500/30 text-sky-300 light:bg-sky-50 light:text-sky-700 light:border-sky-600/60',
    oracle: 'bg-amber-500/10 border-amber-500/30 text-amber-300 light:bg-amber-50 light:text-amber-700 light:border-amber-600/60',
    // full-zk gets its own violet styling so the 4-tier honesty hierarchy
    // (on-chain > full-zk > oracle > decorative) reads at a glance. Aliasing
    // it to oracle would visually equate a Groth16 proof with a bare signature.
    fullzk: 'bg-violet-500/10 border-violet-500/30 text-violet-300 light:bg-violet-50 light:text-violet-700 light:border-violet-600/60',
    // Chain-enforced ZK = same violet base (still a ZK proof) PLUS an emerald
    // left edge and chevron, signalling the carve-out that this 4-of-19 circuit
    // reduces to a hashlock Kaspa itself checks. The emerald shadow + ring works
    // in both light and dark so we don't fork the rule.
    fullzkchain: 'bg-violet-500/10 border-violet-500/30 text-violet-300 light:bg-violet-50 light:text-violet-700 light:border-violet-600/60 border-l-2 border-l-emerald-400 light:border-l-emerald-600 shadow-[inset_2px_0_0_0_rgba(16,185,129,0.35)]',
    decorative: 'bg-white/[0.04] border-white/10 text-gray-300 light:bg-slate-100 light:border-slate-300 light:text-slate-600',
  }[t.kind];
  const Icon = { onchain: ShieldCheck, hybrid: Link2, oracle: Radio, fullzk: ShieldCheck, fullzkchain: ShieldCheck, decorative: ShieldQuestion }[t.kind];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs';
  const label = compact ? COMPACT_LABEL[t.kind] : t.label;
  // Honest aria-label: screen readers get the full reality phrase (not "FULL-ZK"
  // compacted text), so the chain-enforced carve-out reads correctly even when
  // the badge is the compact 375px variant where the chevron is the only visual hint.
  const aria = `${t.label}. ${t.desc}`;
  const inner = (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wider ${pad} ${styles} ${inspect ? 'cursor-pointer hover:brightness-110 transition' : ''}`}
      title={compact ? t.label : undefined}
      aria-label={aria}>
      <Icon size={size === 'sm' ? 11 : 14} /> {label}
      {/* Emerald chevron for the chain-enforced ZK carve-out: same colour as the
          left edge so the "stronger than plain full-zk" signal is consistent. */}
      {t.kind === 'fullzkchain' && (
        <ChevronRight
          size={size === 'sm' ? 11 : 14}
          className="text-emerald-400 light:text-emerald-600 -ml-0.5"
          aria-hidden="true"
        />
      )}
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
