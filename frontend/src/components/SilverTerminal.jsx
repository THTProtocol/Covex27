import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TerminalSquare,
  Play,
  Eraser,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  FileCode2,
} from 'lucide-react';

/**
 * SilverTerminal - the PRO mode of the Sandbox: a raw covenant terminal for experienced
 * users who write the covenant themselves and compile it, with NO assistant, NO templates,
 * and NO auto-generated SilverScript. You type, you compile, you deploy.
 *
 * Honesty: Covex compiles the covenant DSL via /api/compile (the real silverc pipeline) and
 * shows the genuine output. That compiled script is the DECLARED logic carried as a metadata
 * payload; on-chain the covenant locks to its P2SH commitment (aa20<hash>87), which is what
 * Kaspa consensus enforces. This pro terminal is Covex's own local authoring surface: you write
 * the covenant yourself and Covex compiles it, no auto-generation. No em dashes in copy.
 */

// Static reference covenants the user can load and then edit. These are examples to learn the
// syntax, NOT generated from the user's input. Each is valid covenant DSL that compiles.
const EXAMPLES = [
  {
    label: 'Dice duel (2 outcomes)',
    code: `Covenant DiceDuel {
  ;; Game: dice
  fee: 2
  Outcome::PlayerA => { VerifyPayout(pot, player_a, pot) }
  Outcome::PlayerB => { VerifyPayout(pot, player_b, pot) }
}`,
  },
  {
    label: 'Binary market (yes / no)',
    code: `Covenant BinaryMarket {
  ;; Game: market
  fee: 3
  Outcome::Yes => { VerifyPayout(pot, winners_yes, pot) }
  Outcome::No  => { VerifyPayout(pot, winners_no, pot) }
}`,
  },
  {
    label: 'Split pot (draw refunds both)',
    code: `Covenant SplitPot {
  ;; Game: custom
  fee: 1
  Outcome::Draw => {
    half = pot / 2
    VerifyPayout(pot, player_a, half)
    VerifyPayout(pot, player_b, half)
  }
}`,
  },
];

const STARTER = `;; Write your covenant. No templates, no auto-fill.
;; Covex compiles this to the declared logic; the chain enforces the P2SH commitment.

Covenant MyCovenant {
  ;; Game: custom
  fee: 2
  Outcome::Win => { VerifyPayout(pot, winner, pot) }
}`;

function OutRow({ label, value }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">{label}</div>
      <button
        onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1300); }); }}
        className="group inline-flex items-start gap-1.5 max-w-full rounded-lg border border-white/10 light:border-slate-200 bg-black/40 light:bg-slate-50 px-2.5 py-1.5 text-left hover:border-kaspa-green/40 transition-colors"
      >
        <span className="font-mono text-[11px] text-kaspa-green/90 break-all leading-snug">{value}</span>
        {done ? <Check size={12} className="text-kaspa-green shrink-0 mt-0.5" /> : <Copy size={12} className="text-gray-500 group-hover:text-kaspa-green shrink-0 mt-0.5" />}
      </button>
    </div>
  );
}

export default function SilverTerminal() {
  const navigate = useNavigate();
  const [code, setCode] = useState(STARTER);
  const [state, setState] = useState({ loading: false, result: null, error: null });
  const [showAbi, setShowAbi] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const taRef = useRef(null);
  const gutterRef = useRef(null);

  const lineCount = code.split('\n').length;

  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const next = code.slice(0, s) + '  ' + code.slice(en);
      setCode(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
    }
  };

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  const compile = async () => {
    setState({ loading: true, result: null, error: null });
    try {
      const r = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code }),
      });
      const d = await r.json();
      if (d.success) setState({ loading: false, result: d, error: null });
      else setState({ loading: false, result: null, error: d.error || 'compile failed' });
    } catch (e) {
      setState({ loading: false, result: null, error: String(e) });
    }
  };

  const { loading, result, error } = state;

  return (
    <div className="space-y-4 min-w-0">
      {/* Terminal frame */}
      <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-[#070a0f] light:bg-white overflow-hidden shadow-[0_24px_70px_-30px_rgba(73,234,203,0.35)]">
        {/* Title bar (wraps on narrow screens so the action buttons never clip) */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-white/10 light:border-slate-200 bg-black/40 light:bg-slate-50">
          <span className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E8AF34]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-kaspa-green/70" />
          </span>
          <TerminalSquare size={13} className="text-kaspa-green ml-1" />
          <span className="font-mono text-[11px] text-gray-300 light:text-slate-600">covenant.silver</span>
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-[#E8AF34]/40 text-[#E8AF34]">PRO</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setShowExamples((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-gray-400 light:text-slate-500 hover:text-kaspa-green px-2 py-1 rounded-lg border border-white/10 light:border-slate-200 transition-colors"
              >
                <FileCode2 size={12} /> Examples <ChevronDown size={11} />
              </button>
              {showExamples && (
                <div className="absolute right-0 mt-1 z-20 w-56 rounded-xl border border-white/10 light:border-slate-200 bg-[#0a0d12] light:bg-white shadow-xl overflow-hidden">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => { setCode(ex.code); setShowExamples(false); setState({ loading: false, result: null, error: null }); }}
                      className="block w-full text-left px-3 py-2 text-[12px] text-gray-300 light:text-slate-700 hover:bg-kaspa-green/10 hover:text-kaspa-green transition-colors"
                    >
                      {ex.label}
                    </button>
                  ))}
                  <div className="px-3 py-1.5 text-[10px] text-gray-600 light:text-slate-400 border-t border-white/5 light:border-slate-200">
                    Reference only. You write the covenant.
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => { setCode(''); setState({ loading: false, result: null, error: null }); taRef.current?.focus(); }}
              className="inline-flex items-center gap-1 text-[11px] text-gray-400 light:text-slate-500 hover:text-red-300 px-2 py-1 rounded-lg border border-white/10 light:border-slate-200 transition-colors"
            >
              <Eraser size={12} /> Clear
            </button>
          </div>
        </div>

        {/* Pro-mode honesty: compiling here shows the genuine declared logic, but authoring your
            OWN script is a preview today; locking real funds goes through the on-chain primitives. */}
        <div className="flex items-start gap-2 px-4 py-2 border-b border-white/10 light:border-slate-200 bg-amber-500/[0.05] light:bg-amber-50 text-[11px] text-amber-200 light:text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>Authoring your own script is a preview today; deploy uses the on-chain primitives below.</span>
        </div>

        {/* Editor: line gutter + textarea */}
        <div className="flex max-h-[440px]">
          <pre
            ref={gutterRef}
            aria-hidden="true"
            className="select-none overflow-hidden text-right py-3 pl-3 pr-2 font-mono text-[12.5px] leading-[1.55] text-gray-600 light:text-slate-400 bg-black/20 light:bg-slate-50 border-r border-white/5 light:border-slate-200"
          >
            {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
          </pre>
          <textarea
            ref={taRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={syncScroll}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder=";; Covenant MyVault { ;; Game: custom  fee: 2  Outcome::Win => { VerifyPayout(pot, winner, pot) } }"
            className="flex-1 min-w-0 resize-none py-3 px-3 font-mono text-[12.5px] leading-[1.55] bg-transparent text-gray-100 light:text-slate-800 placeholder:text-gray-600 light:placeholder:text-slate-400 outline-none caret-kaspa-green"
            style={{ minHeight: 280 }}
            rows={14}
          />
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-white/10 light:border-slate-200 bg-black/30 light:bg-slate-50">
          <button
            onClick={compile}
            disabled={loading || !code.trim()}
            className="btn-shimmer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-kaspa-green text-black font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Compile
          </button>
          <span className="ml-auto text-[11px] text-gray-500 light:text-slate-400 font-mono">{lineCount} lines</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5 flex items-start gap-2.5">
          <AlertTriangle size={15} className="text-amber-300 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-amber-200">Compile error</div>
            <div className="text-[12px] text-amber-200/85 font-mono break-words mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Output */}
      {result && (
        <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-kaspa-green" />
            <span className="text-sm font-bold text-white light:text-slate-900">{result.contract_name || 'Covenant'}</span>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 font-mono">compiled</span>
            <span className="ml-auto text-[11px] text-gray-500 light:text-slate-400">{result.bytecode_len} bytes</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <OutRow label="script_hex (declared logic)" value={result.script_hex} />
            <OutRow label="payload_hex (tx metadata)" value={result.payload_hex} />
          </div>

          {result.abi && (
            <div>
              <button
                onClick={() => setShowAbi((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500 hover:text-kaspa-green transition-colors"
              >
                {showAbi ? <ChevronDown size={13} /> : <ChevronRight size={13} />} ABI
              </button>
              {showAbi && (
                <pre className="mt-2 rounded-lg border border-white/10 light:border-slate-200 bg-black/40 light:bg-slate-50 p-3 font-mono text-[10.5px] text-gray-300 light:text-slate-700 overflow-auto max-h-60 whitespace-pre-wrap break-words">
                  {JSON.stringify(result.abi, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Honest enforcement note + deploy handoff */}
          <div className="rounded-xl border border-white/[0.07] light:border-slate-200 bg-black/20 light:bg-slate-50 p-3">
            <p className="text-[11.5px] text-gray-400 light:text-slate-500 leading-relaxed">
              This is the <span className="text-gray-200 light:text-slate-700 font-semibold">declared</span> logic, compiled to a metadata payload. On-chain, a covenant locks to its P2SH
              commitment (the <span className="font-mono text-kaspa-green">aa20...87</span> the payload begins with), and Kaspa consensus enforces that commitment. To lock real funds,
              deploy a consensus-enforced covenant.
            </p>
            <button
              onClick={() => navigate('/deploy/enforced')}
              className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-kaspa-green/15 border border-kaspa-green/40 text-kaspa-green hover:bg-kaspa-green/25 text-[12.5px] font-bold transition-colors"
            >
              Deploy a consensus-enforced covenant <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
