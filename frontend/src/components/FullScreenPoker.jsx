import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Users, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { useWallet } from './WalletContext';
import useGameSync from '../hooks/useGameSync';

// Real heads-up No-Limit Hold'em over the covenant match record.
//
// The backend deals every hand from a seed whose sha256 commitment is
// published BEFORE any card is visible, and reveals the seed when the hand
// ends. This component re-runs the specified shuffle in the browser and shows
// a "deal verified" badge when the revealed cards provably match the
// commitment that was on the table during play. Hole cards are private:
// fetching yours requires a wallet-signed table session (Kaspa schnorr).
//
// Chips are score units (100 each, blinds 1/2); the covenant pot pays the
// match winner through the same oracle attest + claim flow as the other games.

const SUITS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: 'text-red-500', diamonds: 'text-red-500', clubs: 'text-white', spades: 'text-white' };
const SUIT_NAME = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const parseCard = (s) => (s ? { rank: s[0] === 'T' ? '10' : s[0], suit: SUIT_NAME[s[1]] } : null);

function Card({ code, faceDown, small }) {
  if (faceDown || !code) {
    return (
      <div className={`${small ? 'w-10 h-14' : 'w-16 h-24'} rounded-lg border-2 border-white/70 shadow-lg bg-[repeating-linear-gradient(45deg,#1e3a8a,#1e3a8a_6px,#1d4ed8_6px,#1d4ed8_12px)]`} />
    );
  }
  const { rank, suit } = parseCard(code);
  const color = SUIT_COLORS[suit] || 'text-white';
  return (
    <div className={`relative ${small ? 'w-10 h-14' : 'w-16 h-24'} rounded-lg bg-white border border-gray-300 shadow-lg select-none`}>
      <div className={`absolute top-0.5 left-1 flex flex-col items-center leading-none ${color}`}>
        <span className={`${small ? 'text-[9px]' : 'text-xs'} font-bold`}>{rank}</span>
        <span className={small ? 'text-[9px]' : 'text-xs'}>{SUITS[suit]}</span>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${color}`}>
        <span className={small ? 'text-base' : 'text-2xl'}>{SUITS[suit]}</span>
      </div>
      <div className={`absolute bottom-0.5 right-1 flex flex-col items-center leading-none rotate-180 ${color}`}>
        <span className={`${small ? 'text-[9px]' : 'text-xs'} font-bold`}>{rank}</span>
        <span className={small ? 'text-[9px]' : 'text-xs'}>{SUITS[suit]}</span>
      </div>
    </div>
  );
}

// ── client-side deal verification (mirrors the spec in backend poker.rs) ────
const enc = new TextEncoder();
async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
const hexOf = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const RANK_CH = '23456789TJQKA';
const SUIT_CH = 'cdhs';
const cardStr = (idx) => `${RANK_CH[idx % 13]}${SUIT_CH[(idx / 13) | 0]}`;

async function shuffledDeckJs(seed) {
  let counter = 0, buf = [], pos = 0;
  const nextU32 = async () => {
    let v = 0;
    for (let k = 0; k < 4; k++) {
      if (pos >= buf.length) {
        buf = await sha256Bytes(enc.encode(`${seed}:${counter}`));
        pos = 0;
        counter += 1;
      }
      v = (v * 256 + buf[pos]) >>> 0;
      pos += 1;
    }
    return v;
  };
  const uniform = async (n) => {
    const limit = Math.floor(4294967295 / n) * n; // floor((2^32-1)/n)*n, matches backend
    for (;;) {
      const u = await nextU32();
      if (u < limit) return u % n;
    }
  };
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i >= 1; i--) {
    const j = await uniform(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Recompute everything from the revealed seed and compare with what the table
// showed. ok = the deal was provably fixed before play (cards match the seed
// AND the seed matches the commitment that was published during the hand).
async function verifyDeal(result, covenantId, seenCommitment) {
  try {
    const commitment = hexOf(await sha256Bytes(enc.encode(`${result.seed}:${covenantId}:${result.hand_no}`)));
    if (result.commitment && commitment !== result.commitment) return { ok: false, commitment };
    if (seenCommitment && commitment !== seenCommitment) return { ok: false, commitment };
    const deck = await shuffledDeckJs(result.seed);
    const board = deck.slice(4, 9).map(cardStr);
    const holes = [[deck[0], deck[2]].map(cardStr), [deck[1], deck[3]].map(cardStr)];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (result.board && !same(board, result.board)) return { ok: false, commitment };
    if (result.holes && !same(holes, result.holes)) return { ok: false, commitment };
    return { ok: true, commitment };
  } catch {
    return { ok: false, commitment: null };
  }
}

export default function FullScreenPoker({ stake = 100, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const { address, signMessage } = useWallet();

  // seats + join come from the shared match record (skill_games)
  const { game, status, myColor, joining, error: seatError, join } =
    useGameSync({ covenantId, gameType: 'poker', stake, onMoves: undefined });

  const [ps, setPs] = useState(null); // /api/poker/:id/state
  const [token, setToken] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [hole, setHole] = useState(null); // { hand_no, cards: [a,b] }
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [verify, setVerify] = useState(null); // { hand_no, ok }
  const seenCommitments = useRef({}); // hand_no -> commitment shown during play

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!covenantId) return;
    fetch(`/api/poker/${encodeURIComponent(covenantId)}/state`)
      .then((r) => r.json())
      .then((d) => setPs(d))
      .catch(() => {});
  }, [covenantId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const m = ps?.match;
  const hand = ps?.hand;
  const last = ps?.last_result;
  const mySeat = useMemo(() => {
    if (!m || !address) return null;
    if (m.players?.[0] === address) return 0;
    if (m.players?.[1] === address) return 1;
    return null;
  }, [m, address]);

  // remember the commitment shown while the hand is live (binds the reveal)
  useEffect(() => {
    if (hand?.commitment) seenCommitments.current[hand.hand_no] = hand.commitment;
  }, [hand?.commitment, hand?.hand_no]);

  // wallet-signed table session, established lazily once seated
  const ensureToken = useCallback(async () => {
    if (token) return token;
    if (mySeat == null) throw new Error('not seated');
    setAuthBusy(true);
    try {
      const ch = await (await fetch(`/api/poker/${encodeURIComponent(covenantId)}/challenge?address=${encodeURIComponent(address)}`)).json();
      if (!ch.success) throw new Error(ch.error || 'challenge failed');
      const signature = await signMessage(ch.message);
      const sess = await (await fetch(`/api/poker/${encodeURIComponent(covenantId)}/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, nonce: ch.nonce }),
      })).json();
      if (!sess.success) throw new Error(sess.error || 'session rejected');
      setToken(sess.token);
      return sess.token;
    } finally {
      setAuthBusy(false);
    }
  }, [token, mySeat, covenantId, address, signMessage]);

  // fetch my hole cards whenever a new hand is live
  useEffect(() => {
    if (mySeat == null || !hand || hole?.hand_no === hand.hand_no) return;
    let alive = true;
    (async () => {
      try {
        const t = await ensureToken();
        const d = await (await fetch(`/api/poker/${encodeURIComponent(covenantId)}/hole`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t }),
        })).json();
        if (alive && d.success) setHole({ hand_no: d.hand_no, cards: d.hole });
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => { alive = false; };
  }, [mySeat, hand?.hand_no, hole?.hand_no, covenantId, ensureToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // verify the deal whenever a result lands
  useEffect(() => {
    if (!last || verify?.hand_no === last.hand_no || !last.seed) return;
    let alive = true;
    (async () => {
      const v = await verifyDeal(last, covenantId, seenCommitments.current[last.hand_no]);
      if (alive) setVerify({ hand_no: last.hand_no, ok: v.ok });
    })();
    return () => { alive = false; };
  }, [last, verify?.hand_no, covenantId]);

  const post = useCallback(async (path, body) => {
    setBusy(true);
    setErr(null);
    try {
      const t = await ensureToken();
      const d = await (await fetch(`/api/poker/${encodeURIComponent(covenantId)}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t, ...body }),
      })).json();
      if (!d.success) setErr(d.error || 'rejected');
      refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [covenantId, ensureToken, refresh]);

  const deal = () => post('deal', {});
  const act = (a, amount = 0) => post('action', { act: a, amount });

  // derived betting facts
  const myTurn = hand && mySeat != null && hand.to_act === mySeat && !hand.all_in_runout;
  const committed = hand?.committed || [0, 0];
  const stacks = hand?.stacks || (m ? m.chips : [0, 0]);
  const callAmount = hand && mySeat != null ? Math.min(hand.current_bet - (committed[mySeat] ?? 0), stacks[mySeat] ?? 0) : 0;
  const canCheck = hand && mySeat != null && (committed[mySeat] ?? 0) === hand.current_bet;
  const maxTo = hand && mySeat != null ? (committed[mySeat] ?? 0) + (stacks[mySeat] ?? 0) : 0;
  const minTo = hand ? Math.min(hand.min_raise_to, maxTo) : 0;
  useEffect(() => { if (hand) setRaiseTo(minTo); }, [hand?.hand_no, hand?.current_bet, minTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchOver = m?.status === 'finished';
  const iWonMatch = matchOver && mySeat != null && (m.chips[mySeat] ?? 0) > 0;
  const oppSeat = mySeat == null ? 1 : 1 - mySeat;
  const seatLabel = (s) => (m?.players?.[s] ? `${m.players[s].slice(0, 10)}...` : 'open');

  const submitToOracle = useCallback(async () => {
    if (!matchOver || !covenantId) return;
    setOracleLoading(true); setOracleError(null);
    const outcome = (m.chips[0] ?? 0) > 0 ? 'p1' : 'p2';
    try {
      const r = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          covenant_id: covenantId, circuit_type: 'poker_v1',
          proof: { game: 'poker_heads_up', chips: m.chips, hands: m.hand_no },
          public_inputs: [outcome], requested_outcome: outcome === 'p1' ? 0 : 1,
        }),
      });
      const d = await r.json();
      if (d.success) { setOracleResult(d); setOracleSubmitted(true); }
      else setOracleError(d.error || 'Oracle rejected the result.');
    } catch (e) { setOracleError(e?.message || 'Oracle request failed.'); }
    finally { setOracleLoading(false); }
  }, [matchOver, covenantId, m]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const outcome = (m.chips[0] ?? 0) > 0 ? 0 : 1;
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oracle_signature: oracleResult.signature || '', outcome,
          total_stake_kas: stake * 2, per_side_stake_kas: stake,
          oracle_message: oracleResult.message || '', oracle_timestamp: oracleResult.timestamp || null,
        }),
      });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : { error: d.error || 'Payout failed' });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, m, stake]);

  // which cards to show for each seat
  const showdown = last && (!hand || hand.hand_no !== last.hand_no) && !matchOver;
  const myCards = hole && hand && hole.hand_no === hand.hand_no ? hole.cards : null;
  const board = hand?.board || ((showdown || matchOver) ? last?.board : []) || [];

  const statusLine = matchOver
    ? null
    : !m || status !== 'active'
      ? null
      : !hand
        ? 'BETWEEN HANDS - DEAL WHEN READY'
        : hand.all_in_runout
          ? 'ALL IN - BOARD RUNS OUT'
          : hand.to_act == null
            ? '...'
            : hand.to_act === mySeat
              ? 'YOUR ACTION'
              : mySeat == null
                ? `SEAT ${hand.to_act + 1} TO ACT`
                : 'OPPONENT TO ACT';

  return (
    <div className="fixed inset-0 z-[999] flex flex-col" style={{ background: 'radial-gradient(ellipse at 50% 60%, #0a1a0a 0%, #050510 70%)' }}>
      {/* Top bar */}
      <div className="h-12 sm:h-14 border-b border-white/10 flex items-center justify-between px-3 sm:px-4 text-sm bg-black/60 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="font-bold tracking-wider text-amber-400 truncate">POKER · HEADS-UP NLHE · KASPA COVENANT</div>
          <div className="hidden sm:block px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{stake * 2} KAS POT · BLINDS {m?.blinds?.[0] ?? 1}/{m?.blinds?.[1] ?? 2}</div>
        </div>
        <div className="flex items-center gap-2">
          {hand?.commitment && (
            <div className="hidden md:flex items-center gap-1 text-[10px] text-gray-400 font-mono" title="sha256 deck commitment, published before any card was visible">
              <ShieldCheck size={12} className="text-[#49EACB]" /> deal {hand.commitment.slice(0, 12)}…
            </div>
          )}
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl border border-white/20 hover:bg-white/5 text-xs font-bold">EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start sm:justify-center p-3 gap-3 overflow-auto">
        {/* match score */}
        <div className="flex items-center gap-4 text-xs font-mono text-gray-300">
          <span className={mySeat === 0 ? 'text-[#49EACB]' : ''}>P1 {seatLabel(0)} · {m?.chips?.[0] ?? '-'} chips</span>
          <span className="text-gray-500">hand #{m?.hand_no ?? '-'}</span>
          <span className={mySeat === 1 ? 'text-[#49EACB]' : ''}>P2 {seatLabel(1)} · {m?.chips?.[1] ?? '-'} chips</span>
        </div>

        {/* Table */}
        <div className="relative w-full max-w-[860px] aspect-[2/1] rounded-[140px] border-[10px] border-amber-900/50 shadow-2xl shrink-0"
             style={{ background: 'radial-gradient(ellipse at 50% 55%, #0d6b2e 0%, #073d1a 50%, #031a0a 100%)' }}>

          {/* opponent seat (top) */}
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
            <div className="text-[11px] text-gray-300 uppercase tracking-[2px] font-mono flex items-center gap-2">
              {mySeat == null ? `SEAT ${oppSeat + 1}` : 'OPPONENT'}
              {hand && hand.button === oppSeat && <span className="px-1.5 rounded-full bg-white text-black text-[9px] font-bold">D</span>}
            </div>
            <div className="flex gap-1.5">
              {(showdown || matchOver) && last?.holes
                ? last.holes[oppSeat].map((c, i) => <Card key={i} code={c} small />)
                : [0, 1].map((i) => <Card key={i} faceDown small />)}
            </div>
            {hand && <div className="text-[11px] font-mono text-amber-300 min-h-[14px]">{committed[oppSeat] > 0 ? `bet ${committed[oppSeat]}` : ''}</div>}
          </div>

          {/* board + pot */}
          <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Card key={i} code={board[i]} faceDown={!board[i]} small />
              ))}
            </div>
            <div className="text-sm font-bold font-mono text-emerald-300">POT {hand ? hand.pot : (showdown || matchOver) && last ? last.pot : 0}</div>
            {statusLine && <div className="text-[10px] text-gray-300 uppercase tracking-[3px] font-mono">{statusLine}</div>}
          </div>

          {/* my seat (bottom) */}
          <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
            {hand && mySeat != null && <div className="text-[11px] font-mono text-amber-300 min-h-[14px]">{committed[mySeat] > 0 ? `bet ${committed[mySeat]}` : ''}</div>}
            <div className="flex gap-1.5">
              {mySeat == null
                ? (showdown || matchOver) && last?.holes
                  ? last.holes[0].map((c, i) => <Card key={i} code={c} small />)
                  : [0, 1].map((i) => <Card key={i} faceDown small />)
                : myCards
                  ? myCards.map((c, i) => <Card key={i} code={c} />)
                  : (showdown || matchOver) && last?.holes
                    ? last.holes[mySeat].map((c, i) => <Card key={i} code={c} />)
                    : [0, 1].map((i) => <Card key={i} faceDown />)}
            </div>
            <div className="text-[11px] text-gray-300 uppercase tracking-[2px] font-mono flex items-center gap-2">
              {mySeat == null ? 'SEAT 1' : 'YOU'}
              {hand && mySeat != null && hand.button === mySeat && <span className="px-1.5 rounded-full bg-white text-black text-[9px] font-bold">D</span>}
              {mySeat != null && hand && <span className="text-gray-500">stack {stacks[mySeat]}</span>}
            </div>
          </div>

          {/* join overlay */}
          {status !== 'active' && !matchOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm rounded-[130px]">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <button onClick={join} disabled={joining}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2">
                  <Users size={16} /> {joining ? 'JOINING...' : status === 'none' ? 'TAKE SEAT 1 (CREATE TABLE)' : 'TAKE SEAT 2 (JOIN TABLE)'}
                </button>
              ) : (
                <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO TAKE SEAT 2...</div>
              )}
              {seatError && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[280px] text-center">{seatError}</div>}
            </div>
          )}
        </div>

        {/* last hand result + verification */}
        {last && (showdown || matchOver) && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-gray-300">
            <span>
              hand #{last.hand_no}: {last.reason === 'fold' ? 'won by fold' : last.win_label}
              {last.winner_seat != null && ` · seat ${last.winner_seat + 1} +${last.pot}`}
            </span>
            {verify?.hand_no === last.hand_no && (
              verify.ok ? (
                <span className="flex items-center gap-1 text-[#49EACB]" title="The revealed seed reproduces the commitment, board, and hole cards exactly - the deal was fixed before play.">
                  <ShieldCheck size={12} /> deal verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400" title="The revealed seed does NOT match - do not trust this hand.">
                  <ShieldAlert size={12} /> VERIFICATION FAILED
                </span>
              )
            )}
          </div>
        )}

        {/* action dock */}
        {!matchOver && mySeat != null && status === 'active' && (
          <div className="w-full max-w-[860px] rounded-2xl border border-white/10 bg-black/50 p-3 flex flex-wrap items-center justify-center gap-2">
            {authBusy && <span className="text-[11px] text-amber-300 font-mono animate-pulse">SIGNING TABLE SESSION...</span>}
            {!hand && (
              <button onClick={deal} disabled={busy || authBusy}
                className="px-6 py-2.5 rounded-xl bg-[#49EACB] text-black font-black text-sm disabled:opacity-50 flex items-center gap-2">
                <RefreshCw size={14} /> DEAL {m?.hand_no > 1 ? 'NEXT HAND' : 'FIRST HAND'}
              </button>
            )}
            {hand && myTurn && (
              <>
                <button onClick={() => act('fold')} disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-red-600/90 text-white text-sm font-bold disabled:opacity-50">FOLD</button>
                {canCheck ? (
                  <button onClick={() => act('check')} disabled={busy}
                    className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-bold disabled:opacity-50">CHECK</button>
                ) : (
                  <button onClick={() => act('call')} disabled={busy}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">CALL {callAmount}</button>
                )}
                {maxTo > hand.current_bet && (
                  <span className="flex items-center gap-1.5">
                    <input type="number" min={minTo} max={maxTo} value={raiseTo}
                      onChange={(e) => setRaiseTo(Math.max(0, parseInt(e.target.value || '0', 10)))}
                      className="w-20 px-2 py-2 rounded-xl bg-black/60 border border-white/15 text-sm font-mono text-white" />
                    <button onClick={() => act(hand.current_bet > 0 ? 'raise' : 'bet', Math.min(Math.max(raiseTo, minTo), maxTo))} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-black disabled:opacity-50">
                      {hand.current_bet > 0 ? 'RAISE TO' : 'BET'} {Math.min(Math.max(raiseTo, minTo), maxTo)}
                    </button>
                    <button onClick={() => act(hand.current_bet > 0 ? 'raise' : 'bet', maxTo)} disabled={busy}
                      className="px-3 py-2.5 rounded-xl border border-amber-500/50 text-amber-300 text-xs font-bold disabled:opacity-50">ALL-IN</button>
                  </span>
                )}
              </>
            )}
            {hand && !myTurn && !hand.all_in_runout && (
              <span className="text-[11px] text-gray-400 font-mono">waiting for opponent...</span>
            )}
            <button onClick={() => act('resign')} disabled={busy}
              className="px-3 py-2 rounded-xl border border-red-500/40 text-red-300 text-[11px] font-bold disabled:opacity-50">RESIGN MATCH</button>
            {err && <span className="w-full text-center text-[11px] text-red-300">{err}</span>}
          </div>
        )}

        {!matchOver && mySeat == null && status === 'active' && (
          <div className="text-[11px] text-gray-500">You are spectating. Hole cards stay hidden; every deal is commitment-verified.</div>
        )}

        {/* match over: oracle + claim */}
        {matchOver && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-base font-bold text-[#49EACB]">
              {mySeat == null
                ? `SEAT ${(m.chips[0] > 0 ? 1 : 2)} WINS THE MATCH`
                : iWonMatch ? 'YOU WIN THE MATCH!' : 'OPPONENT WINS THE MATCH'}
            </div>
            {!oracleSubmitted && mySeat != null && (
              <button onClick={submitToOracle} disabled={oracleLoading}
                className="px-7 py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm disabled:opacity-50 shadow-[0_0_30px_rgba(73,234,203,0.35)]">
                {oracleLoading ? 'SUBMITTING...' : 'SUBMIT RESULT TO ORACLE'}
              </button>
            )}
            {oracleError && <div className="text-red-400 text-xs font-mono p-2 border border-red-500/30 rounded-xl bg-red-500/5">{oracleError}</div>}
            {oracleSubmitted && !payoutResult && (
              <button onClick={claimPayout} disabled={payoutLoading}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">
                {payoutLoading ? 'COMPUTING...' : 'CLAIM PAYOUT'}
              </button>
            )}
            {payoutResult && !payoutResult.error && (
              <div className="text-xs p-3 border border-emerald-500/30 bg-emerald-500/5 rounded-xl font-mono">
                PAYOUT: winner {payoutResult.winner_share_kas} · platform {payoutResult.platform_fee_kas} · pot {payoutResult.pot_return_kas} KAS
              </div>
            )}
            {payoutResult?.error && <div className="text-amber-400 text-xs">Payout error: {payoutResult.error}</div>}
          </div>
        )}
      </div>

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 flex items-center justify-center font-mono shrink-0 px-2 text-center">
        ORACLE-DEALT · COMMITMENT PUBLISHED BEFORE EVERY DEAL · SEED REVEALED AFTER · HOLE CARDS BEHIND WALLET-SIGNED SESSIONS
      </div>
    </div>
  );
}
