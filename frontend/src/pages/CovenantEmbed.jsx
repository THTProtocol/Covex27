import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ExternalLink, Cpu, Lock, Radio, FileText, ArrowUpRight } from 'lucide-react';
import { formatKas } from '../lib/format.js';

// Embeddable covenant widget. Designed to be dropped into ANY external website via an
// <iframe src="https://hightable.pro/embed/covenant/:id">. It is deliberately READ-ONLY:
// it shows the live, on-chain covenant and a single call-to-action that opens the full
// covenant page ON COVEX in a new tab, where the visitor's own wallet signs. No wallet
// connection or signing ever happens inside the frame, so a hostile embedder cannot
// clickjack a transaction. The usage flows through Covex; the widget is just the doorway.

const REALITY = {
  'on-chain': { label: 'On-chain enforced', icon: Lock, dot: '#34d399', text: 'text-emerald-300', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.35)' },
  hybrid: { label: 'Hybrid proof', icon: Cpu, dot: '#60a5fa', text: 'text-blue-300', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.35)' },
  'oracle-attested': { label: 'Resolver-attested', icon: Radio, dot: '#fbbf24', text: 'text-amber-300', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)' },
  decorative: { label: 'Metadata', icon: FileText, dot: '#9ca3af', text: 'text-gray-300', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.30)' },
};
const realityOf = (r) => REALITY[r] || REALITY['oracle-attested'];

// VALUE LOCKED + count + short-hash formatting come from the shared lib/format.js
// so the embed reads the same real on-chain figure, the same compact K/M, and the
// same canonical ellipsis as the Explorer and the wallet pill.

export default function CovenantEmbed() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';
  const network = params.get('network') || 'mainnet';
  const [cov, setCov] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | error

  useEffect(() => {
    let alive = true;
    fetch(`/api/covenants/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((j) => { if (!alive) return; const c = j.covenant || j; if (c && (c.tx_id || c.name)) { setCov(c); setState('ok'); } else { setState('error'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [id, network]);

  const dark = theme === 'dark';
  const covexUrl = `${window.location.origin}/covenant/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`;
  const shell = dark
    ? { bg: '#06070b', card: 'rgba(255,255,255,0.03)', cardBorder: 'rgba(255,255,255,0.08)', title: '#fff', sub: '#9ca3af', faint: '#6b7280' }
    : { bg: '#f6f8fb', card: '#ffffff', cardBorder: 'rgba(15,23,42,0.08)', title: '#0f172a', sub: '#475569', faint: '#94a3b8' };

  const rm = cov ? realityOf(cov.enforcement_reality) : null;
  const RIcon = rm ? rm.icon : ShieldCheck;
  const name = cov?.name && cov.name !== cov?.covenant_type ? cov.name : (cov?.covenant_type || 'Covenant');
  const desc = (cov?.description || cov?.full_logic_summary || 'A covenant on the Kaspa BlockDAG. Open it on Covex to connect your wallet and interact non-custodially.').slice(0, 160);

  // Portal to <body> so the full-bleed overlay escapes the app shell's `relative z-10`
  // stacking context (otherwise the fixed nav at z-40 renders ABOVE it and the embed is
  // not chrome-free). This makes the widget cover the whole frame on any external site.
  return createPortal(
    <div className="fixed inset-0 z-[2147483600] overflow-y-auto flex items-center justify-center p-3" style={{ background: shell.bg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="covex-aurora" aria-hidden="true" style={{ top: '20%', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 360, height: 200, maxWidth: '90vw', opacity: 0.5 }} />

      <div className="relative w-full max-w-[400px] rounded-2xl border overflow-hidden" style={{ background: shell.card, borderColor: shell.cardBorder, boxShadow: dark ? '0 24px 60px -28px rgba(73,234,203,0.35)' : '0 18px 50px -24px rgba(15,23,42,0.25)' }}>
        {/* accent top edge */}
        <div aria-hidden="true" style={{ height: 3, background: 'linear-gradient(90deg, transparent, #49EACB, transparent)' }} />

        <div className="p-5">
          {state === 'loading' && (
            <div className="flex items-center justify-center py-14">
              <div className="w-7 h-7 rounded-full border-2 border-kaspa-green/30 border-t-kaspa-green animate-spin" />
            </div>
          )}

          {state === 'error' && (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold" style={{ color: shell.title }}>Covenant not found</p>
              <p className="text-xs mt-1" style={{ color: shell.sub }}>It may be on a different network, or not yet indexed.</p>
              <a href={covexUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-kaspa-green hover:underline">
                Open on Covex <ArrowUpRight size={13} />
              </a>
            </div>
          )}

          {state === 'ok' && cov && (
            <>
              {/* header */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(73,234,203,0.10)', border: '1px solid rgba(73,234,203,0.25)' }}>
                  <RIcon size={20} className="text-kaspa-green" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-extrabold leading-tight truncate" style={{ color: shell.title }}>{name}</h1>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border" style={{ color: rm.dot, background: rm.bg, borderColor: rm.border }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: rm.dot }} /> {rm.label}
                    </span>
                    {(cov.verified_tier && cov.verified_tier !== 'FREE') && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: '#0b0d14', background: '#49EACB' }}>
                        <ShieldCheck size={10} /> {cov.verified_tier}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: shell.sub }}>{desc}</p>

              {/* Value-locked hero - the real on-chain pot, leading like the Explorer card.
                  Honest by source: reads cov.amount_kaspa from the indexed covenant. */}
              <div className="mt-3 flex items-end justify-between gap-3 rounded-xl px-3 py-2.5 border" style={{ background: dark ? 'rgba(73,234,203,0.05)' : 'rgba(73,234,203,0.07)', borderColor: dark ? 'rgba(73,234,203,0.18)' : 'rgba(73,234,203,0.25)' }}>
                <div className="min-w-0">
                  <div className="text-[8.5px] uppercase tracking-[0.16em] font-bold mb-0.5" style={{ color: shell.faint }}>Value Locked</div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-xl font-black leading-none tracking-tight" style={{ color: shell.title }}>{formatKas(cov.amount_kaspa || 0)}</span>
                    <span className="text-[10px] font-bold" style={{ color: shell.sub }}>KAS</span>
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border" style={cov.is_active === false ? { color: shell.faint, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)', borderColor: shell.cardBorder } : { color: '#34d399', background: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.30)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cov.is_active === false ? '#9ca3af' : '#34d399' }} />
                  {cov.is_active === false ? 'Settled' : 'Active'}
                </span>
              </div>

              {cov.address && (
                <div className="mt-3 rounded-lg px-2.5 py-2 font-mono text-[10px] break-all" style={{ background: dark ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.04)', color: shell.faint }}>
                  {cov.address}
                </div>
              )}

              {/* CTA - opens Covex in a NEW TAB; all wallet signing happens there, never in this frame */}
              <a
                href={covexUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-shimmer mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
                style={{ background: '#49EACB', color: '#06281f' }}
              >
                Use this covenant on Covex <ExternalLink size={15} />
              </a>
              <p className="mt-2 text-center text-[10px]" style={{ color: shell.faint }}>
                Connect your own Kaspa wallet on Covex. Non-custodial - keys never leave your wallet.
              </p>
            </>
          )}

          {/* Powered by Covex */}
          <a href={window.location.origin} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-semibold tracking-wide hover:opacity-80 transition-opacity" style={{ color: shell.faint }}>
            <span className="w-1.5 h-1.5 rounded-full bg-kaspa-green" /> Powered by COVEX
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
