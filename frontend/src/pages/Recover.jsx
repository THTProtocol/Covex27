import { useState, useEffect } from 'react';
import {
  LifeBuoy, ShieldCheck, KeyRound, Copy, Check, ExternalLink, Search,
  Upload, AlertTriangle, ArrowLeft, Coins, Loader2,
} from 'lucide-react';
import { explorerAddressUrl, explorerTxUrl } from '../lib/explorer';
import { hasPublicApi, fetchAddressBalanceSompi, fetchAddressUtxos, sompiToKas } from '../lib/kaspaPublicApi';

// Standalone, Covex-independent recovery page. Every covenant Covex deploys is a script-enforced P2SH
// covenant: the KASPA CHAIN enforces the spend rules, not Covex. So a holder can settle directly from
// any Kaspa node using only the published redeem script plus their own key(s) - even if Covex is
// permanently offline. This page reads a saved recovery kit (or looks one up while the API is reachable)
// and lays out exactly what to do. It never asks for a private key and never moves funds itself.

const KIND_HINTS = {
  singlesig: 'Provide a signature from your committed key. The script checks it; that is the whole condition.',
  timelock: 'Spendable only after the covenant’s locktime / DAA threshold. Any Kaspa node enforces the wait, then you sign with your key.',
  hashlock: 'Reveal the secret preimage whose hash the script commits to, plus a signature from your key.',
  multisig: 'Collect the required threshold of signatures from the committed keys, then build the spend.',
  htlc: 'Two paths: reveal the preimage to claim, or wait out the timeout to refund. Then sign and broadcast.',
  channel: 'Cooperative close needs both signatures; otherwise the funder takes the refund path after the timeout.',
  p2sh: 'Provide the redeem script in the input and satisfy its conditions with your key(s).',
};

function CopyRow({ label, value }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">{label}</div>
      <button
        onClick={() => navigator.clipboard?.writeText(String(value)).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}
        className="group w-full inline-flex items-start gap-2 rounded-lg border border-white/10 light:border-slate-200 bg-black/30 light:bg-slate-50 px-3 py-2 text-left transition-colors hover:border-kaspa-green/40"
        title="Copy"
      >
        <span className="flex-1 text-[11px] font-mono text-gray-300 light:text-slate-700 break-all leading-snug">{value}</span>
        {done ? <Check size={13} className="text-kaspa-green shrink-0 mt-0.5" /> : <Copy size={13} className="text-gray-500 group-hover:text-kaspa-green shrink-0 mt-0.5" />}
      </button>
    </div>
  );
}

function normalizeKit(obj) {
  const c = (obj && typeof obj === 'object' && obj.covenant) ? obj.covenant : obj;
  if (!c || typeof c !== 'object') return null;
  return {
    tx_id: c.tx_id || c.txid || null,
    network: c.network || null,
    address: c.p2sh_address || c.address || null,
    redeem_kind: c.redeem_kind || c.kind || null,
    redeem_script_hex: c.redeem_script_hex || null,
    script_hash: c.script_hash || c.script_hex || null,
    receiving_addresses: c.receiving_addresses || null,
  };
}

export default function Recover() {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [kit, setKit] = useState(null);
  const [txid, setTxid] = useState('');
  const [looking, setLooking] = useState(false);
  const [bal, setBal] = useState({ loading: false, kas: null, error: null, available: false, utxos: null });

  // When a kit loads, confirm the locked balance + UTXOs via a PUBLIC Kaspa node (read-only, never Covex).
  useEffect(() => {
    if (!kit?.address || !hasPublicApi(kit.network)) {
      setBal({ loading: false, kas: null, error: null, available: false, utxos: null });
      return undefined;
    }
    const ac = new AbortController();
    setBal({ loading: true, kas: null, error: null, available: true, utxos: null });
    (async () => {
      try {
        const [sompi, utxos] = await Promise.all([
          fetchAddressBalanceSompi(kit.address, kit.network, ac.signal),
          fetchAddressUtxos(kit.address, kit.network, ac.signal).catch(() => null),
        ]);
        setBal({ loading: false, kas: sompiToKas(sompi), error: null, available: true, utxos });
      } catch (e) {
        if (e.name !== 'AbortError') setBal({ loading: false, kas: null, error: 'Could not reach a public node for this network right now.', available: true, utxos: null });
      }
    })();
    return () => ac.abort();
  }, [kit]);

  const loadFromText = (text) => {
    setError('');
    let obj;
    try { obj = JSON.parse(text); }
    catch { setError('Could not read that as JSON. Paste the full contents of your covex-recovery-*.json file.'); return; }
    const n = normalizeKit(obj);
    if (!n || (!n.redeem_script_hex && !n.address)) {
      setError('That JSON does not look like a Covex recovery kit (no redeem script or P2SH address found).');
      return;
    }
    setKit(n);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const t = String(r.result || ''); setRaw(t); loadFromText(t); };
    r.readAsText(f);
  };

  const lookup = async (idArg) => {
    const id = String(idArg ?? txid).trim();
    if (!id) return;
    setLooking(true); setError('');
    try {
      const r = await fetch(`/api/covenants/${encodeURIComponent(id)}`);
      const c = await r.json();
      const n = normalizeKit(c);
      if (!n || !n.address) setError('Covenant not found, or it has no recovery data on record. Paste your saved kit instead.');
      else setKit(n);
    } catch {
      setError('Lookup failed (the Covex API may be unreachable). That is exactly when your saved kit matters - paste it below.');
    }
    setLooking(false);
  };

  // Deep link: /recover?id=<txid> (e.g. from a covenant's Recover button) auto-loads that covenant.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('id') || p.get('txid');
    if (id) { setTxid(id); lookup(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kind = String(kit?.redeem_kind || '').split(':')[0] || 'p2sh';
  const hint = KIND_HINTS[kind] || KIND_HINTS.p2sh;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 relative">
      <div className="covex-aurora" style={{ top: -30, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 360, height: 200, maxWidth: '90vw', opacity: 0.4 }} aria-hidden="true" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-11 h-11 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
            <LifeBuoy size={20} className="text-kaspa-green" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-white light:text-slate-900 leading-tight">Recover a covenant</h1>
            <p className="text-[12px] text-gray-400 light:text-slate-500">Settle your funds directly on Kaspa, with or without Covex.</p>
          </div>
        </div>

        {/* Trustless guarantee */}
        <div className="mt-4 rounded-2xl border border-kaspa-green/20 bg-kaspa-green/[0.05] p-4 detail-hero-enhanced">
          <div className="flex items-center gap-2 text-kaspa-green font-semibold text-sm mb-1.5"><ShieldCheck size={15} /> Chain-enforced, not Covex-enforced</div>
          <p className="text-[12.5px] text-gray-300 light:text-slate-600 leading-relaxed">
            Every Covex covenant is a script-locked P2SH commitment on Kaspa. The chain itself enforces the spend
            rules; Covex only helps build transactions and holds no keys. With the redeem script and your own
            key(s), you can settle through <span className="text-white light:text-slate-900">any Kaspa node</span> even if
            this site disappears. This page never asks for a private key and never moves funds for you.
          </p>
        </div>

        {!kit ? (
          <div className="mt-5 space-y-4">
            {/* Lookup by tx id (works while the API is reachable) */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-2">Look up by transaction id</div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 focus-within:border-kaspa-green/40">
                <Search size={15} className="text-gray-400 shrink-0" />
                <input
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
                  placeholder="covenant tx id"
                  className="flex-1 bg-transparent text-sm text-white light:text-slate-800 placeholder:text-gray-500 outline-none font-mono"
                />
                <button onClick={lookup} disabled={!txid.trim() || looking} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_14px_rgba(73,234,203,0.35)] transition-all">
                  {looking ? 'Looking…' : 'Look up'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 light:text-slate-400 mt-2">Convenient when Covex is online. If it is down, use your saved kit below.</p>
            </div>

            {/* Paste / upload saved kit (works fully offline) */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500">Paste your recovery kit</div>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green cursor-pointer hover:text-kaspa-green/80">
                  <Upload size={12} /> Upload .json
                  <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
                </label>
              </div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder='Paste the contents of your covex-recovery-*.json file here'
                rows={5}
                className="w-full rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 text-[11px] font-mono text-white light:text-slate-800 placeholder:text-gray-500 outline-none focus:border-kaspa-green/40 resize-y"
              />
              <button onClick={() => loadFromText(raw)} disabled={!raw.trim()} className="btn-shimmer mt-2.5 w-full py-2.5 rounded-xl font-bold text-sm bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_18px_rgba(73,234,203,0.3)] transition-all">
                Load recovery kit
              </button>
              <p className="text-[11px] text-gray-500 light:text-slate-400 mt-2">No kit yet? Open any of your covenants on Covex and use <span className="text-gray-300 light:text-slate-600">Recover &rarr; Download recovery kit</span>, then keep it somewhere safe.</p>
            </div>

            {error && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <button onClick={() => { setKit(null); setError(''); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-kaspa-green transition-colors">
              <ArrowLeft size={13} /> Load a different kit
            </button>

            {/* Independently-verified locked balance (read-only, via a public Kaspa node) */}
            {bal.available && (
              <div className="rounded-2xl border border-kaspa-green/25 bg-kaspa-green/[0.05] p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-1.5">
                  <span className="inline-flex items-center gap-2"><Coins size={13} className="text-kaspa-green" /> Funds locked here</span>
                  <span className="sm:ml-auto normal-case tracking-normal text-[10px] text-gray-500">via {kit.network} public node, not Covex</span>
                </div>
                {bal.loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin text-kaspa-green" /> Checking the chain…</div>}
                {bal.error && <div className="text-[12px] text-amber-300">{bal.error} You can still verify on the explorer below.</div>}
                {bal.kas != null && (
                  <div>
                    <div className="text-2xl font-black text-kaspa-green tabular-nums leading-none">
                      {bal.kas.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-sm font-bold">KAS</span>
                    </div>
                    <div className="text-[11px] text-gray-400 light:text-slate-500 mt-1">
                      {bal.kas > 0
                        ? 'Confirmed locked at this address, ready to redeem with the script + your key.'
                        : 'This address holds 0 KAS now - the covenant appears already settled (or not yet funded).'}
                    </div>
                  </div>
                )}
                {Array.isArray(bal.utxos) && bal.utxos.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] light:border-slate-200">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1.5">Coins to redeem ({bal.utxos.length} UTXO{bal.utxos.length === 1 ? '' : 's'})</div>
                    <div className="space-y-1">
                      {bal.utxos.slice(0, 6).map((u) => (
                        <div key={`${u.txid}:${u.index}`} className="flex items-center justify-between gap-2 text-[10.5px]">
                          <span className="font-mono text-gray-400 light:text-slate-500 truncate flex-1 min-w-0">{u.txid.slice(0, 16)}…:{u.index}</span>
                          <span className="shrink-0 tabular-nums text-gray-200 light:text-slate-700">{sompiToKas(u.amountSompi).toLocaleString(undefined, { maximumFractionDigits: 4 })} KAS{u.daaScore != null ? <span className="text-gray-500"> · DAA {u.daaScore.toLocaleString()}</span> : null}</span>
                        </div>
                      ))}
                      {bal.utxos.length > 6 && <div className="text-[10px] text-gray-500">+ {bal.utxos.length - 6} more</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* The covenant's recovery data */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-kaspa-green">{kind}</span>
                {kit.network && <span className="text-[10px] text-gray-500 light:text-slate-400 font-mono">{kit.network}</span>}
              </div>
              <CopyRow label="P2SH address (where the funds are locked)" value={kit.address} />
              <CopyRow label="Redeem script (hex)" value={kit.redeem_script_hex} />
              {kit.script_hash && <CopyRow label="On-chain script hash" value={kit.script_hash} />}
              {!kit.redeem_script_hex && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5 text-[11px] text-amber-300">
                  This kit has no redeem script (the covenant was created elsewhere and not claimed on Covex). You need the original redeem script from whoever built it to spend the funds.
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                {kit.address && (
                  <a href={explorerAddressUrl(kit.address, kit.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green hover:underline">
                    View funds on explorer <ExternalLink size={11} />
                  </a>
                )}
                {kit.tx_id && (
                  <a href={explorerTxUrl(kit.tx_id, kit.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green hover:underline">
                    Deploy transaction <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>

            {/* Step-by-step redeem */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-3">How to settle this covenant</div>
              <ol className="space-y-2.5 text-[12.5px] text-gray-300 light:text-slate-600">
                {[
                  <>Confirm the funds and that the spend condition is met: open the <span className="text-white light:text-slate-900">P2SH address</span> on any Kaspa node or explorer and read its UTXOs.</>,
                  <><span className="text-white light:text-slate-900">This covenant&apos;s rule ({kind}):</span> {hint}</>,
                  <>Build a spend transaction that provides the <span className="font-mono text-white light:text-slate-900">redeem_script_hex</span> in the input, satisfy the condition, and sign with your own key <KeyRound size={11} className="inline text-kaspa-green" /> (it never leaves your device).</>,
                  <>Broadcast through any Kaspa node. The network accepts it because the script blake2b-hashes to this covenant&apos;s on-chain commitment - no Covex involvement required.</>,
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-kaspa-green/10 border border-kaspa-green/30 text-kaspa-green text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-gray-500 light:text-slate-400 mt-3 pt-3 border-t border-white/[0.06] light:border-slate-200 leading-relaxed">
                A push-button in-browser redeemer (steps 3-4 automated via kaspa-wasm + a public node) is in the works and will be added here once it is end-to-end tested on the Kaspa mainnet. Until then this kit gives any Kaspa developer everything needed, and your funds remain fully under your control.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
