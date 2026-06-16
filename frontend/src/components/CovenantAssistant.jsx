import { useState } from 'react';
import {
  Sparkles, Send, ArrowRight, ShieldCheck, Radio, Cpu, Lock, Wand2,
  Handshake, Clock, ListChecks, Fingerprint, TrendingUp, KeyRound, Gamepad2, Repeat,
  Settings2, Loader2, Check, X,
} from 'lucide-react';
import { suggestCovenants, suggestCovenantsLLM } from '../lib/covenantAssistant';

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

// One-tap goals. Each pre-fills a representative prompt and runs the deterministic suggester, so a
// new user never has to know what to type. Every query maps to a real circuit in the catalog.
const INTENT_CHIPS = [
  { label: 'Escrow', icon: Handshake, query: 'A 2-party escrow that refunds the buyer if the seller does not deliver in 30 days' },
  { label: 'Vesting / timelock', icon: Clock, query: 'Lock these tokens and release them only after a vesting date' },
  { label: 'Whitelist', icon: ListChecks, query: 'Only let addresses on my whitelist claim, without revealing the list' },
  { label: 'Age proof', icon: Fingerprint, query: 'Prove a user is over 18 without revealing their birth date' },
  { label: 'Prediction market', icon: TrendingUp, query: 'A prediction market that pays out on a real-world outcome' },
  { label: 'Multisig', icon: KeyRound, query: 'A 2-of-3 multisig that needs two of three keys to release funds' },
  { label: 'Game pot', icon: Gamepad2, query: 'A two-player game covenant with a staked pot for the winner' },
  { label: 'HTLC swap', icon: Repeat, query: 'Release on revealing a secret preimage, with a timelock refund' },
];

// Trust-model filter: let users narrow suggestions to the enforcement reality they trust.
const REALITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'full-zk', label: 'Zero-knowledge' },
  { key: 'on-chain', label: 'On-chain' },
  { key: 'oracle', label: 'Oracle' },
];
const matchesFilter = (reality, f) =>
  f === 'all' || reality === f || (f === 'oracle' && (reality === 'oracle-attested' || reality === 'hybrid'));

// Honest confidence label, keyed to how the deterministic engine matched (curated intent vs fallback).
const CONFIDENCE = {
  high: { label: 'Strong match', cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30' },
  medium: { label: 'Good match', cls: 'text-amber-300 bg-amber-500/12 border-amber-500/30' },
  low: { label: 'Possible match', cls: 'text-gray-400 bg-white/[0.06] border-white/15' },
};

// Settings for the optional local model. Module-scope so typing in the inputs does not remount them.
function AIConfigPanel({ initial, onSave, onDisable, onClose }) {
  const [endpoint, setEndpoint] = useState(initial?.endpoint || 'http://localhost:11434/v1');
  const [model, setModel] = useState(initial?.model || '');
  return (
    <div className="relative mb-3 rounded-xl border border-kaspa-green/25 bg-black/40 light:bg-white p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <Cpu size={14} className="text-kaspa-green" />
        <span className="text-xs font-bold text-white light:text-slate-900">Local AI (runs on your computer)</span>
        <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white light:hover:text-slate-900" aria-label="Close"><X size={14} /></button>
      </div>
      <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed mb-2.5">
        Point this at a local model server. Nothing leaves your machine and no API key is used. The model's
        picks are still validated against the real catalog, so it can never invent a covenant that does not exist.
      </p>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Endpoint (OpenAI-compatible)</label>
      <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:11434/v1"
        className="w-full mb-2 rounded-lg border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-2.5 py-1.5 text-xs text-white light:text-slate-800 font-mono outline-none focus:border-kaspa-green/40" />
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Model</label>
      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. llama3.1  ·  qwen2.5  ·  mistral"
        className="w-full mb-3 rounded-lg border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-2.5 py-1.5 text-xs text-white light:text-slate-800 font-mono outline-none focus:border-kaspa-green/40" />
      <div className="flex items-center gap-3">
        <button onClick={() => onSave(endpoint, model)} disabled={!endpoint.trim() || !model.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_14px_rgba(73,234,203,0.35)] transition-all">
          <Check size={13} /> Use local AI
        </button>
        {initial && <button onClick={onDisable} className="text-[11px] font-semibold text-gray-400 hover:text-red-300">Turn off</button>}
      </div>
      <p className="text-[10px] text-gray-500 light:text-slate-400 leading-relaxed mt-2.5 border-t border-white/[0.06] light:border-slate-200 pt-2">
        Setup: install <span className="text-gray-300 light:text-slate-600">Ollama</span>, run <span className="font-mono text-gray-300 light:text-slate-600">ollama pull llama3.1</span>, then start it with <span className="font-mono text-gray-300 light:text-slate-600">OLLAMA_ORIGINS=* ollama serve</span> so this page may reach it. Most reliable when you run Covex locally; the live HTTPS site may be blocked by browser localhost rules.
      </p>
    </div>
  );
}

export default function CovenantAssistant({ circuits, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = not run yet
  const [realityFilter, setRealityFilter] = useState('all');
  const [thinking, setThinking] = useState(false);
  const [usedAI, setUsedAI] = useState(false);
  const [aiAll, setAiAll] = useState(null); // full local-model results, for client-side re-filtering
  // Local-AI config { endpoint, model } persisted to localStorage. When set, the assistant asks a
  // model running on the USER's own machine; output is still validated against the real catalog.
  const [localAI, setLocalAI] = useState(() => {
    try { return JSON.parse(localStorage.getItem('covex_local_ai') || 'null'); } catch { return null; }
  });
  const [showAIConfig, setShowAIConfig] = useState(false);
  const aiReady = !!(localAI && localAI.endpoint && localAI.model);

  const compute = (text, filter) => {
    const pool = filter === 'all' ? circuits : circuits.filter((c) => matchesFilter(c.reality, filter));
    return suggestCovenants(text, pool);
  };

  // Run a suggestion. If a local model is configured, ask it first (validated against the catalog) and
  // fall back to the deterministic engine on any error / empty / all-hallucinated result.
  const run = async (text) => {
    const t = (text ?? q).trim();
    if (!t) return;
    setQ(t);
    if (aiReady) {
      setThinking(true);
      try {
        const ai = await suggestCovenantsLLM(t, circuits, localAI);
        setThinking(false);
        if (ai && ai.length) {
          setAiAll(ai);
          setUsedAI(true);
          setResults(realityFilter === 'all' ? ai : ai.filter((r) => matchesFilter(r.circuit.reality, realityFilter)));
          return;
        }
      } catch (_) {
        setThinking(false);
      }
    }
    setUsedAI(false);
    setAiAll(null);
    setResults(compute(t, realityFilter));
  };

  // Trust-model filter. For deterministic results it re-narrows the pool; for local-model results it
  // filters the model's picks client-side (no second model call).
  const setFilter = (f) => {
    setRealityFilter(f);
    if (!q.trim() || results === null) return;
    if (usedAI && aiAll) {
      setResults(f === 'all' ? aiAll : aiAll.filter((r) => matchesFilter(r.circuit.reality, f)));
    } else {
      setResults(compute(q, f));
    }
  };

  const saveAI = (endpoint, model) => {
    const cfg = { endpoint: (endpoint || '').trim(), model: (model || '').trim() };
    if (!cfg.endpoint || !cfg.model) return;
    localStorage.setItem('covex_local_ai', JSON.stringify(cfg));
    setLocalAI(cfg);
    setShowAIConfig(false);
  };
  const disableAI = () => {
    localStorage.removeItem('covex_local_ai');
    setLocalAI(null);
    setUsedAI(false);
    setAiAll(null);
    setShowAIConfig(false);
  };

  return (
    <div className="rounded-2xl border border-kaspa-green/20 bg-gradient-to-b from-kaspa-green/[0.06] to-transparent p-4 sm:p-5 relative overflow-hidden">
      <div className="covex-aurora hidden sm:block" aria-hidden="true" style={{ top: -40, right: -20, left: 'auto', width: 260, height: 180, opacity: 0.4 }} />
      <div className="relative flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-xl bg-kaspa-green/15 border border-kaspa-green/30 flex items-center justify-center">
          <Wand2 size={16} className="text-kaspa-green" />
        </span>
        <h2 className="text-base font-bold text-white light:text-slate-900">Covenant assistant</h2>
        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green">beta</span>
        {aiReady && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/12 text-emerald-300" title={`Local AI active: ${localAI.model}`}>
            <Cpu size={10} /> Local AI
          </span>
        )}
        <button
          onClick={() => setShowAIConfig((v) => !v)}
          title="Local AI settings"
          className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-kaspa-green transition-colors"
        >
          <Settings2 size={13} /> {aiReady ? 'AI' : 'Local AI'}
        </button>
      </div>
      <p className="relative text-[12px] text-gray-400 light:text-slate-500 mb-3">
        Pick a goal to start, or describe your own below. I only ever suggest circuits that actually exist, with their honest enforcement reality.
      </p>

      {showAIConfig && (
        <AIConfigPanel initial={localAI} onSave={saveAI} onDisable={disableAI} onClose={() => setShowAIConfig(false)} />
      )}

      {/* One-tap goals: the obvious front door for a new user. */}
      <div className="relative flex flex-wrap gap-1.5 mb-3">
        {INTENT_CHIPS.map((c) => (
          <button
            key={c.label}
            onClick={() => run(c.query)}
            className="btn-shimmer inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-kaspa-green/25 bg-kaspa-green/[0.06] text-gray-200 hover:text-white hover:border-kaspa-green/50 hover:bg-kaspa-green/[0.12] transition-all"
          >
            <c.icon size={13} className="text-kaspa-green" /> {c.label}
          </button>
        ))}
      </div>

      <div className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 focus-within:border-kaspa-green/40 transition-colors">
        <Sparkles size={15} className="text-kaspa-green shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder="e.g. an escrow that refunds the buyer after 30 days"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
        />
        <button onClick={() => run()} disabled={!q.trim() || thinking} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_14px_rgba(73,234,203,0.35)] transition-all">
          {thinking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {thinking ? 'Thinking…' : 'Suggest'}
        </button>
      </div>

      {thinking && (
        <div className="relative mt-3 flex items-center gap-2 text-[12px] text-gray-300 light:text-slate-600 rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.05] px-3 py-2">
          <Loader2 size={14} className="text-kaspa-green animate-spin shrink-0" /> Thinking with your local model… its picks are validated against the real catalog.
        </div>
      )}

      {results === null && !thinking && (
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
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Suggested covenant{results.length > 1 ? 's' : ''}</div>
                {usedAI && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-emerald-300" title="Picked by your local model, validated against the real catalog">
                    <Cpu size={9} /> via local AI
                  </span>
                )}
              </div>
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
                        {r.name && r.name !== r.circuit.name && (
                          <p className="text-[11px] text-gray-400 mt-1"><span className="text-gray-500">Suggested name:</span> <span className="text-kaspa-green font-semibold">{r.name}</span></p>
                        )}
                        <p className="text-[12px] text-gray-300 mt-1.5 leading-relaxed">{r.why}</p>
                        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed"><span className="text-gray-400 font-semibold">What the chain does:</span> {r.realityNote}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onSelect(r.id, { name: r.name || r.circuit.name, desc: r.why })}
                      className="btn-shimmer mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-white/[0.06] border border-white/10 hover:border-kaspa-green/40 hover:bg-kaspa-green/10 text-white transition-all"
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
