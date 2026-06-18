import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { signMarketResolve } from '../lib/ownership';
import HonestLimits from '../components/HonestLimits';
import TrustBadge from '../components/TrustBadge';
import {
  ShieldCheck, AlertTriangle, ArrowLeft, Trophy, Clock,
  ExternalLink, Layers, Check, Loader2, Coins,
} from 'lucide-react';

// Conjoined-covenant parimutuel markets. Each market commits two outcome secrets (H_A/H_B);
// bettors place YES/NO orders that the matcher pairs into mini-pools, each funded by a bundle
// of binary_oracle_select P2SH covenants. Revealing one secret routes the whole bundle on-chain.
const net = () => (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
const api = (path, body) =>
  fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());

const fmtKickoff = (s) => {
  if (!s) return null;
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return s; }
};

// The honest market badge: the shared, pressable TrustBadge driven by the market's
// real reality (on-chain custody, oracle-resolved outcome). Pressing it opens the
// TransparencyModal, which surfaces the oracle-resolution trust boundary. Never a
// bare green "On-chain enforced" span - the outcome is decided by the oracle's reveal.
function EnforcementBadge({ size = 'md', covenant }) {
  return (
    <TrustBadge
      size={size}
      covenant={{ covenant_type: 'prediction-market', enforcement_reality: 'hybrid', network: net(), ...(covenant || {}) }}
    />
  );
}

function OddsCard({ label, mult, accent }) {
  const profit = mult >= 1;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 transition-all ${accent ? 'border-kaspa-green/50 hover-lift-premium' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
      style={accent ? { background: 'linear-gradient(135deg, rgba(73,234,203,0.10), rgba(255,255,255,0.02))', boxShadow: '0 0 26px rgba(73,234,203,0.22), inset 0 1px 0 rgba(255,255,255,0.05)' } : undefined}
    >
      {accent && <span className="covex-aurora" aria-hidden="true" style={{ top: -28, right: -18, width: 120, height: 96 }} />}
      <div className="relative flex items-center justify-between mb-1">
        <span className="kicker">If "{label}" wins</span>
        {accent && <Trophy size={15} className="text-kaspa-green shrink-0" />}
      </div>
      <div className={`relative text-3xl sm:text-4xl font-black leading-none ${profit ? 'text-kaspa-green' : 'text-amber-300'}`}>{mult ? mult.toFixed(2) : '-'}<span className="text-xl">×</span></div>
      <div className="relative text-[10px] text-gray-500 mt-1">{mult ? (profit ? 'winner profits' : 'winner still loses') : 'no funded pool yet'}</div>
    </div>
  );
}

function MarketDetail({ id }) {
  const { address, signMessage } = useWallet();
  const [book, setBook] = useState(null);
  const [market, setMarket] = useState(null);
  const [side, setSide] = useState(0);
  const [stake, setStake] = useState('1');
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [settleRes, setSettleRes] = useState(null);
  const [oraclePk, setOraclePk] = useState(null);

  useEffect(() => { if (address && !addr) setAddr(address); }, [address]); // eslint-disable-line

  const load = useCallback(() => {
    api('/covenant/market/book', { market_id: id }).then(setBook).catch(() => {});
    api('/covenant/market/get', { market_id: id }).then(setMarket).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // The disclosed oracle's x-only signing key (BIP340). The /oracle/pubkey endpoint
  // returns `xonly_pubkey` as its canonical field; prefer it, fall back gracefully for
  // older shapes. This is the named, disclosed Covex oracle - never trustless.
  useEffect(() => { fetch('/api/oracle/pubkey').then((r) => (r.ok ? r.json() : null)).then((j) => j && setOraclePk(j.xonly_pubkey || j.oracle_xonly_pubkey || j.oracle_pubkey || j.pubkey || null)).catch(() => {}); }, []);

  const act = async (label, fn) => {
    setBusy(label); setMsg(null);
    try {
      const r = await fn();
      setMsg(r && r.success === false ? { ok: false, text: r.error || 'failed' } : { ok: true, text: `${label} done` });
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(''); load();
  };

  const doSettle = async () => {
    setBusy('Settle'); setMsg(null);
    try { setSettleRes(await api('/covenant/market/settle', { market_id: id })); }
    catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(''); load();
  };

  if (!book || !market) {
    return <div className="flex items-center justify-center py-32 text-gray-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading market…</div>;
  }
  if (book.success === false) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-gray-400">Market not found. <Link to="/" className="text-kaspa-green">Back to markets</Link></div>;
  }

  const odds = book.odds || {};
  const resolved = book.resolved;
  const wonLabel = resolved ? (book.revealed_outcome === 0 ? book.outcome_a : book.outcome_b) : null;
  const f = (book.fee_bps ?? 3000) / 10000, r = (book.rebate_bps ?? 5000) / 10000;
  const feePct = Math.round(f * 100), rebatePct = Math.round(r * 100);
  const breakeven = odds.breakeven_lp || (f / Math.max(1e-9, 1 - f - r));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 light:text-slate-500 hover:text-kaspa-green mb-4"><ArrowLeft size={15} /> Explorer</Link>

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] p-6 sm:p-8 mb-5" style={{ background: 'linear-gradient(135deg, rgba(73,234,203,0.08) 0%, rgba(10,10,15,0.35) 62%)' }}>
        <span className="covex-aurora" aria-hidden="true" style={{ top: -44, right: -34, width: 260, height: 170 }} />
        <div className="relative flex items-start justify-between gap-3 mb-3">
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight min-w-0 break-words">{book.question}</h1>
          {resolved
            ? <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-300"><Trophy size={12} /> {wonLabel}</span>
            : <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-kaspa-green/10 border border-kaspa-green/25 text-kaspa-green"><span className="w-1.5 h-1.5 rounded-full bg-kaspa-green zk-live-glow" /> Open</span>}
        </div>
        <div className="relative flex flex-wrap items-center gap-3 text-[12px] text-gray-300">
          <EnforcementBadge covenant={{ name: book.question, network: market.network }} />
          {market.kickoff_utc && <span className="inline-flex items-center gap-1"><Clock size={12} className="text-kaspa-green" /> {fmtKickoff(market.kickoff_utc)}</span>}
          {market.source_url && <a href={market.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-kaspa-green">Source <ExternalLink size={11} /></a>}
        </div>
      </div>

      {/* Live odds */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <OddsCard label={book.outcome_a} mult={odds.if_a_wins_multiplier} accent={resolved && book.revealed_outcome === 0} />
        <OddsCard label={book.outcome_b} mult={odds.if_b_wins_multiplier} accent={resolved && book.revealed_outcome === 1} />
      </div>
      <div className="text-[11px] text-gray-500 mb-5">
        Funded pools: <span className="text-white light:text-slate-900">{book.funded_pool_a_kas} KAS</span> {book.outcome_a} · <span className="text-white light:text-slate-900">{book.funded_pool_b_kas} KAS</span> {book.outcome_b}
        {(book.open_pool_a_kas + book.open_pool_b_kas) > 0 && <> · open: {book.open_pool_a_kas}/{book.open_pool_b_kas} KAS</>}
      </div>

      {/* Pools - reward / hedge-rebate / fee split of the matched pool */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
        <div className="text-white light:text-slate-900 font-semibold mb-3 flex items-center gap-2"><Coins size={16} className="text-kaspa-green" /> Pools</div>
        {(book.funded_pool_a_kas + book.funded_pool_b_kas) === 0 ? (
          <div className="text-[12px] text-gray-500">No matched liquidity yet - the reward and hedge pools fill as bets get matched.</div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3 mb-1"><span className="kicker">Total matched</span><span className="text-2xl font-black leading-none text-right" style={{ background: 'linear-gradient(90deg,#49EACB,#E8AF34)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{(book.funded_pool_a_kas + book.funded_pool_b_kas).toFixed(2)} <span className="text-sm">KAS</span></span></div>
            <div className="flex items-center justify-between gap-3 text-[12px] mb-3"><span className="text-gray-400 light:text-slate-500">{feePct > 0 ? `House fee pool (${feePct}%)` : 'House fee'}</span><span className="text-amber-300 light:text-amber-600 shrink-0">{feePct > 0 ? `${(f * (book.funded_pool_a_kas + book.funded_pool_b_kas)).toFixed(2)} KAS` : 'no fee'}</span></div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[[book.outcome_a, book.funded_pool_a_kas, book.funded_pool_b_kas, 0], [book.outcome_b, book.funded_pool_b_kas, book.funded_pool_a_kas, 1]].map(([lbl, mine, opp, oc]) => (
                <div key={oc} className={`rounded-xl border p-3.5 text-[12px] hover-lift-premium transition-all ${resolved && book.revealed_outcome === oc ? 'border-kaspa-green/50' : 'border-white/10 bg-white/[0.02]'}`}
                  style={resolved && book.revealed_outcome === oc ? { background: 'linear-gradient(135deg, rgba(73,234,203,0.10), rgba(255,255,255,0.02))', boxShadow: '0 0 20px rgba(73,234,203,0.20)' } : undefined}>
                  <div className="flex items-center justify-between gap-2 mb-1.5"><span className="kicker truncate">If "{lbl}" wins</span>{resolved && book.revealed_outcome === oc && <Trophy size={13} className="text-kaspa-green shrink-0" />}</div>
                  <div className="flex items-center justify-between gap-2"><span className="text-kaspa-green">Reward pool</span><span className="text-white light:text-slate-900 shrink-0">{((1 - f) * mine + (1 - f - r) * opp).toFixed(2)} KAS</span></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-sky-300 light:text-sky-600">Hedge / rebate pool</span><span className="text-white light:text-slate-900 shrink-0">{(r * opp).toFixed(2)} KAS</span></div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-3 pt-3 border-t border-white/[0.06] text-[11px] text-gray-500 leading-relaxed break-words">
          <span className="text-gray-300 light:text-slate-700 font-semibold">Oracle:</span> the outcome is resolved by revealing one committed secret - no Covex key sits in the money path.
          {oraclePk && <> Disclosed oracle x-only key <span className="font-mono text-gray-400">{String(oraclePk).slice(0, 12)}…</span>.</>}
          {market.h_a && <> Commitments <span className="font-mono text-gray-400">H_A {market.h_a.slice(0, 8)}… · H_B {market.h_b.slice(0, 8)}…</span>.</>}
        </div>
      </div>

      {/* The honest economics warning */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 mb-6">
        <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">You can be right and still lose.</span> The winner multiplier is
          {' '}{(1 - f).toFixed(2)} + {(1 - f - r).toFixed(2)}×(opposing pool ÷ your pool). A correct bet only profits when the opposing pool is more than
          {' '}<span className="font-semibold">{breakeven.toFixed(2)}×</span> your side - the house takes {feePct}% and losers get {rebatePct}% back.
        </p>
      </div>

      {/* Always-visible honest limits for the prediction-market covenant kind (no click).
          Reality is hybrid: on-chain custody + payout, oracle-resolved outcome - never bare 'on-chain'. */}
      <HonestLimits covenant={{ enforcement_reality: 'hybrid', covenant_type: 'prediction-market' }} kind="market" />

      {/* Place a bet */}
      {!resolved && (
        <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
          <div className="text-white light:text-slate-900 font-semibold mb-3 flex items-center gap-2"><Layers size={16} className="text-kaspa-green" /> Place an order</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[book.outcome_a, book.outcome_b].map((label, i) => (
              <button key={i} onClick={() => setSide(i)}
                className={`py-2.5 px-2 rounded-xl text-sm font-semibold border transition-all truncate ${side === i ? 'bg-kaspa-green text-black border-kaspa-green' : 'bg-white/[0.03] light:bg-white text-gray-200 light:text-slate-700 border-white/10 light:border-slate-200 hover:border-white/25'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input value={stake} onChange={(e) => setStake(e.target.value)} type="number" min="1" step="0.5"
              className="w-full sm:w-28 px-3 py-2 rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 text-sm" placeholder="KAS" />
            <input value={addr} onChange={(e) => setAddr(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 text-sm font-mono text-[11px]" placeholder="your kaspatest:q... address" />
          </div>
          <div className="flex gap-2">
            <button disabled={!!busy || !addr || !(parseFloat(stake) > 0)}
              onClick={() => act('Bet placed', async () => {
                const o = await api('/covenant/market/order', { market_id: id, side, stake_kas: parseFloat(stake), bettor_addr: addr.trim() });
                if (o && o.success === false) return o;
                // Immediately match: if the opposite side has open liquidity, this funds the
                // conjoined bundle (several covenants) right now.
                return await api('/covenant/market/match', { market_id: id });
              })}
              className="btn-shimmer flex-1 min-w-0 truncate py-3 rounded-xl font-extrabold text-sm bg-kaspa-green text-black disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_0_1px_rgba(73,234,203,0.35),0_10px_30px_-10px_rgba(73,234,203,0.5)] hover:shadow-[0_0_28px_rgba(73,234,203,0.45)] transition-shadow">
              {busy === 'Bet placed' ? <Loader2 className="animate-spin inline" size={15} /> : `Back "${side === 0 ? book.outcome_a : book.outcome_b}"`}
            </button>
            <button disabled={!!busy} title="Match any open orders into conjoined bundles"
              onClick={() => act('Matched', () => api('/covenant/market/match', { market_id: id }))}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm border border-white/15 light:border-slate-200 text-gray-200 light:text-slate-700 hover:border-kaspa-green/40 disabled:opacity-40 shrink-0">
              {busy === 'Matched' ? <Loader2 className="animate-spin inline" size={15} /> : 'Match'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">A bet is an order on one side. When the other side has liquidity it's matched into a mini-pool and funded by a conjoined bundle (several on-chain covenants created at once).</p>
        </div>
      )}

      {/* Order book */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
        <div className="text-white light:text-slate-900 font-semibold mb-3">Order book</div>
        {(!book.orders || book.orders.length === 0) ? (
          <div className="text-sm text-gray-500">No orders yet - be the first.</div>
        ) : (
          <div className="space-y-1.5">
            {book.orders.map((o) => (
              <div key={o.order_id} className="flex items-center gap-2 text-[12px] py-1.5 px-3 rounded-lg bg-white/[0.02] light:bg-slate-50 border border-white/[0.05] light:border-slate-200">
                <span className={`truncate min-w-0 flex-1 ${o.side === 0 ? 'text-kaspa-green' : 'text-sky-300 light:text-sky-600'}`}>{o.side === 0 ? book.outcome_a : book.outcome_b}</span>
                <span className="text-white light:text-slate-900 shrink-0">{o.stake_kas} KAS</span>
                <span className={`inline-flex items-center gap-1 shrink-0 ${o.status === 'funded' ? 'text-emerald-300 light:text-emerald-600' : 'text-gray-500'}`}>
                  {o.status === 'funded' ? <><Check size={11} /> funded</> : 'open'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve + pay out: one click reveals the winning secret AND settles every funded leg */}
      {!resolved && (
        <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
          <div className="text-white light:text-slate-900 font-semibold mb-1">Resolve &amp; pay out</div>
          <p className="text-[11px] text-gray-500 mb-3">When the real result is in, click the winner: Covex reveals that one committed secret (single-secret policy) and immediately settles every funded leg on-chain.</p>
          <p className="text-[11px] text-amber-200/80 light:text-amber-700 mb-3 flex items-start gap-1.5">
            <ShieldCheck size={13} className="text-amber-400 shrink-0 mt-0.5" />
            Only the wallet that created this market can resolve it. You'll be prompted to sign a one-time message proving ownership before the outcome is revealed.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[book.outcome_a, book.outcome_b].map((label, i) => (
              <button key={i} disabled={!!busy}
                onClick={() => act(`Resolving ${label}`, async () => {
                  // C2: only the creator wallet may resolve, proven by a signature over
                  // covex-market-resolve:{id}:{outcome}:{nonce}. Sign before revealing.
                  if (!address) return { success: false, error: 'Connect the market creator wallet to resolve.' };
                  let proof;
                  try { proof = await signMarketResolve(id, i, address, signMessage); }
                  catch (e) { return { success: false, error: e?.message || String(e) }; }
                  const r = await api('/covenant/market/resolve', { market_id: id, outcome: i, ...proof });
                  if (r && r.success === false) return r;
                  const s = await api('/covenant/market/settle', { market_id: id });
                  setSettleRes(s);
                  return s;
                })}
                className="py-2.5 px-2 truncate rounded-xl text-sm font-semibold border border-white/15 light:border-slate-200 text-gray-200 light:text-slate-700 hover:border-emerald-400/40 disabled:opacity-40">
                {busy === `Resolving ${label}` ? <Loader2 className="animate-spin inline" size={15} /> : `"${label}" won → pay out`}
              </button>
            ))}
          </div>
        </div>
      )}

      {resolved && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5 mb-5">
          <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-1.5"><Trophy size={16} /> Resolved - {wonLabel} won</div>
          <p className="text-[12px] text-gray-300 leading-relaxed mb-3">
            The winning secret is revealed. Every funded leg can be claimed on-chain with the secret + the winner's key -
            through any Kaspa node, no Covex required. Winners take the pool (minus {feePct}% fee); losers reclaim {rebatePct}%.
          </p>
          <button disabled={!!busy} onClick={doSettle}
            className="btn-shimmer py-2.5 px-5 rounded-xl font-bold text-sm bg-emerald-400 text-black disabled:opacity-40 disabled:cursor-not-allowed">
            {busy === 'Settle' ? <Loader2 className="animate-spin inline" size={15} /> : 'Settle / claim all legs'}
          </button>
          {settleRes && settleRes.success && (
            <div className="mt-3 text-[12px] text-gray-300">
              Settled <span className="text-white font-semibold">{settleRes.legs_settled}/{settleRes.legs_total}</span> legs on-chain.
              <div className="mt-1.5 space-y-1">
                {(settleRes.settled || []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                    <span className={s.ok ? 'text-emerald-300' : 'text-red-300'}>{s.ok ? '✓' : '×'}</span>
                    <span className="text-gray-400 w-20">{s.role}</span>
                    {s.spend_tx ? <span className="text-gray-500 truncate">{String(s.spend_tx).slice(0, 20)}…</span> : <span className="text-red-300/70 truncate">{String(s.error || '')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {msg && (
        <div className={`text-[12px] rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-300 bg-red-500/10 border border-red-500/20'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// No default export and no standalone market list: per the constitution, prediction
// markets are NOT a separate section. They live in the Explorer and render their full
// custom market website on the covenant page (CovenantInteractive) via MarketView below.
//
// Reusable market website (betting, live odds, pools, resolve), rendered on a
// prediction-market covenant's page in the Explorer (CovenantInteractive).
export function MarketView({ marketId }) {
  return <MarketDetail id={marketId} />;
}
