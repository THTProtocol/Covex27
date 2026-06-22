import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { signMarketResolve } from '../lib/ownership';
import { enforcementSummary } from '../lib/enforcement-copy';
import HonestLimits from '../components/HonestLimits';
import TrustBadge from '../components/TrustBadge';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import Spinner from '../components/ui/Spinner';
import {
  ShieldCheck, AlertTriangle, ArrowLeft, Trophy, Clock,
  ExternalLink, Layers, Check, Coins, ChevronDown, ArrowRight,
} from 'lucide-react';

// Tabular-numeric mono utility - shared .num class from index.css so columns
// align across light/dark and small/large screens. Single source of truth.
const num = 'num';

// Conjoined-covenant parimutuel markets. Each market commits two outcome secrets (H_A/H_B);
// bettors place YES/NO orders that the matcher pairs into mini-pools, each funded by a bundle
// of binary_oracle_select P2SH covenants. Revealing one secret routes the whole bundle on-chain.
const net = () => (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'mainnet';
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
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all ${accent ? 'border-emerald-500/40 hover-lift-premium' : 'border-white/10 bg-white/[0.02] hover-lift hover:border-white/20'}`}
      style={accent ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(255,255,255,0.02))', boxShadow: '0 0 26px rgba(16,185,129,0.22), inset 0 1px 0 rgba(255,255,255,0.05)' } : undefined}
    >
      {accent && <span className="covex-aurora" aria-hidden="true" style={{ top: -28, right: -18, width: 120, height: 96 }} />}
      <div className="relative flex items-center justify-between gap-1 mb-1">
        <span className="kicker min-w-0 truncate">If "{label}" wins</span>
        {accent && <Trophy size={15} className="text-emerald-300 light:text-emerald-600 shrink-0" />}
      </div>
      <div className={`relative flex items-baseline flex-wrap text-[26px] sm:text-4xl font-extrabold leading-none ${num} ${accent ? 'text-emerald-300 light:text-emerald-600' : (profit ? 'text-kaspa-green' : 'text-amber-300')}`}>{mult ? mult.toFixed(2) : '-'}<span className="text-lg sm:text-xl">×</span></div>
      <div className="relative text-[10px] text-gray-500 light:text-slate-500 mt-1">{mult ? (profit ? 'winner profits' : 'winner still loses') : 'no funded pool yet'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local subcomponents for MarketDetail. Hoisted to module scope so they are
// stable component identities across MarketDetail renders (defining components
// inside the parent would remount them every render and break input focus,
// busy state, etc). Pure presentation + thin event callbacks; the parent owns
// all state, signature paths, and request payloads.
// ---------------------------------------------------------------------------

// Title, resolved/open chip, network + expiry meta row.
// Resolved chip uses the same emerald palette as the resolved banner so the
// settled state speaks with one voice (was amber/orange, reconciled to emerald).
function MarketHero({ book, market, resolved, wonLabel }) {
  return (
    <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 mb-6">
      <span className="covex-aurora" aria-hidden="true" style={{ top: -44, right: -34, width: 260, height: 170 }} />
      <div className="relative flex items-start justify-between gap-3 mb-3">
        <h1 className="h-display text-white light:text-slate-900 min-w-0 break-words" style={{ textWrap: 'balance' }}>{book.question}</h1>
        {resolved
          ? <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 light:text-emerald-700"><Trophy size={12} /> {wonLabel}</span>
          : <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-kaspa-green/10 border border-kaspa-green/25 text-kaspa-green"><span className="w-1.5 h-1.5 rounded-full bg-kaspa-green zk-live-glow" /> Open</span>}
      </div>
      <div className="relative flex flex-wrap items-center gap-3 text-[12px] text-gray-300 light:text-slate-600">
        <EnforcementBadge covenant={{ name: book.question, network: market.network }} />
        {market.kickoff_utc && <span className="inline-flex items-center gap-1"><Clock size={12} className="text-kaspa-green" /> {fmtKickoff(market.kickoff_utc)}</span>}
        {market.source_url && <a href={market.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-kaspa-green">Source <ExternalLink size={11} /></a>}
      </div>
    </div>
  );
}

// Live YES/NO odds cards + funded-pool one-liner. Shared by the order form
// (open) and the resolved view, so winning-leg highlighting stays consistent.
function OddsRow({ book, odds, resolved, showOpen }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <OddsCard label={book.outcome_a} mult={odds.if_a_wins_multiplier} accent={resolved && book.revealed_outcome === 0} />
        <OddsCard label={book.outcome_b} mult={odds.if_b_wins_multiplier} accent={resolved && book.revealed_outcome === 1} />
      </div>
      <div className={`text-[11px] text-gray-500 light:text-slate-500 ${num}`}>
        Funded pools: <span className="text-white light:text-slate-900">{book.funded_pool_a_kas} KAS</span> {book.outcome_a} · <span className="text-white light:text-slate-900">{book.funded_pool_b_kas} KAS</span> {book.outcome_b}
        {showOpen && (book.open_pool_a_kas + book.open_pool_b_kas) > 0 && <> · open: {book.open_pool_a_kas}/{book.open_pool_b_kas} KAS</>}
      </div>
    </>
  );
}

// Place-an-order panel (open-state only). Owns the inlined OddsRow so the
// bettor sees price + stake + back-button in one card without scrolling.
// All request payloads (/order, /match) are passed through unchanged via
// the onPlaceBet / onMatch callbacks the parent owns.
function PlaceOrderCard({
  book, market, odds, resolved,
  side, setSide, stake, setStake, addr, setAddr,
  busy, onPlaceBet, onMatch,
}) {
  return (
    <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-6">
      <div className="text-white light:text-slate-900 font-semibold mb-3 flex items-center gap-2"><Layers size={16} className="text-kaspa-green" /> Place an order</div>

      {/* Inlined live odds */}
      <div className="mb-4">
        <OddsRow book={book} odds={odds} resolved={resolved} showOpen />
      </div>

      {/* On <sm the sticky MobileBetRail owns the side toggle, stake, and Back/Match buttons.
          We hide the duplicate inline action set here so phones get one clean order surface;
          the payout-address input stays visible because the rail doesn't include it. */}
      <div className="hidden sm:grid grid-cols-2 gap-2 mb-3">
        {[book.outcome_a, book.outcome_b].map((label, i) => (
          <button key={i} onClick={() => setSide(i)}
            className={`py-2.5 px-2 rounded-xl text-sm font-semibold border transition-all truncate ${side === i ? 'bg-kaspa-green text-black border-kaspa-green' : 'bg-white/[0.03] light:bg-white text-gray-200 light:text-slate-700 border-white/10 light:border-slate-200 hover:border-white/25'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input value={stake} onChange={(e) => setStake(e.target.value)} type="number" min="1" step="0.5"
          className={`hidden sm:block w-full sm:w-28 px-3 py-2 rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 text-sm ${num}`} placeholder="KAS" />
        <input value={addr} onChange={(e) => setAddr(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 text-sm font-mono text-[11px]" placeholder="your kaspatest:q... address" />
      </div>
      <div className="hidden sm:flex gap-2">
        <Button
          variant="kaspa" size="lg" shimmer
          disabled={!!busy || !addr || !(parseFloat(stake) > 0)}
          onClick={onPlaceBet}
          className="flex-1 min-w-0 truncate font-extrabold"
        >
          {busy === 'Bet placed' ? <Spinner variant="inverse" size="xs" /> : `Back "${side === 0 ? book.outcome_a : book.outcome_b}"`}
        </Button>
        <Button
          variant="glass" size="lg"
          disabled={!!busy}
          title="Match any open orders into conjoined bundles"
          onClick={onMatch}
          className="shrink-0"
        >
          {busy === 'Matched' ? <Spinner variant="mono" size="xs" /> : 'Match'}
        </Button>
      </div>
      <p className="text-[11px] text-gray-500 light:text-slate-500 mt-2">A bet is an order on one side. When the other side has liquidity it's matched into a mini-pool and funded by a conjoined bundle (several on-chain covenants created at once).</p>
    </div>
  );
}

// Creator-only resolve panel. Signature flow is unchanged: the parent's
// onResolve callback owns signMarketResolve + /resolve + /settle in the same
// order, with the same payload shape, as before. UI uses emerald end-to-end
// to match the resolved banner palette.
function ResolvePayout({ book, busy, onResolve }) {
  return (
    <div className="glass-panel rounded-2xl border border-emerald-500/25 p-6 mb-6">
      <div className="text-white light:text-slate-900 font-semibold mb-1">Resolve &amp; pay out</div>
      <p className="text-[11px] text-gray-500 light:text-slate-500 mb-3">When the real result is in, click the winner: Covex reveals that one committed secret (single-secret policy) and immediately settles every funded leg on-chain.</p>
      <p className="text-[11px] text-emerald-200/90 light:text-emerald-700 mb-3 flex items-start gap-1.5">
        <ShieldCheck size={13} className="text-emerald-400 light:text-emerald-600 shrink-0 mt-0.5" />
        Only the wallet that created this market can resolve it. You'll be prompted to sign a one-time message proving ownership before the outcome is revealed.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[book.outcome_a, book.outcome_b].map((label, i) => (
          <Button key={i} variant="glass" size="lg" disabled={!!busy}
            onClick={() => onResolve(i, label)}
            className="!border-emerald-500/30 hover:!border-emerald-400 hover:!bg-emerald-500/10 light:!border-emerald-500/40 light:hover:!border-emerald-600 light:hover:!bg-emerald-500/10 light:!text-slate-900 !font-bold truncate">
            {busy === `Resolving ${label}` ? <Spinner variant="mono" size="xs" /> : `"${label}" won, pay out`}
          </Button>
        ))}
      </div>
    </div>
  );
}

// Resolved/settled view. Emerald palette matches the chip in MarketHero so
// the whole "resolved" state reads in one color.
function Settled({ wonLabel, feePct, rebatePct, busy, settleRes, onSettle }) {
  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5 mb-6">
      <div className="flex items-center gap-2 text-emerald-300 light:text-emerald-700 font-semibold mb-1.5"><Trophy size={16} /> Resolved, {wonLabel} won</div>
      <p className="text-[12px] text-gray-300 light:text-slate-600 leading-relaxed mb-3">
        The winning secret is revealed. Every funded leg can be claimed on-chain with the secret + the winner's key,
        through any Kaspa node, no Covex required. Winners take the pool (minus {feePct}% fee); losers reclaim {rebatePct}%.
      </p>
      <Button variant="kaspa" size="lg" shimmer disabled={!!busy} onClick={onSettle}>
        {busy === 'Settle' ? <Spinner variant="inverse" size="xs" /> : 'Settle / claim all legs'}
      </Button>
      {settleRes && settleRes.success && (
        <div className="mt-3 text-[12px] text-gray-300 light:text-slate-700">
          Settled <span className={`text-white light:text-slate-900 font-semibold ${num}`}>{settleRes.legs_settled}/{settleRes.legs_total}</span> legs on-chain.
          <div className="mt-1.5 space-y-1">
            {(settleRes.settled || []).map((s, i) => (
              <div key={i} className={`flex items-center gap-2 text-[11px] ${num}`}>
                <span className={s.ok ? 'text-emerald-300 light:text-emerald-600' : 'text-red-300 light:text-red-600'}>{s.ok ? '✓' : '×'}</span>
                <span className="text-gray-400 light:text-slate-500 w-20">{s.role}</span>
                {s.spend_tx ? <span className="text-gray-500 light:text-slate-500 truncate">{String(s.spend_tx).slice(0, 20)}…</span> : <span className="text-red-300/70 light:text-red-600/80 truncate">{String(s.error || '')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mobile-only sticky bottom rail (<sm). Mirrors the StickyActionRail visual
// pattern (fixed inset-x-0 bottom-0, safe-area-inset-bottom, mx-3 mb-3 rounded
// glass panel) so the bettor gets a one-tap back-YES / back-NO without scrolling
// past HonestLimits. Calls the same onPlaceBet handler as PlaceOrderCard, so
// the request payload (/order + /match) is unchanged. Hidden on sm+ where the
// full PlaceOrderCard is already in the viewport. Reduced-motion safe (no slide).
function MobileBetRail({
  book, side, setSide, stake, setStake, addr, busy, onPlaceBet,
}) {
  const sideLabel = side === 0 ? book.outcome_a : book.outcome_b;
  const disabled = !!busy || !addr || !(parseFloat(stake) > 0);
  return (
    <div
      role="region"
      aria-label="Place bet"
      className="sm:hidden fixed inset-x-0 bottom-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-3 mb-3 rounded-2xl border border-white/10 light:border-slate-200 bg-[#0a0a0a]/95 light:bg-white/95 backdrop-blur-xl p-3 shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.7)] light:shadow-[0_-8px_28px_-12px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-2.5">
          {/* YES <-> NO toggle (segmented). Same setSide as PlaceOrderCard. */}
          <div role="radiogroup" aria-label="Bet side" className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] light:bg-slate-100 border border-white/10 light:border-slate-200">
            {[book.outcome_a, book.outcome_b].map((label, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={side === i}
                onClick={() => setSide(i)}
                className={`py-2 px-2 rounded-lg text-[12px] font-semibold border transition-all truncate ${side === i ? 'bg-kaspa-green text-black border-kaspa-green' : 'bg-transparent text-gray-300 light:text-slate-600 border-transparent hover:text-white light:hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Amount + primary back button on one row */}
          <div className="flex items-stretch gap-2">
            <label className="sr-only" htmlFor="mobile-bet-stake">Stake amount in KAS</label>
            <input
              id="mobile-bet-stake"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              type="number" inputMode="decimal" min="1" step="0.5"
              className={`w-24 shrink-0 px-3 py-3 rounded-xl bg-black/30 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 text-sm ${num}`}
              placeholder="KAS"
            />
            <Button
              variant="kaspa" size="lg" shimmer
              disabled={disabled}
              onClick={onPlaceBet}
              className="flex-1 min-w-0 truncate font-extrabold"
            >
              {busy === 'Bet placed'
                ? <Spinner variant="inverse" size="xs" />
                : <span className="inline-flex items-center gap-1.5 truncate">Back "{sideLabel}" <ArrowRight size={14} aria-hidden="true" /></span>}
            </Button>
          </div>
          {!addr && (
            <p className="text-[10.5px] text-gray-500 light:text-slate-500 leading-snug">Set your payout address in the order card above to enable betting.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketDetail({ id }) {
  const { address, signMessage } = useWallet();
  const [book, setBook] = useState(null);
  const [market, setMarket] = useState(null);
  // Preselect the outcome the visitor came to back: the event site deep-links the
  // market with ?side=0 (outcome A) or ?side=1 (outcome B). Read it once on mount
  // from the URL so "Back Argentina" lands with Argentina preselected. Anything
  // that is not exactly 0 or 1 falls back to 0.
  const [side, setSide] = useState(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('side');
      return raw === '1' ? 1 : 0;
    } catch {
      return 0;
    }
  });
  const [stake, setStake] = useState('1');
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [settleRes, setSettleRes] = useState(null);
  const [oraclePk, setOraclePk] = useState(null);
  const [payoutsOpen, setPayoutsOpen] = useState(false);

  useEffect(() => { if (address && !addr) setAddr(address); }, [address]); // eslint-disable-line

  const load = useCallback(() => {
    api('/covenant/market/book', { market_id: id }).then(setBook).catch(() => {});
    api('/covenant/market/get', { market_id: id }).then(setMarket).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // The resolver's x-only signing key (BIP340). The /oracle/pubkey endpoint
  // returns `xonly_pubkey` as its canonical field; prefer it, fall back gracefully for
  // older shapes. This is the external resolver the deployer binds by pubkey at deploy,
  // never trustless. Covex never attests real-world facts.
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
    return (
      <div className="max-w-3xl mx-auto px-4 py-8" role="status" aria-busy="true" aria-label="Loading market">
        {/* Header skeleton mirroring the resolved layout: title bar + meta row. */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] light:border-slate-200 p-6 sm:p-8 mb-6 bg-white/[0.02] light:bg-slate-50">
          <Skeleton className="h-9 sm:h-12 w-3/4 mb-3" />
          <Skeleton className="h-9 sm:h-12 w-1/2 mb-4" />
          <div className="flex gap-3">
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-5 w-40 rounded-full" />
          </div>
        </div>
        {/* Odds-card skeleton pair. */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-slate-50 p-5">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-10 w-24 mb-2" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading market</span>
      </div>
    );
  }
  if (book.success === false) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-gray-400 light:text-slate-500">Market not found. <Link to="/" className="text-kaspa-green">Back to markets</Link></div>;
  }

  const odds = book.odds || {};
  const resolved = book.resolved;
  const wonLabel = resolved ? (book.revealed_outcome === 0 ? book.outcome_a : book.outcome_b) : null;
  const f = (book.fee_bps ?? 3000) / 10000, r = (book.rebate_bps ?? 5000) / 10000;
  const feePct = Math.round(f * 100), rebatePct = Math.round(r * 100);
  const breakeven = odds.breakeven_lp || (f / Math.max(1e-9, 1 - f - r));

  // Place a bet, then immediately try to match: same two-step flow as before,
  // same payloads, same /order then /match request shape.
  const onPlaceBet = () => act('Bet placed', async () => {
    const o = await api('/covenant/market/order', { market_id: id, side, stake_kas: parseFloat(stake), bettor_addr: addr.trim() });
    if (o && o.success === false) return o;
    // Immediately match: if the opposite side has open liquidity, this funds the
    // conjoined bundle (several covenants) right now.
    return await api('/covenant/market/match', { market_id: id });
  });
  const onMatch = () => act('Matched', () => api('/covenant/market/match', { market_id: id }));

  // Creator-only resolve: signature flow unchanged. signMarketResolve produces
  // the ownership proof over covex-market-resolve:{id}:{outcome}:{nonce}, which
  // /resolve verifies (C2). On success, settle every funded leg.
  const onResolve = (i, label) => act(`Resolving ${label}`, async () => {
    if (!address) return { success: false, error: 'Connect the market creator wallet to resolve.' };
    let proof;
    try { proof = await signMarketResolve(id, i, address, signMessage); }
    catch (e) { return { success: false, error: e?.message || String(e) }; }
    const rr = await api('/covenant/market/resolve', { market_id: id, outcome: i, ...proof });
    if (rr && rr.success === false) return rr;
    const s = await api('/covenant/market/settle', { market_id: id });
    setSettleRes(s);
    return s;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-44 sm:pb-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 light:text-slate-500 hover:text-kaspa-green mb-4"><ArrowLeft size={15} /> Explorer</Link>

      <MarketHero book={book} market={market} resolved={resolved} wonLabel={wonLabel} />

      {/* Place an order - action-first, with live OddsCards inlined side-by-side
          so a bettor sees price + stake + back-button in one card without scrolling. */}
      {!resolved && (
        <PlaceOrderCard
          book={book} market={market} odds={odds} resolved={resolved}
          side={side} setSide={setSide}
          stake={stake} setStake={setStake}
          addr={addr} setAddr={setAddr}
          busy={busy} onPlaceBet={onPlaceBet} onMatch={onMatch}
        />
      )}

      {/* When resolved, still show the live odds card row + funded summary above
          the (collapsed by default) economics, so the winning leg is visible. */}
      {resolved && (
        <div className="mb-6">
          <OddsRow book={book} odds={odds} resolved={resolved} />
        </div>
      )}

      {/* Honesty disclosures stay ABOVE THE FOLD by default so first-time visitors
          see the "you can lose" math and the hybrid enforcement reality without a click.
          Only the pool/fee breakdown + commitment hashes are collapsed (chrome, not honesty). */}
      <div className="space-y-4 mb-6">
        {/* The honest economics warning, always visible */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-200/90 light:text-amber-800 leading-relaxed">
            <span className="font-semibold text-amber-300 light:text-amber-700">You can be right and still lose.</span> The winner multiplier is
            {' '}<span className={num}>{(1 - f).toFixed(2)}</span> + <span className={num}>{(1 - f - r).toFixed(2)}</span>×(opposing pool ÷ your pool). A correct bet only profits when the opposing pool is more than
            {' '}<span className={`font-semibold ${num}`}>{breakeven.toFixed(2)}×</span> your side, the house takes {feePct}% and losers get {rebatePct}% back.
          </p>
        </div>

        {/* Always-visible honest limits for the prediction-market covenant kind (no click).
            Reality is hybrid: on-chain custody + payout, oracle-resolved outcome, never bare 'on-chain'. */}
        <HonestLimits covenant={{ enforcement_reality: 'hybrid', covenant_type: 'prediction-market' }} kind="market" />

        {/* Collapsible "Pool math and on-chain proofs": pools breakdown + commitment hashes.
            Hidden by default to keep the action card above the fold, but the
            responsible-gambling disclosure above is never gated behind a click. */}
        <div className="rounded-2xl border border-white/[0.06] light:border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setPayoutsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left bg-white/[0.02] light:bg-slate-50 hover:bg-white/[0.04] light:hover:bg-slate-100 transition-colors"
            aria-expanded={payoutsOpen}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white light:text-slate-900">
              <Coins size={15} className="text-kaspa-green" /> Pool math and on-chain proofs
            </span>
            <ChevronDown size={16} className={`text-gray-400 light:text-slate-500 transition-transform ${payoutsOpen ? 'rotate-180' : ''}`} />
          </button>
          {payoutsOpen && (
            <div className="p-5 border-t border-white/[0.06] light:border-slate-200">
              {/* Pools - reward / hedge-rebate / fee split of the matched pool */}
              {(book.funded_pool_a_kas + book.funded_pool_b_kas) === 0 ? (
                <div className="text-[12px] text-gray-500 light:text-slate-500">No matched liquidity yet, the reward and hedge pools fill as bets get matched.</div>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-3 mb-1"><span className="kicker">Total matched</span><span className={`text-2xl font-black leading-none text-right text-white light:text-slate-900 ${num}`}>{(book.funded_pool_a_kas + book.funded_pool_b_kas).toFixed(2)} <span className="text-sm text-gray-400 light:text-slate-500">KAS</span></span></div>
                  <div className="flex items-center justify-between gap-3 text-[12px] mb-3"><span className="text-gray-400 light:text-slate-500">{feePct > 0 ? `House fee pool (${feePct}%)` : 'House fee'}</span><span className={`text-amber-300 light:text-amber-600 shrink-0 ${num}`}>{feePct > 0 ? `${(f * (book.funded_pool_a_kas + book.funded_pool_b_kas)).toFixed(2)} KAS` : 'no fee'}</span></div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[[book.outcome_a, book.funded_pool_a_kas, book.funded_pool_b_kas, 0], [book.outcome_b, book.funded_pool_b_kas, book.funded_pool_a_kas, 1]].map(([lbl, mine, opp, oc]) => {
                      const isWinner = resolved && book.revealed_outcome === oc;
                      return (
                        <div key={oc} className={`rounded-xl border p-3.5 text-[12px] transition-all ${isWinner ? 'border-emerald-500/40 hover-lift-premium' : 'border-white/10 bg-white/[0.02] hover-lift'}`}
                          style={isWinner ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(255,255,255,0.02))', boxShadow: '0 0 20px rgba(16,185,129,0.22)' } : undefined}>
                          <div className="flex items-center justify-between gap-2 mb-1.5"><span className="kicker truncate">If "{lbl}" wins</span>{isWinner && <Trophy size={13} className="text-emerald-300 light:text-emerald-600 shrink-0" />}</div>
                          <div className="flex items-center justify-between gap-2"><span className="text-kaspa-green">Reward pool</span><span className={`text-white light:text-slate-900 shrink-0 ${num}`}>{((1 - f) * mine + (1 - f - r) * opp).toFixed(2)} KAS</span></div>
                          <div className="flex items-center justify-between gap-2"><span className="text-sky-300 light:text-sky-600">Hedge / rebate pool</span><span className={`text-white light:text-slate-900 shrink-0 ${num}`}>{(r * opp).toFixed(2)} KAS</span></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="mt-3 pt-3 border-t border-white/[0.06] light:border-slate-200 text-[11px] text-gray-500 light:text-slate-500 leading-relaxed break-words">
                <span className="text-gray-300 light:text-slate-700 font-semibold">Oracle:</span> {enforcementSummary('oracle-attested').oracleNote} The outcome is resolved by revealing one committed secret, no Covex key sits in the money path.
                {oraclePk && <> external resolver x-only key <span className="font-mono text-gray-400 light:text-slate-500">{String(oraclePk).slice(0, 12)}…</span>.</>}
                {market.h_a && <> Commitments <span className="font-mono text-gray-400 light:text-slate-500">H_A {market.h_a.slice(0, 8)}… · H_B {market.h_b.slice(0, 8)}…</span>.</>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order book - rendered as an ARIA table so screen readers can announce
          side / stake / status as a structured row instead of a flat run of text.
          We keep the flex-row visual (not <table>) because the design needs
          truncate + shrink-0 columns that an HTML <table> layout fights with. */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-6">
        <div className="text-white light:text-slate-900 font-semibold mb-3" id="orderbook-title">Order book</div>
        {(!book.orders || book.orders.length === 0) ? (
          <div className="text-sm text-gray-500 light:text-slate-500">No orders yet, be the first.</div>
        ) : (
          <div role="table" aria-labelledby="orderbook-title" className="divide-y divide-white/[0.05] light:divide-slate-200">
            <div role="row" className="sr-only">
              <span role="columnheader">Side</span>
              <span role="columnheader">Stake</span>
              <span role="columnheader">Status</span>
            </div>
            {book.orders.map((o) => (
              <div key={o.order_id} role="row" className="flex items-center gap-2 text-[12px] py-2.5">
                <span role="cell" className={`truncate min-w-0 flex-1 ${o.side === 0 ? 'text-kaspa-green' : 'text-sky-300 light:text-sky-600'}`}>{o.side === 0 ? book.outcome_a : book.outcome_b}</span>
                <span role="cell" className={`text-white light:text-slate-900 shrink-0 ${num}`}>{o.stake_kas} KAS</span>
                <span role="cell" className={`inline-flex items-center gap-1 shrink-0 ${o.status === 'funded' ? 'text-emerald-300 light:text-emerald-600' : 'text-gray-500 light:text-slate-500'}`}>
                  {o.status === 'funded' ? <><Check size={11} aria-hidden="true" /> funded</> : 'open'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve + pay out: one click reveals the winning secret AND settles every funded leg */}
      {!resolved && (
        <ResolvePayout book={book} busy={busy} onResolve={onResolve} />
      )}

      {resolved && (
        <Settled
          wonLabel={wonLabel}
          feePct={feePct}
          rebatePct={rebatePct}
          busy={busy}
          settleRes={settleRes}
          onSettle={doSettle}
        />
      )}

      {/* Status / error toast region. aria-live=polite so SR announces order
          placement and resolve outcomes without preempting the user. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {msg && (
          <div className={`text-[12px] rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 light:text-emerald-700 light:bg-emerald-50 light:border-emerald-200' : 'text-red-300 bg-red-500/10 border border-red-500/20 light:text-red-700 light:bg-red-50 light:border-red-200'}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Mobile-only sticky bottom rail. Open markets only. Uses the SAME
          onPlaceBet handler as PlaceOrderCard so /order + /match payloads stay
          identical. Hidden on sm+ where the full order card sits in-flow. */}
      {!resolved && (
        <MobileBetRail
          book={book}
          side={side} setSide={setSide}
          stake={stake} setStake={setStake}
          addr={addr}
          busy={busy}
          onPlaceBet={onPlaceBet}
        />
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
