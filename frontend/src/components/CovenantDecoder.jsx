import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  GitBranch,
  KeyRound,
  Hash,
  Clock,
  Code2,
  ChevronDown,
  ChevronRight,
  Cpu,
} from 'lucide-react';
import { CopyChip, Section } from './TransparencyModal';

/**
 * CovenantDecoder - the Etherscan/thirdweb-grade reader for a covenant's redeem script.
 * Calls the backend decompiler (POST /api/script/decompile) and disassembler
 * (POST /api/script/disassemble) and renders: a Verified-covenant badge (the decode is
 * re-emitted to byte-identical bytes, optionally matched to the on-chain commitment), the
 * decoded kind + honest enforcement reality, labeled parameters, the spend branches (the
 * Read view of what each path requires), and a collapsible opcode view (the disassembly).
 *
 * This replaces the old raw-hex + single-regex verdict with a real, server-verified decode.
 * Read-only, non-fund-path. No em dashes in copy.
 */

const TYPE_ICON = {
  pubkey: KeyRound,
  hash32: Hash,
  daa: Clock,
  sequence: Clock,
  int: Cpu,
};

function ParamRow({ p }) {
  const Icon = TYPE_ICON[p.type] || KeyRound;
  const isLong = p.value && p.value.length > 24;
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={13} className="mt-1 shrink-0 text-kaspa-green/80" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-bold text-gray-200 light:text-slate-700">{p.role}</span>
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-gray-500 light:text-slate-600">
            {p.type}
          </span>
        </div>
        {isLong ? (
          <div className="mt-1">
            <CopyChip text={p.value} />
          </div>
        ) : (
          <div className="mt-0.5 font-mono text-[12px] text-kaspa-green break-all">{p.value}</div>
        )}
      </div>
    </div>
  );
}

function BranchCard({ b }) {
  return (
    <div className="rounded-lg border border-white/[0.07] light:border-slate-200 bg-black/20 light:bg-slate-50 p-2.5">
      <div className="flex items-center gap-1.5">
        <GitBranch size={11} className="text-kaspa-green shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-kaspa-green">{b.name}</span>
      </div>
      <div className="mt-1 text-[12px] text-gray-300 light:text-slate-600 leading-snug">{b.condition}</div>
      {b.satisfier && (
        <div className="mt-1.5 font-mono text-[10.5px] text-gray-500 light:text-slate-600 break-all">
          {b.satisfier}
        </div>
      )}
    </div>
  );
}

function OpcodeRow({ t }) {
  // The covenant-era overlay tags each opcode with its owning KIP and whether it is
  // already live on mainnet. KIP-10 introspection (7 opcodes) is consensus-active since
  // Crescendo (May 2025); KIP-16/17/20 opcodes are gated on the Toccata fork. We surface
  // the exact KIP so the badge never conflates the two forks.
  const introLabel = t.introspection ? (t.mainnet_live ? `${t.kip || 'KIP-10'} live` : t.kip || 'Toccata') : null;
  const introCls = t.introspection && t.mainnet_live
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  const flag =
    (t.illegal && { label: 'illegal', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }) ||
    (t.disabled && { label: 'disabled', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }) ||
    (introLabel && { label: introLabel, cls: introCls }) ||
    (t.reserved_unknown && { label: 'reserved', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }) ||
    null;
  return (
    <div className="flex items-baseline gap-3 py-0.5">
      <span className="w-10 shrink-0 text-right text-[10px] text-gray-600 light:text-slate-600 tabular-nums">
        {String(t.offset).padStart(3, '0')}
      </span>
      <span className="text-[11.5px] font-bold text-gray-200 light:text-slate-700">{t.name}</span>
      {t.data_hex && (
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-kaspa-green/80" title={t.data_hex}>
          0x{t.data_hex}
        </span>
      )}
      {flag && (
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${flag.cls}`}>
          {flag.label}
        </span>
      )}
    </div>
  );
}

export default function CovenantDecoder({ redeemHex, commitmentHex }) {
  const [state, setState] = useState({ loading: true, decoded: null, tokens: [], commitmentMatch: null, error: null });
  const [showAsm, setShowAsm] = useState(false);

  useEffect(() => {
    if (!redeemHex) {
      setState({ loading: false, decoded: null, tokens: [], commitmentMatch: null, error: null });
      return undefined;
    }
    const ac = new AbortController();
    const headers = { 'Content-Type': 'application/json' };
    Promise.all([
      fetch('/api/script/decompile', {
        method: 'POST',
        headers,
        signal: ac.signal,
        body: JSON.stringify({ redeem_hex: redeemHex, commitment_hex: commitmentHex || undefined }),
      }).then((r) => r.json()),
      fetch('/api/script/disassemble', {
        method: 'POST',
        headers,
        signal: ac.signal,
        body: JSON.stringify({ script_hex: redeemHex }),
      }).then((r) => r.json()),
    ])
      .then(([dec, dis]) => {
        setState({
          loading: false,
          decoded: dec.ok ? dec.decoded : null,
          commitmentMatch: dec.commitment_match,
          tokens: (dis && dis.tokens) || [],
          error: dec.ok ? null : dec.error || 'decode failed',
        });
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setState({ loading: false, decoded: null, tokens: [], commitmentMatch: null, error: String(e) });
      });
    return () => ac.abort();
  }, [redeemHex, commitmentHex]);

  if (!redeemHex) return null;

  const { loading, decoded, tokens, commitmentMatch, error } = state;
  const verified = !!decoded?.verified && commitmentMatch !== false;
  const commitmentChecked = commitmentMatch === true;

  return (
    <div className="rounded-xl border border-white/[0.07] light:border-slate-200 bg-white/[0.02] light:bg-white p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Code2 size={13} className="text-kaspa-green" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400 light:text-slate-500">
            Decoded covenant
          </span>
        </div>
        {!loading && decoded && (
          verified ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-kaspa-green/30 bg-kaspa-green/15 px-2.5 py-1 text-[10.5px] font-bold text-kaspa-green">
              <ShieldCheck size={12} /> Verified covenant
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-bold text-amber-300">
              <ShieldAlert size={12} /> {commitmentMatch === false ? 'Commitment mismatch' : decoded?.matched ? 'Unverified' : 'Non-standard'}
            </span>
          )
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-[12px] text-gray-400 light:text-slate-500">
          <Loader2 size={14} className="animate-spin text-kaspa-green" /> Recovering and verifying the redeem script...
        </div>
      )}

      {!loading && error && (
        <div className="text-[12px] text-amber-300">Could not decode this script: {error}</div>
      )}

      {!loading && decoded && (
        <div className="space-y-3">
          <div>
            <div className="text-[15px] font-extrabold text-gray-100 light:text-slate-800">{decoded.label}</div>
            <div className="mt-0.5 font-mono text-[11px] text-gray-500 light:text-slate-600">{decoded.kind}</div>
            <div className="mt-1.5 text-[12px] text-gray-300 light:text-slate-600 leading-relaxed">{decoded.reality}</div>
            {verified && (
              <div className="mt-1.5 text-[11px] text-kaspa-green/90 leading-snug">
                Re-emitting the redeem from these parameters reproduces the on-chain bytes exactly
                {commitmentChecked ? ', and they hash to this covenant’s P2SH commitment.' : '.'}
              </div>
            )}
            {decoded.note && (
              <div className="mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-200/90 leading-snug">
                {decoded.note}
              </div>
            )}
          </div>

          {decoded.params?.length > 0 && (
            <Section icon={KeyRound} title="Parameters">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {decoded.params.map((p, i) => (
                  <ParamRow key={`${p.role}-${i}`} p={p} />
                ))}
              </div>
            </Section>
          )}

          {decoded.branches?.length > 0 && (
            <Section icon={GitBranch} title={`Spend paths (${decoded.branches.length})`}>
              <div className="space-y-2">
                {decoded.branches.map((b, i) => (
                  <BranchCard key={`${b.name}-${i}`} b={b} />
                ))}
              </div>
            </Section>
          )}

          <div>
            <button
              onClick={() => setShowAsm((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500 hover:text-kaspa-green transition-colors"
            >
              {showAsm ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Opcode view ({decoded.opcode_count} ops, {decoded.byte_len} bytes)
            </button>
            {showAsm && (
              <div className="mt-2 rounded-lg border border-white/[0.07] light:border-slate-200 bg-black/40 light:bg-slate-50 p-2.5 max-h-72 overflow-y-auto">
                {tokens.length > 0 ? (
                  tokens.map((t, i) => <OpcodeRow key={i} t={t} />)
                ) : (
                  <pre className="font-mono text-[11px] text-gray-300 light:text-slate-600 whitespace-pre-wrap break-all">
                    {decoded.asm}
                  </pre>
                )}
                <div className="mt-2 pt-2 border-t border-white/5 light:border-slate-200">
                  <div className="text-[9.5px] uppercase tracking-wider text-gray-600 light:text-slate-600 mb-1">
                    redeem_script_hex
                  </div>
                  <CopyChip text={redeemHex} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
