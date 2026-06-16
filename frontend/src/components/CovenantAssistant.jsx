import { useState } from 'react';
import { Sparkles, Send, ArrowRight, ShieldCheck, Radio, Cpu, Lock, Wand2 } from 'lucide-react';
import { suggestCovenants } from '../lib/covenantAssistant';

// Covenant assistant: type a plain-English goal and get a REAL, honest covenant suggestion that
// pre-fills the builder. Grounded in the live catalog (suggestCovenants only returns circuits that
// exist, with their true enforcement reality), so it never overclaims. A backend LLM can later
// replace getSuggestions() with an async call returning the same shape.

const REALITY_PILL = {
  'on-chain': { label: 'On-chain enforced', icon: ShieldCheck, cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/35' },
  'full-zk': { label: 'Zero-knowledge', icon: ShieldCheck, cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/35' },
  hybrid: { label: 'Hybrid', icon: Cpu, cls: 'text-blue-300 bg-blue-500/12 border-blue-500/35' },
  'oracle-attested': { label: 'Oracle-attested', icon: Radio, cls: 'text-amber-300 bg-amber-500/12 border-amber-500/35' },
  decorative: { label: 'Metadata', icon: Lock, cls: 'text-gray-300 bg-white/[0.06] border-white/15' },
};
const pill = (r) => REALITY_PILL[r] || REALITY_PILL['oracle-attested'];

const EXAMPLES = [
  'A 2-party escrow that refunds the buyer if the seller does not deliver in 30 days',
  'Lock these tokens and release them after a 1-year vesting date',
  'Only let addresses on my whitelist claim, without revealing the list',
  'Prove a user is over 18 without revealing their birth date',
  'A prediction market that pays out on a real-world outcome',
];

export default function CovenantAssistant({ circuits, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = not run yet

  // LLM-READY: swap this for `await fetch('/api/assistant', ...)` returning the same [{id,why,realityNote}] shape.
  const getSuggestions = (text) => suggestCovenants(text, circuits);

  const run = (text) => {
    const t = (text ?? q).trim();
    if (!t) return;
    setQ(t);
    setResults(getSuggestions(t));
  };

  return (
    <div className="rounded-2xl border border-kaspa-green/20 bg-gradient-to-b from-kaspa-green/[0.06] to-transparent p-4 sm:p-5 relative overflow-hidden">
      <div className="covex-aurora hidden sm:block" aria-hidden="true" style={{ top: -40, right: -20, left: 'auto', width: 260, height: 180, opacity: 0.4 }} />
      <div className="relative flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-xl bg-kaspa-green/15 border border-kaspa-green/30 flex items-center justify-center">
          <Wand2 size={16} className="text-kaspa-green" />
        </span>
        <h2 className="text-base font-bold text-white">Covenant assistant</h2>
        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green">beta</span>
      </div>
      <p className="relative text-[12px] text-gray-400 mb-3">
        Describe what you want to build and I'll set up a real covenant for you. I only ever suggest circuits that actually exist, with their honest enforcement reality.
      </p>

      <div className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 focus-within:border-kaspa-green/40 transition-colors">
        <Sparkles size={15} className="text-kaspa-green shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder="e.g. an escrow that refunds the buyer after 30 days"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
        />
        <button onClick={() => run()} disabled={!q.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_14px_rgba(73,234,203,0.35)] transition-all">
          <Send size={13} /> Suggest
        </button>
      </div>

      {results === null && (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="text-[11px] text-gray-300 px-2.5 py-1 rounded-lg border border-white/10 hover:border-kaspa-green/40 hover:text-white transition-colors">
              {ex.length > 52 ? ex.slice(0, 52) + '…' : ex}
            </button>
          ))}
        </div>
      )}

      {results !== null && (
        <div className="relative mt-4 space-y-2.5">
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
                  <div key={r.id} className={`rounded-xl border p-3.5 ${i === 0 ? 'border-kaspa-green/40 bg-kaspa-green/[0.05]' : 'border-white/10 bg-black/30'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{r.circuit.name}</span>
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${p.cls}`}>
                            <p.icon size={10} /> {p.label}
                          </span>
                          {i === 0 && <span className="text-[9px] font-bold uppercase tracking-wide text-kaspa-green">best fit</span>}
                        </div>
                        <p className="text-[12px] text-gray-300 mt-1.5 leading-relaxed">{r.why}</p>
                        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed"><span className="text-gray-400 font-semibold">What the chain does:</span> {r.realityNote}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onSelect(r.id)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-white/[0.06] border border-white/10 hover:border-kaspa-green/40 hover:bg-kaspa-green/10 text-white transition-all"
                    >
                      Use this in the builder <ArrowRight size={13} className="text-kaspa-green" />
                    </button>
                  </div>
                );
              })}
              <p className="text-[10px] text-gray-500">You can always tweak the configuration in the builder below before deploying. Nothing deploys until you review it and your wallet signs.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
