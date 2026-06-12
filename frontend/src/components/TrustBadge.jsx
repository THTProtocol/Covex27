import { ShieldCheck, Radio, ShieldQuestion } from 'lucide-react';

/**
 * Resolution-trust indicator. Derived from the covenant's configured circuit:
 * a real ZK circuit means proof-verified outcomes, otherwise outcomes are
 * oracle attested. Unconfigured covenants are marked plainly.
 */
export function trustInfo(covenant) {
  const cfg = covenant?.custom_ui_config;
  const circuit = (typeof cfg === 'object' && cfg?.circuit) || null;
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if (circuit && circuit !== 'none') {
    return { kind: 'zk', label: 'ZK verified', desc: `Outcomes are proven with the ${circuit} circuit and checked before the oracle signs.` };
  }
  if (/zk|oracle|chess|turn_timer|range|merkle/.test(cat)) {
    return { kind: 'oracle', label: 'Oracle attested', desc: 'Outcomes are attested and signed by the Covex oracle. The signature is verified on-chain at unlock.' };
  }
  return { kind: 'plain', label: 'On-chain script', desc: 'This covenant resolves purely by its on-chain script conditions.' };
}

export default function TrustBadge({ covenant, size = 'sm', showDesc = false }) {
  const t = trustInfo(covenant);
  const styles = {
    zk: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    oracle: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    plain: 'bg-white/[0.04] border-white/10 text-gray-300',
  }[t.kind];
  const Icon = { zk: ShieldCheck, oracle: Radio, plain: ShieldQuestion }[t.kind];
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
