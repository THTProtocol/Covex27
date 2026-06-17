import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, ShieldCheck, Radio, Cpu, Coins, Gamepad2, Fingerprint, Lock, ChevronDown, Check, Layers, ArrowUpRight, Info } from 'lucide-react';
import TransparencyModal from './TransparencyModal';

// Lightweight load-time entrance for the on-load circuit grids: cards fade + rise 12px,
// staggered. Drop-in layer that never touches the CircuitCard internals or its hover-lift.
const GRID_STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const CARD_RISE = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] } } };

// SandboxGallery: a category-organized, progressive-disclosure picker over every covenant
// circuit/primitive. Each category shows a curated few cards up front with a "View more" button
// to reveal the rest, so the page reads cleanly at first glance instead of a long flat list.
// Selecting a card drives the whole sandbox live (banner + preview + builder follow).

const REALITY_META = {
  'full-zk': { short: 'ZK', accent: '#34d399', text: 'text-emerald-300', bg: 'bg-emerald-500/12', border: 'border-emerald-500/35' },
  'on-chain': { short: 'On-chain', accent: '#34d399', text: 'text-emerald-300', bg: 'bg-emerald-500/12', border: 'border-emerald-500/35' },
  hybrid: { short: 'Hybrid', accent: '#60a5fa', text: 'text-blue-300', bg: 'bg-blue-500/12', border: 'border-blue-500/35' },
  'oracle-attested': { short: 'Oracle', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  decorative: { short: 'Meta', accent: '#9ca3af', text: 'text-gray-300', bg: 'bg-white/[0.06]', border: 'border-white/15' },
};
const rm = (r) => REALITY_META[r] || REALITY_META['oracle-attested'];

// Curated category groups. Each circuit lands in exactly ONE group (first match wins); the final
// catch-all group sweeps up anything uncategorised so nothing is ever hidden.
const GROUPS = [
  { key: 'zk', title: 'Zero-knowledge', icon: ShieldCheck, match: (c) => c.reality === 'full-zk' || c.category === 'crypto' || c.category === 'privacy' },
  { key: 'oracle', title: 'Oracle & prediction markets', icon: Radio, match: (c) => c.category === 'oracle' },
  { key: 'defi', title: 'DeFi & lending', icon: Coins, match: (c) => c.category === 'defi' },
  { key: 'game', title: 'Games', icon: Gamepad2, match: (c) => c.category === 'game' },
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
  // demo deploys via server-assisted testnet dev wallets (the builder discloses this). Mark
  // them so the section never reads as if every chip is a non-custodial mainnet deploy.
  { kind: 'htlc', label: 'HTLC', demo: true },
  { kind: 'channel', label: 'Payment channel', demo: true },
  { kind: 'deadman', label: "Dead-man's switch", demo: true },
  { kind: 'multisig', label: 'N-of-M multisig', demo: true },
];

function CircuitCard({ c, active, onSelect, onInspect }) {
  const m = rm(c.reality);
  return (
    <div
      className={`group relative rounded-xl border overflow-hidden hover-lift ${
        active
          ? 'border-kaspa-green/60 bg-kaspa-green/[0.08] ring-1 ring-kaspa-green/30 shadow-[0_0_22px_rgba(73,234,203,0.16)]'
          : 'border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent hover:border-white/[0.16]'
      }`}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] opacity-70 group-hover:opacity-100 transition-opacity z-10" style={{ background: `linear-gradient(90deg, transparent, ${active ? '#49EACB' : m.accent}, transparent)` }} />
      <button onClick={() => onSelect(c.id)} title={`${c.name} - ${c.reality}`} className="block w-full text-left p-3">
        <div className="relative flex items-start gap-2 pr-16">
          <span className={`text-sm font-bold leading-tight ${active ? 'text-kaspa-green' : 'text-white'}`}>{c.name}</span>
        </div>
        <p className="relative text-[11px] text-gray-400 leading-snug mt-1 line-clamp-2 pr-2">{c.description}</p>
      </button>
      {/* The reality badge is itself the inspect trigger: press it to see how this is verified + the source. */}
      <button
        type="button"
        onClick={() => onInspect(c)}
        title="How is this verified? Press to inspect the source"
        className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border transition hover:brightness-125 z-10 ${m.bg} ${m.text} ${m.border}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${c.reality === 'full-zk' ? 'zk-live-glow' : ''}`} style={{ background: m.accent }} /> {m.short} <Info size={9} className="opacity-60" />
      </button>
      {active && <Check size={13} className="text-kaspa-green absolute bottom-2.5 right-2.5" />}
    </div>
  );
}

export default function SandboxGallery({ circuits, selectedId, onSelect }) {
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState({});
  const [infoCircuit, setInfoCircuit] = useState(null);
  const prefersReduced = useReducedMotion();

  const grouped = useMemo(() => {
    const g = Object.fromEntries(GROUPS.map((x) => [x.key, []]));
    for (const c of circuits) {
      const grp = GROUPS.find((x) => x.match(c)) || GROUPS[GROUPS.length - 1];
      g[grp.key].push(c);
    }
    // full-zk circuits first within each group (they're the headline)
    for (const k in g) g[k].sort((a, b) => (b.reality === 'full-zk') - (a.reality === 'full-zk'));
    return g;
  }, [circuits]);

  const s = q.trim().toLowerCase();
  const searchResults = s ? circuits.filter((c) => `${c.name} ${c.id} ${c.description} ${c.category}`.toLowerCase().includes(s)) : null;

  return (
    <div>
      {infoCircuit && <TransparencyModal circuit={infoCircuit} onClose={() => setInfoCircuit(null)} />}
      <div className="flex items-center gap-2 mb-5 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 max-w-md">
        <Search size={15} className="text-gray-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search all covenants, circuits, games…"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
        />
        {s && <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{searchResults.length}</span>}
      </div>

      {searchResults ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {searchResults.map((c) => <CircuitCard key={c.id} c={c} active={c.id === selectedId} onSelect={onSelect} onInspect={setInfoCircuit} />)}
          {searchResults.length === 0 && <div className="text-sm text-gray-500 py-8 col-span-full text-center">No covenants match your search.</div>}
        </div>
      ) : (
        <div className="space-y-7">
          {GROUPS.map((grp) => {
            const items = grouped[grp.key];
            if (!items.length) return null;
            const open = expanded[grp.key];
            const visible = open ? items : items.slice(0, INITIAL);
            return (
              <section key={grp.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
                    <grp.icon size={14} className="text-kaspa-green" />
                  </span>
                  <h3 className="text-sm font-bold text-white tracking-tight">{grp.title}</h3>
                  <span className="text-[10px] text-gray-500 tabular-nums">{items.length}</span>
                </div>
                <motion.div
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
                  variants={prefersReduced ? undefined : GRID_STAGGER}
                  initial={prefersReduced ? false : 'hidden'}
                  animate={prefersReduced ? false : 'show'}
                >
                  {visible.map((c) => (
                    <motion.div key={c.id} variants={prefersReduced ? undefined : CARD_RISE}>
                      <CircuitCard c={c} active={c.id === selectedId} onSelect={onSelect} onInspect={setInfoCircuit} />
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
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <ShieldCheck size={14} className="text-emerald-300" />
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight">On-chain enforced primitives</h3>
              <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-300 border border-emerald-500/35">On-chain</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-snug mb-3 max-w-xl">
              These seven are enforced by Kaspa consensus: the redeem script itself releases the funds, not an oracle or proof. Open the real on-chain builder rather than a ZK or oracle look-alike. The ones marked demo deploy via testnet dev wallets on this platform; the single-key ones (hashlock, timelock, CSV) deploy non-custodially.
            </p>
            <div className="flex flex-wrap gap-2 max-w-2xl">
              {ONCHAIN_PRIMITIVES.map((p) => (
                <Link
                  key={p.kind}
                  to={`/deploy/enforced?kind=${p.kind}`}
                  title={p.demo ? `Deploy ${p.label} - on-chain enforced (testnet dev-wallet demo on this platform)` : `Deploy ${p.label} - on-chain enforced, non-custodial`}
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

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-lg bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
                <Layers size={14} className="text-kaspa-green" />
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight">Templates</h3>
            </div>
            <Link to="/templates" className="group flex items-center justify-between gap-3 p-4 rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.04] hover:bg-kaspa-green/[0.08] hover:border-kaspa-green/40 transition-all max-w-md">
              <div>
                <div className="text-sm font-bold text-white">Browse ready-made templates</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Pre-configured covenants across games, ZK, oracle markets, and DeFi.</div>
              </div>
              <ArrowUpRight size={18} className="text-kaspa-green group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
