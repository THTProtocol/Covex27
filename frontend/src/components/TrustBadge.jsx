import { ShieldCheck, Radio, ShieldQuestion, Link2 } from 'lucide-react';

/**
 * Honest resolution-trust indicator. Driven by the covenant's server-computed
 * `enforcement_reality` (covex_catalog::reality_for_script): the chain either
 * enforces the spend condition (on-chain), an oracle asserts the outcome
 * (oracle-attested), or it is a metadata-only marker (decorative). We never imply
 * enforcement that is not there - a plain self-pay covenant reads "Metadata only",
 * not "On-chain script".
 */
export function trustInfo(covenant) {
  const reality = covenant?.enforcement_reality;
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
  // Fallback for older API responses that predate enforcement_reality.
  const cfg = covenant?.custom_ui_config;
  const circuit = (typeof cfg === 'object' && cfg?.circuit) || null;
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if ((circuit && circuit !== 'none') || /zk|oracle|chess|turn_timer|range|merkle|game|predict/.test(cat)) {
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

export default function TrustBadge({ covenant, size = 'sm', showDesc = false }) {
  const t = trustInfo(covenant);
  const styles = {
    onchain: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    hybrid: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
    oracle: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    decorative: 'bg-white/[0.04] border-white/10 text-gray-300',
  }[t.kind];
  const Icon = { onchain: ShieldCheck, hybrid: Link2, oracle: Radio, decorative: ShieldQuestion }[t.kind];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs';
  return (
    <span className="inline-flex flex-col gap-1" title={t.desc}>
      <span className={`inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wider ${pad} ${styles}`}>
        <Icon size={size === 'sm' ? 11 : 14} /> {t.label}
      </span>
      {showDesc && <span className="text-[11px] text-gray-400 max-w-xs leading-snug normal-case">{t.desc}</span>}
    </span>
  );
}
