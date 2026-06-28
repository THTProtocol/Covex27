import { useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, ShieldCheck, Radio, Cpu, Coins, Gamepad2, Fingerprint, Lock, ChevronDown, Check, ArrowUpRight, Info, Eye, X } from 'lucide-react';
import TransparencyModal from './TransparencyModal';
import SandboxCircuitPreview from './SandboxCircuitPreview';
import { HEADLINE_GAME_CIRCUITS, HEADLINE_GAME_CIRCUIT_SET } from '../lib/playableGames';

// Lazy: the example-page preview pulls the Puck render bundle. Loading it only when
// a visitor opens "See an example" keeps the Sandbox initial load lean.
const CircuitExamplePreview = lazy(() => import('./CircuitExamplePreview'));

// Lightweight load-time entrance for the on-load circuit grids: cards fade + rise 12px,
// staggered. Drop-in layer that never touches the CircuitCard internals or its hover-lift.
const GRID_STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const CARD_RISE = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] } } };

// SandboxGallery: a category-organized, progressive-disclosure picker over every covenant
// circuit/primitive. Each category shows a curated few cards up front with a "View more" button
// to reveal the rest, so the page reads cleanly at first glance instead of a long flat list.
// Selecting a card drives the whole sandbox live (banner + preview + builder follow).

// ZK realities: 'full-zk' / 'hybrid' circuits are presented as oracle-attested (Kaspa has no
// on-chain pairing verifier, so the proof is never checked on-chain). No circuit's proof is bound
// to a chain-checked hashlock, so none paint a stronger-than-oracle ZK chip. No standalone green
// "ZK" badge is ever rendered for an oracle-cosigned-only circuit.
const REALITY_META = {
  'full-zk': { short: 'Oracle', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  'on-chain': { short: 'On-chain', accent: '#34d399', text: 'text-emerald-300', bg: 'bg-emerald-500/12', border: 'border-emerald-500/35' },
  hybrid: { short: 'Oracle', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  'oracle-attested': { short: 'Oracle', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  decorative: { short: 'Meta', accent: '#9ca3af', text: 'text-gray-300', bg: 'bg-white/[0.06]', border: 'border-white/15' },
};
const rm = (r) => REALITY_META[r] || REALITY_META['oracle-attested'];

// Curated category groups. Each circuit lands in exactly ONE group (first match wins); the final
// catch-all group sweeps up anything uncategorised so nothing is ever hidden.
const GROUPS = [
  { key: 'zk', title: 'Zero-knowledge', icon: ShieldCheck, match: (c) => c.reality === 'full-zk' || c.category === 'crypto' || c.category === 'privacy' },
  { key: 'oracle', title: 'Oracle & conditional outcomes', icon: Radio, match: (c) => c.category === 'oracle' },
  { key: 'defi', title: 'DeFi & lending', icon: Coins, match: (c) => c.category === 'defi' },
  { key: 'game', title: 'Two-party covenants', icon: Gamepad2, match: (c) => c.category === 'game' },
  { key: 'identity', title: 'Identity & gating', icon: Fingerprint, match: (c) => c.category === 'identity' || c.category === 'gating' },
  { key: 'compute', title: 'Verifiable compute', icon: Cpu, match: (c) => c.category === 'compute' },
  { key: 'other', title: 'Primitives & timelocks', icon: Lock, match: () => true },
];

const INITIAL = 6; // cards shown per category before "View more" (two full rows of 3, balanced)

// The 7 genuine on-chain primitives: their redeem script is enforced by Kaspa consensus, so they
// route to the real enforced-deploy builder (NOT the ZK/oracle look-alikes). Honest label = on-chain.
// kind ids match EnforcedDeploy's KINDS array so ?kind= preloads the right builder.
const ONCHAIN_PRIMITIVES = [
  { kind: 'hashlock', label: 'Hashlock' },
  { kind: 'timelock', label: 'Timelock (CLTV)' },
  { kind: 'relative_timelock', label: 'Relative timelock (CSV)' },
  // The multi-party primitives are genuinely consensus-enforced, but on this platform their
  // demo deploys via server-assisted dev wallets (the builder discloses this). Mark
  // them so the section never reads as if every chip is a non-custodial deploy.
  { kind: 'htlc', label: 'HTLC', demo: true },
  { kind: 'channel', label: 'Payment channel', demo: true },
  { kind: 'deadman', label: "Dead-man's switch", demo: true },
  { kind: 'multisig', label: 'N-of-M multisig', demo: true },
];

function CircuitCard({ c, active, onSelect, onInspect, onExample }) {
  const m = rm(c.reality);
  return (
    <div
      className={`group relative rounded-xl border overflow-hidden hover-lift ${
        active
          ? 'border-kaspa-green/60 bg-kaspa-green/[0.08] ring-1 ring-kaspa-green/30 shadow-[0_0_22px_rgba(73,234,203,0.16)]'
          : 'border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent hover:border-white/[0.16] light:border-slate-200 light:from-slate-50 light:to-white light:hover:border-slate-300 light:shadow-sm'
      }`}
    >
      {/* Selecting is an explicit choice, not a CTA: the card body is the select target. */}
      <button onClick={() => onSelect(c.id)} title={`Select ${c.name}`} aria-pressed={active} className="block w-full text-left p-3 pb-1.5">
        <div className="relative flex items-start gap-2 pr-20">
          <span className={`text-sm font-bold leading-tight ${active ? 'text-kaspa-green' : 'text-white light:text-slate-900'}`}>{c.name}</span>
        </div>
        <p className="relative text-[11px] text-gray-400 light:text-slate-500 leading-snug mt-1 line-clamp-2 pr-2">{c.description}</p>
      </button>
      {/* See an example: opens a read-only render of the resulting page (or, for
          games, the resolution mini-flow) so the visitor previews before picking. */}
      <button
        type="button"
        onClick={() => onExample(c)}
        title="See an example: a read-only preview of the page this covenant lands in"
        className="mx-3 mb-2.5 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 light:text-slate-500 hover:text-kaspa-green transition-colors"
      >
        <Eye size={11} /> See an example
      </button>
      {/* Reality label + a SEPARATE inspect button. The label is a visible chip (text-[10px]),
          and the small (i) button is the only inspect trigger so the two affordances are distinct. */}
      <div className="absolute top-2 right-2 inline-flex items-center gap-1 z-10">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${m.bg} ${m.text} ${m.border}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.accent }} /> {m.short}
        </span>
        <button
          type="button"
          onClick={() => onInspect(c)}
          aria-label={`How is ${c.name} verified? Inspect the source`}
          title="How is this verified? Press to inspect the source"
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border transition hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/60 ${m.bg} ${m.text} ${m.border}`}
        >
          <Info size={11} />
        </button>
      </div>
      {active && <Check size={13} className="text-kaspa-green absolute bottom-2.5 right-2.5" />}
    </div>
  );
}

// Modal: a read-only example of what a circuit produces. Games (and pot-style
// categories) show the SandboxCircuitPreview resolution mini-flow, which is the
// honest "what happens" view; everything else shows a scaled, read-only render of
// the covenant website the circuit lands in. Hoisted so it never remounts.
function CircuitExampleModal({ circuit, onClose }) {
  // Only genuine games get the pot / payout resolution preview. The old `|| reality ===
  // 'decorative'` also pulled every metadata-only circuit into the game flow, which was wrong:
  // a decorative-reality circuit is not a game and should show the page preview, not a pot split.
  const isGame = circuit?.category === 'game';
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Example: ${circuit?.name || 'covenant'}`} className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 light:border-slate-200 bg-[#0a0a0f] light:bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-white/[0.08] light:border-slate-200 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-black text-white light:text-slate-900 flex items-center gap-2"><Eye size={15} className="text-kaspa-green shrink-0" /> Example: {circuit?.name}</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5 truncate">{isGame ? 'How this resolves. Read-only preview, no wallet.' : 'A read-only preview of the page this covenant lands in.'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white light:hover:text-slate-900 shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
          {isGame ? (
            <SandboxCircuitPreview circuit={circuit} kind="game" />
          ) : (
            <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-500 light:text-slate-600">Loading preview...</div>}>
              <CircuitExamplePreview circuit={circuit} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SandboxGallery({ circuits, selectedId, onSelect }) {
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState({});
  const [infoCircuit, setInfoCircuit] = useState(null);
  const [exampleCircuit, setExampleCircuit] = useState(null);
  const prefersReduced = useReducedMotion();

  const grouped = useMemo(() => {
    const g = Object.fromEntries(GROUPS.map((x) => [x.key, []]));
    for (const c of circuits) {
      const grp = GROUPS.find((x) => x.match(c)) || GROUPS[GROUPS.length - 1];
      g[grp.key].push(c);
    }
    // Strongest honest signals first within each group: full-zk > everything else. Stable
    // comparator (returns 0 for ties) keeps original catalog order otherwise.
    const rank = (r) => (r === 'full-zk' ? 1 : 0);
    for (const k in g) g[k].sort((a, b) => rank(b.reality) - rank(a.reality));
    return g;
  }, [circuits]);

  // Games split: the ~8 with a real FullScreen arena (HEADLINE_GAME_CIRCUITS, the
  // playable set) lead the section; the ~47 technical/proof variants collapse behind
  // an "Advanced game circuits" expander. The headline cards keep their canonical
  // playable order (not the generic full-zk sort) so the lobby reads the same way the
  // arena does. Everything stays buildable - the advanced set is only demoted, never
  // removed. Computed even when no game group is present (cheap; empty arrays).
  const gameSplit = useMemo(() => {
    const items = grouped.game || [];
    const byId = new Map(items.map((c) => [c.id, c]));
    const headline = HEADLINE_GAME_CIRCUITS.map((id) => byId.get(id)).filter(Boolean);
    const advanced = items.filter((c) => !HEADLINE_GAME_CIRCUIT_SET.has(c.id));
    return { headline, advanced };
  }, [grouped]);

  const s = q.trim().toLowerCase();
  const searchResults = s ? circuits.filter((c) => `${c.name} ${c.id} ${c.description} ${c.category}`.toLowerCase().includes(s)) : null;

  return (
    <div>
      {infoCircuit && <TransparencyModal circuit={infoCircuit} onClose={() => setInfoCircuit(null)} />}
      {exampleCircuit && <CircuitExampleModal circuit={exampleCircuit} onClose={() => setExampleCircuit(null)} />}
      <div className="flex items-center gap-2 mb-5 rounded-xl border border-white/10 bg-black/30 light:border-slate-200 light:bg-white light:shadow-sm px-3.5 py-2.5 max-w-md">
        <Search size={15} className="text-gray-400 light:text-slate-500 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search all covenants, circuits, games…"
          className="flex-1 bg-transparent text-sm text-white light:text-slate-900 placeholder:text-gray-500 light:placeholder:text-slate-400 outline-none"
        />
        {s && <span className="text-[10px] text-gray-500 light:text-slate-500 tabular-nums shrink-0">{searchResults.length}</span>}
      </div>

      {searchResults ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {searchResults.map((c) => <CircuitCard key={c.id} c={c} active={c.id === selectedId} onSelect={onSelect} onInspect={setInfoCircuit} onExample={setExampleCircuit} />)}
          {searchResults.length === 0 && <div className="text-sm text-gray-500 light:text-slate-500 py-8 col-span-full text-center">No covenants match your search.</div>}
        </div>
      ) : (
        <div className="space-y-7">
          {GROUPS.map((grp) => {
            const items = grouped[grp.key];
            if (!items.length) return null;

            // Games render specially: LEAD with the playable arena games (headline),
            // then collapse the technical/proof variants behind their own expander so
            // a visitor who clicked "Create a game" sees the real games first.
            if (grp.key === 'game') {
              const { headline, advanced } = gameSplit;
              const advOpen = expanded.gameAdvanced;
              // Fallback: if the headline set somehow resolved empty (catalog filtered
              // to a subset that excludes them), show the full list rather than nothing.
              const lead = headline.length ? headline : items;
              const rest = headline.length ? advanced : [];
              return (
                <section key={grp.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-7 h-7 rounded-lg bg-kaspa-green/10 light:bg-emerald-50 border border-kaspa-green/25 light:border-emerald-200 flex items-center justify-center">
                      <grp.icon size={14} className="text-kaspa-green light:text-emerald-700" />
                    </span>
                    <h3 className="text-sm font-bold text-white light:text-slate-900 tracking-tight">Playable games</h3>
                    <span className="text-[10px] text-gray-500 light:text-slate-500 tabular-nums">{lead.length}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 light:text-slate-600 leading-snug mb-3 max-w-xl">
                    Each of these opens a real interactive arena - pick one, set the stake, share the link, your opponent joins by matching it. Server-authoritative engine, oracle co-signed result (not trustless), winner takes the pot minus the creator fee.
                  </p>
                  <motion.div
                    className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
                    variants={prefersReduced ? undefined : GRID_STAGGER}
                    initial={prefersReduced ? false : 'hidden'}
                    animate={prefersReduced ? false : 'show'}
                  >
                    {lead.map((c) => (
                      <motion.div key={c.id} variants={prefersReduced ? undefined : CARD_RISE}>
                        <CircuitCard c={c} active={c.id === selectedId} onSelect={onSelect} onInspect={setInfoCircuit} onExample={setExampleCircuit} />
                      </motion.div>
                    ))}
                  </motion.div>
                  {rest.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => setExpanded((m) => ({ ...m, gameAdvanced: !advOpen }))}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-colors"
                      >
                        {advOpen ? 'Hide advanced game circuits' : `Advanced game circuits (${rest.length})`}
                        <ChevronDown size={14} className={`transition-transform ${advOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {advOpen && (
                        <>
                          <p className="text-[11px] text-gray-500 light:text-slate-500 leading-snug mt-2 mb-3 max-w-xl">
                            Per-game proof circuits and game variants (chess clocks, poker hand-rank proofs, board games without an arena yet, shared VRF/timer primitives). Buildable as covenants, but they do not open a playable arena.
                          </p>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {rest.map((c) => (
                              <CircuitCard key={c.id} c={c} active={c.id === selectedId} onSelect={onSelect} onInspect={setInfoCircuit} onExample={setExampleCircuit} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              );
            }

            const open = expanded[grp.key];
            const visible = open ? items : items.slice(0, INITIAL);
            return (
              <section key={grp.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-kaspa-green/10 light:bg-emerald-50 border border-kaspa-green/25 light:border-emerald-200 flex items-center justify-center">
                    <grp.icon size={14} className="text-kaspa-green light:text-emerald-700" />
                  </span>
                  <h3 className="text-sm font-bold text-white light:text-slate-900 tracking-tight">{grp.title}</h3>
                  <span className="text-[10px] text-gray-500 light:text-slate-500 tabular-nums">{items.length}</span>
                </div>
                <motion.div
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
                  variants={prefersReduced ? undefined : GRID_STAGGER}
                  initial={prefersReduced ? false : 'hidden'}
                  animate={prefersReduced ? false : 'show'}
                >
                  {visible.map((c) => (
                    <motion.div key={c.id} variants={prefersReduced ? undefined : CARD_RISE}>
                      <CircuitCard c={c} active={c.id === selectedId} onSelect={onSelect} onInspect={setInfoCircuit} onExample={setExampleCircuit} />
                    </motion.div>
                  ))}
                </motion.div>
                {items.length > INITIAL && (
                  <button
                    onClick={() => setExpanded((m) => ({ ...m, [grp.key]: !open }))}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-kaspa-green hover:text-kaspa-green/80 transition-colors"
                  >
                    {open ? 'Show less' : `View more (${items.length - INITIAL})`}
                    <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </section>
            );
          })}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 light:bg-emerald-50 border border-emerald-500/30 light:border-emerald-200 flex items-center justify-center">
                <ShieldCheck size={14} className="text-emerald-300 light:text-emerald-700" />
              </span>
              <h3 className="text-sm font-bold text-white light:text-slate-900 tracking-tight">On-chain enforced primitives</h3>
              <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/12 light:bg-emerald-100 text-emerald-300 light:text-emerald-700 border border-emerald-500/35 light:border-emerald-200">On-chain</span>
            </div>
            <p className="text-[11px] text-gray-400 light:text-slate-600 leading-snug mb-3 max-w-xl">
              These seven are enforced by Kaspa consensus: the redeem script itself releases the funds, not an oracle or proof. Open the real on-chain builder rather than a ZK or oracle look-alike. The ones marked demo deploy via server-assisted dev wallets on this platform; the single-key ones (hashlock, timelock, CSV) deploy non-custodially.
            </p>
            <div className="flex flex-wrap gap-2 max-w-2xl">
              {ONCHAIN_PRIMITIVES.map((p) => (
                <Link
                  key={p.kind}
                  to={`/deploy/enforced?kind=${p.kind}`}
                  title={p.demo ? `Deploy ${p.label} - on-chain enforced (server-assisted dev-wallet demo on this platform)` : `Deploy ${p.label} - on-chain enforced, non-custodial`}
                  className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] text-[12px] font-semibold text-emerald-200 hover:border-emerald-400/60 hover:bg-emerald-500/[0.12] hover:text-emerald-100 transition-all"
                >
                  <Lock size={11} className="opacity-70" />
                  {p.label}
                  {p.demo && (
                    <span className="text-[9px] uppercase tracking-wide font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">demo</span>
                  )}
                  <ArrowUpRight size={12} className="opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
