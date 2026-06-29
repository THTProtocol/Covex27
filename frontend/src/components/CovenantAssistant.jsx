import { useState } from 'react';
import { Sparkles, Send, ArrowRight, ShieldCheck, Radio, Lock, Wand2, Handshake, Clock, ListChecks, Fingerprint, TrendingUp, KeyRound, Gamepad2, Repeat } from '../lib/routeIcons.js';
import { suggestCovenants } from '../lib/covenantAssistant';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

// Covenant assistant: type a plain-English goal and get a REAL, honest covenant suggestion that
// pre-fills the builder. Grounded in the live catalog (suggestCovenants only returns circuits that
// exist, with their true enforcement reality), so it never overclaims. Pure and deterministic, with
// no external model in the path.

const REALITY_PILL = {
  'on-chain': { label: 'On-chain enforced', icon: ShieldCheck, cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/35' },
  // Every ZK reality is collapsed to oracle-attested (off-chain oracle verify, no on-chain pairing
  // verifier). full-zk / hybrid render as oracle-attested defensively so the honest collapse holds
  // even if a raw reality ever leaks through.
  'full-zk': { label: 'Resolver-attested', icon: Radio, cls: 'text-amber-300 bg-amber-500/12 border-amber-500/35' },
  hybrid: { label: 'Resolver-attested', icon: Radio, cls: 'text-amber-300 bg-amber-500/12 border-amber-500/35' },
  'oracle-attested': { label: 'Resolver-attested', icon: Radio, cls: 'text-amber-300 bg-amber-500/12 border-amber-500/35' },
  decorative: { label: 'Metadata', icon: Lock, cls: 'text-gray-300 bg-white/[0.06] border-white/15' },
};
const pill = (r) => REALITY_PILL[r] || REALITY_PILL['oracle-attested'];

const EXAMPLES = [
  'A 2-party escrow that refunds the buyer if the seller does not deliver in 30 days',
  'Lock these tokens and release them after a 1-year vesting date',
  'Only let addresses on my whitelist claim, without revealing the list',
  'Prove a user is over 18 without revealing their birth date',
  'A conditional payment that pays out on a resolved real-world outcome',
];

// One-tap goals. Each pre-fills a representative prompt and runs the deterministic suggester, so a
// new user never has to know what to type. Every query maps to a real circuit in the catalog.
const INTENT_CHIPS = [
  { label: 'Escrow', icon: Handshake, query: 'A 2-party escrow that refunds the buyer if the seller does not deliver in 30 days' },
  { label: 'Vesting / timelock', icon: Clock, query: 'Lock these tokens and release them only after a vesting date' },
  { label: 'Whitelist', icon: ListChecks, query: 'Only let addresses on my whitelist claim, without revealing the list' },
  { label: 'Age proof', icon: Fingerprint, query: 'Prove a user is over 18 without revealing their birth date' },
  { label: 'Conditional outcome', icon: TrendingUp, query: 'A prediction market that pays out on a real-world outcome' },
  { label: 'Multisig', icon: KeyRound, query: 'A 2-of-3 multisig that needs two of three keys to release funds' },
  { label: 'Two-party covenant', icon: Gamepad2, query: 'A two-player game covenant with a staked pot for the winner' },
  { label: 'HTLC swap', icon: Repeat, query: 'Release on revealing a secret preimage, with a timelock refund' },
];

// Trust-model filter: let users narrow suggestions to the enforcement reality they trust.
const REALITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'on-chain', label: 'On-chain' },
  { key: 'oracle', label: 'Resolver-attested' },
];
const matchesFilter = (reality, f) =>
  f === 'all' || reality === f ||
  (f === 'oracle' && (reality === 'oracle-attested' || reality === 'hybrid' || reality === 'full-zk'));

// Honest confidence label, keyed to how the deterministic engine matched (curated intent vs fallback).
const CONFIDENCE = {
  high: { label: 'Strong match', cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30' },
  medium: { label: 'Good match', cls: 'text-amber-300 bg-amber-500/12 border-amber-500/30' },
  low: { label: 'Possible match', cls: 'text-gray-400 bg-white/[0.06] border-white/15' },
};

export default function CovenantAssistant({ circuits, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = not run yet
  const [realityFilter, setRealityFilter] = useState('all');

  const compute = (text, filter) => {
    const pool = filter === 'all' ? circuits : circuits.filter((c) => matchesFilter(c.reality, filter));
    return suggestCovenants(text, pool);
  };

  const run = (text) => {
    const t = (text ?? q).trim();
    if (!t) return;
    setQ(t);
    setResults(compute(t, realityFilter));
  };

  // Trust-model filter: re-narrows the catalog pool and re-runs the suggester.
  const setFilter = (f) => {
    setRealityFilter(f);
    if (!q.trim() || results === null) return;
    setResults(compute(q, f));
  };

  return (
    <Card className="p-4 sm:p-5 relative overflow-hidden">
      <div className="covex-aurora hidden sm:block" aria-hidden="true" style={{ top: -40, right: -20, left: 'auto', width: 260, height: 180, opacity: 0.4 }} />
      <div className="relative flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-xl bg-kaspa-green/15 border border-kaspa-green/30 flex items-center justify-center">
          <Wand2 size={16} className="text-kaspa-green" />
        </span>
        <h2 className="text-base font-bold text-white light:text-slate-900">Covenant assistant</h2>
        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green">beta</span>
      </div>
      <p className="relative text-[12px] text-gray-400 light:text-slate-500 mb-3">
        Pick a goal to start, or describe your own below. I only ever suggest circuits that actually exist, with their honest enforcement reality.
      </p>

      {/* One-tap goals: the obvious front door for a new user. */}
      <div className="relative flex flex-wrap gap-1.5 mb-3">
        {INTENT_CHIPS.map((c) => (
          <button
            key={c.label}
            onClick={() => run(c.query)}
            className="btn-shimmer inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg border border-kaspa-green/25 bg-kaspa-green/[0.06] text-gray-200 light:text-slate-700 hover:text-white hover:border-kaspa-green/50 hover:bg-kaspa-green/[0.12] transition-all"
          >
            <c.icon size={13} className="text-kaspa-green" /> {c.label}
          </button>
        ))}
      </div>

      <div className="relative flex items-center gap-2 rounded-xl border border-white/10 light:border-slate-200 bg-black/40 light:bg-white px-3 py-2 focus-within:border-kaspa-green/40 transition-colors">
        <Sparkles size={15} className="text-kaspa-green shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder="e.g. an escrow that refunds the buyer after 30 days"
          className="flex-1 min-w-0 bg-transparent text-sm text-white light:text-slate-900 placeholder:text-gray-500 light:placeholder:text-slate-400 outline-none"
        />
        <button onClick={() => run()} disabled={!q.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_14px_rgba(73,234,203,0.35)] transition-all">
          <Send size={13} /> Suggest
        </button>
      </div>

      {results === null && (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="text-[11px] text-gray-300 light:text-slate-600 px-2.5 py-1.5 rounded-lg border border-white/10 light:border-slate-200 hover:border-kaspa-green/40 hover:text-white transition-colors">
              {ex.length > 52 ? ex.slice(0, 52) + '…' : ex}
            </button>
          ))}
        </div>
      )}

      {results !== null && (
        <div className="relative mt-4 space-y-2.5">
          {/* Trust-model filter: narrow to the enforcement reality you're comfortable with. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1">Trust</span>
            {REALITY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                  realityFilter === f.key
                    ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green'
                    : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {results.length === 0 ? (
            <div className="text-sm text-gray-400 rounded-xl border border-white/10 bg-black/30 p-4">
              I couldn't map that to a covenant yet. Try describing the outcome (escrow, timelock, whitelist, prediction, multisig, a game…), or browse the gallery below.
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Suggested covenant{results.length > 1 ? 's' : ''}</div>
              {results.map((r, i) => {
                const p = pill(r.circuit.reality);
                return (
                  <div key={r.id} className={`rounded-xl border p-3.5 hover-lift ${i === 0 ? 'border-kaspa-green/45 bg-kaspa-green/[0.06] shadow-[0_0_26px_-8px_rgba(73,234,203,0.5)] light:bg-kaspa-green/[0.04]' : 'border-white/10 bg-black/30 light:bg-white light:border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{r.circuit.name}</span>
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${p.cls}`}>
                            <p.icon size={10} /> {p.label}
                          </span>
                          {i === 0 && <span className="text-[9px] font-bold uppercase tracking-wide text-kaspa-green">best fit</span>}
                          {r.confidence && CONFIDENCE[r.confidence] && (
                            <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${CONFIDENCE[r.confidence].cls}`}>
                              {CONFIDENCE[r.confidence].label}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-300 mt-1.5 leading-relaxed">{r.why}</p>
                        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed"><span className="text-gray-400 font-semibold">What the chain does:</span> {r.realityNote}</p>
                      </div>
                    </div>
                    <Button
                      variant="kaspa"
                      size="sm"
                      shimmer
                      onClick={() => onSelect(r.id, { name: r.name || r.circuit.name, desc: r.why })}
                      className="mt-3"
                    >
                      Use this in the builder <ArrowRight size={13} />
                    </Button>
                  </div>
                );
              })}
              <p className="text-[10px] text-gray-500">You can always tweak the configuration in the builder below before deploying. Nothing deploys until you review it and your wallet signs.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
