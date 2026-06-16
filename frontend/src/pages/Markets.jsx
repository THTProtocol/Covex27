import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  TrendingUp, ShieldCheck, AlertTriangle, ArrowLeft, Trophy, Clock,
  ExternalLink, Layers, Check, Loader2,
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

function EnforcementBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
      <ShieldCheck size={12} /> On-chain enforced
    </span>
  );
}

function MarketsList() {
  const [markets, setMarkets] = useState(null);
  useEffect(() => {
    api('/covenant/market/list', { network: net() })
      .then((j) => setMarkets(j.markets || []))
      .catch(() => setMarkets([]));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
          <TrendingUp size={20} className="text-kaspa-green" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Prediction Markets</h1>
          <p className="text-sm text-gray-400">Parimutuel markets settled by conjoined on-chain covenants. {net()}.</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/[0.06] p-4 mb-6 text-[12px] text-gray-300 leading-relaxed">
        <span className="text-white font-semibold">How it works:</span> back an outcome with a YES/NO order. Orders are
        matched into mini-pools, each funded by a bundle of <span className="font-mono text-white">binary_oracle_select</span>{' '}
        covenants. When the result is in, one secret is revealed and the chain routes every payout, loser rebate, and fee.
        No Covex key sits in the money path — funds are recoverable even if Covex goes down.
      </div>

      {markets === null ? (
        <div className="flex items-center justify-center py-20 text-gray-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading markets…</div>
      ) : markets.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-white/[0.06] p-10 text-center text-gray-400">
          No markets yet on {net()}.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {markets.map((m) => (
            <Link key={m.market_id} to={`/markets/${m.market_id}`}
              className="glass-panel rounded-2xl border border-white/[0.06] p-5 hover-lift transition-all block">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-base font-bold text-white leading-snug">{m.question}</h3>
                {m.resolved ? (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-300"><Trophy size={11} /> Resolved</span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-kaspa-green/10 border border-kaspa-green/25 text-kaspa-green">Open</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[12px] mb-3">
                <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-white">{m.outcome_a}</span>
                <span className="text-gray-500 text-[10px] uppercase tracking-wide">vs</span>
                <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-white">{m.outcome_b}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <EnforcementBadge />
                {m.kickoff_utc && <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtKickoff(m.kickoff_utc)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OddsCard({ label, mult, accent }) {
  const profit = mult >= 1;
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-kaspa-green/25 bg-kaspa-green/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">If "{label}" wins</div>
      <div className={`text-2xl font-extrabold ${profit ? 'text-kaspa-green' : 'text-amber-300'}`}>{mult ? mult.toFixed(2) : '—'}×</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{mult ? (profit ? 'winner profits' : 'winner still loses') : 'no funded pool yet'}</div>
    </div>
  );
}

function MarketDetail({ id }) {
  const { address } = useWallet();
  const [book, setBook] = useState(null);
  const [market, setMarket] = useState(null);
  const [side, setSide] = useState(0);
  const [stake, setStake] = useState('1');
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (address && !addr) setAddr(address); }, [address]); // eslint-disable-line

  const load = useCallback(() => {
    api('/covenant/market/book', { market_id: id }).then(setBook).catch(() => {});
    api('/covenant/market/get', { market_id: id }).then(setMarket).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (label, fn) => {
    setBusy(label); setMsg(null);
    try {
      const r = await fn();
      setMsg(r && r.success === false ? { ok: false, text: r.error || 'failed' } : { ok: true, text: `${label} done` });
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(''); load();
  };

  if (!book || !market) {
    return <div className="flex items-center justify-center py-32 text-gray-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading market…</div>;
  }
  if (book.success === false) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-gray-400">Market not found. <Link to="/markets" className="text-kaspa-green">Back to markets</Link></div>;
  }

  const odds = book.odds || {};
  const resolved = book.resolved;
  const wonLabel = resolved ? (book.revealed_outcome === 0 ? book.outcome_a : book.outcome_b) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/markets" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-kaspa-green mb-4"><ArrowLeft size={15} /> Markets</Link>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">{book.question}</h1>
        {resolved
          ? <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-300"><Trophy size={12} /> {wonLabel}</span>
          : <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-kaspa-green/10 border border-kaspa-green/25 text-kaspa-green">Open</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-gray-400 mb-5">
        <EnforcementBadge />
        {market.kickoff_utc && <span className="inline-flex items-center gap-1"><Clock size={12} /> {fmtKickoff(market.kickoff_utc)}</span>}
        {market.source_url && <a href={market.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-kaspa-green">Source <ExternalLink size={11} /></a>}
      </div>

      {/* Live odds */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <OddsCard label={book.outcome_a} mult={odds.if_a_wins_multiplier} accent={resolved && book.revealed_outcome === 0} />
        <OddsCard label={book.outcome_b} mult={odds.if_b_wins_multiplier} accent={resolved && book.revealed_outcome === 1} />
      </div>
      <div className="text-[11px] text-gray-500 mb-5">
        Funded pools: <span className="text-white">{book.funded_pool_a_kas} KAS</span> {book.outcome_a} · <span className="text-white">{book.funded_pool_b_kas} KAS</span> {book.outcome_b}
        {(book.open_pool_a_kas + book.open_pool_b_kas) > 0 && <> · open: {book.open_pool_a_kas}/{book.open_pool_b_kas} KAS</>}
      </div>

      {/* The honest economics warning */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 mb-6">
        <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">You can be right and still lose.</span> The winner multiplier is
          {' '}0.70 + 0.20×(opposing pool ÷ your pool). A correct bet only profits when the opposing pool is more than
          {' '}<span className="font-semibold">1.5×</span> your side — and the house takes 30% while losers get 50% back.
        </p>
      </div>

      {/* Place a bet */}
      {!resolved && (
        <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
          <div className="text-white font-semibold mb-3 flex items-center gap-2"><Layers size={16} className="text-kaspa-green" /> Place an order</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[book.outcome_a, book.outcome_b].map((label, i) => (
              <button key={i} onClick={() => setSide(i)}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${side === i ? 'bg-kaspa-green text-black border-kaspa-green' : 'bg-white/[0.03] text-gray-200 border-white/10 hover:border-white/25'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            <input value={stake} onChange={(e) => setStake(e.target.value)} type="number" min="1" step="0.5"
              className="w-28 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm" placeholder="KAS" />
            <input value={addr} onChange={(e) => setAddr(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm font-mono text-[11px]" placeholder="your kaspatest:q... address" />
          </div>
          <div className="flex gap-2">
            <button disabled={!!busy || !addr || !(parseFloat(stake) > 0)}
              onClick={() => act('Order placed', () => api('/covenant/market/order', { market_id: id, side, stake_kas: parseFloat(stake), bettor_addr: addr.trim() }))}
              className="btn-shimmer flex-1 py-2.5 rounded-xl font-bold text-sm bg-kaspa-green text-black disabled:opacity-40 disabled:cursor-not-allowed">
              {busy === 'Order placed' ? <Loader2 className="animate-spin inline" size={15} /> : `Back "${side === 0 ? book.outcome_a : book.outcome_b}"`}
            </button>
            <button disabled={!!busy}
              onClick={() => act('Matched', () => api('/covenant/market/match', { market_id: id }))}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm border border-white/15 text-gray-200 hover:border-kaspa-green/40 disabled:opacity-40">
              {busy === 'Matched' ? <Loader2 className="animate-spin inline" size={15} /> : 'Match & fund'}
            </button>
          </div>
        </div>
      )}

      {/* Order book */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
        <div className="text-white font-semibold mb-3">Order book</div>
        {(!book.orders || book.orders.length === 0) ? (
          <div className="text-sm text-gray-500">No orders yet — be the first.</div>
        ) : (
          <div className="space-y-1.5">
            {book.orders.map((o) => (
              <div key={o.order_id} className="flex items-center justify-between text-[12px] py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <span className={o.side === 0 ? 'text-kaspa-green' : 'text-sky-300'}>{o.side === 0 ? book.outcome_a : book.outcome_b}</span>
                <span className="text-white">{o.stake_kas} KAS</span>
                <span className={`inline-flex items-center gap-1 ${o.status === 'funded' ? 'text-emerald-300' : 'text-gray-500'}`}>
                  {o.status === 'funded' ? <><Check size={11} /> funded</> : 'open'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve (operator/creator) */}
      {!resolved && (
        <div className="glass-panel rounded-2xl border border-white/[0.06] p-5 mb-5">
          <div className="text-white font-semibold mb-1">Resolve outcome</div>
          <p className="text-[11px] text-gray-500 mb-3">When the real result is known, reveal the winning secret. Single-secret policy: the other outcome can never be revealed afterward.</p>
          <div className="grid grid-cols-2 gap-2">
            {[book.outcome_a, book.outcome_b].map((label, i) => (
              <button key={i} disabled={!!busy}
                onClick={() => act(`Resolved: ${label}`, () => api('/covenant/market/resolve', { market_id: id, outcome: i }))}
                className="py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-gray-200 hover:border-amber-400/40 disabled:opacity-40">
                {busy === `Resolved: ${label}` ? <Loader2 className="animate-spin inline" size={15} /> : `"${label}" won`}
              </button>
            ))}
          </div>
        </div>
      )}

      {resolved && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5 mb-5">
          <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-1.5"><Trophy size={16} /> Resolved — {wonLabel} won</div>
          <p className="text-[12px] text-gray-300 leading-relaxed">
            The winning secret is revealed. Every funded leg can now be claimed on-chain by its winner with the secret + their key —
            through any Kaspa node, no Covex required. Winners take the pool (minus 30% fee); losers reclaim 50%.
          </p>
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

export default function Markets() {
  const { id } = useParams();
  return id ? <MarketDetail id={id} /> : <MarketsList />;
}
