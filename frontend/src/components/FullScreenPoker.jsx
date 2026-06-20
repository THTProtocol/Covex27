import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { useWallet } from './WalletContext';
import useGameSync from '../hooks/useGameSync';
import SeatButton, { TrustNote } from './SeatButton';
import InviteLink from './InviteLink';
import PlayingCard from './games/PlayingCard';
import { ChipStack } from './games/Chips';

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

// Map a backend card code (e.g. "Th", "As") to the shared PlayingCard props.
// PlayingCard wants rank as a string ('10' not 'T') and suit as a single
// uppercase letter (S/H/D/C). This is purely presentational; the raw code
// strings the backend sends are never altered.
const SUIT_LETTER = { c: 'C', d: 'D', h: 'H', s: 'S' };
const cardProps = (code) =>
  code ? { rank: code[0] === 'T' ? '10' : code[0], suit: SUIT_LETTER[code[1]] } : null;

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

// ── Winning 5-card combo derivation (VISUAL ONLY) ───────────────────────────
// Picks the best 5-of-7 to draw the kaspa-green ring at showdown. This never
// decides the winner (that comes from last.winner_seat off the server); it only
// chooses which already-revealed cards get highlighted. Returns a Set of the
// card code strings that form the best five.
const R_ORDER = '23456789TJQKA';
const rankVal = (code) => R_ORDER.indexOf(code[0]);
function combos5(cards) {
  const out = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++)
            out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return out;
}
function scoreFive(five) {
  const ranks = five.map(rankVal).sort((x, y) => y - x);
  const suits = five.map((c) => c[1]);
  const counts = {};
  ranks.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  const groups = Object.entries(counts)
    .map(([r, c]) => [c, Number(r)])
    .sort((p, q) => q[0] - p[0] || q[1] - p[1]);
  const isFlush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)].sort((x, y) => y - x);
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    // wheel: A-2-3-4-5 (A high is 12, 5 is 3)
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[2] === 2 && uniq[3] === 1 && uniq[4] === 0) straightHigh = 3;
  }
  const isStraight = straightHigh >= 0;
  let cat;
  if (isStraight && isFlush) cat = 8;
  else if (groups[0][0] === 4) cat = 7;
  else if (groups[0][0] === 3 && groups[1] && groups[1][0] === 2) cat = 6;
  else if (isFlush) cat = 5;
  else if (isStraight) cat = 4;
  else if (groups[0][0] === 3) cat = 3;
  else if (groups[0][0] === 2 && groups[1] && groups[1][0] === 2) cat = 2;
  else if (groups[0][0] === 2) cat = 1;
  else cat = 0;
  const tie = isStraight ? [straightHigh] : groups.map((g) => g[1]);
  return [cat, ...tie, ...ranks];
}
function cmpScore(x, y) {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const dx = (x[i] || 0) - (y[i] || 0);
    if (dx !== 0) return dx;
  }
  return 0;
}
function bestComboSet(board, holes) {
  try {
    const cards = [...(board || []), ...(holes || [])].filter(Boolean);
    if (cards.length < 5) return null;
    let best = null, bestCards = null;
    for (const five of combos5(cards)) {
      const sc = scoreFive(five);
      if (!best || cmpScore(sc, best) > 0) { best = sc; bestCards = five; }
    }
    return bestCards ? new Set(bestCards) : null;
  } catch {
    return null;
  }
}

// ── Small presentational helpers ────────────────────────────────────────────
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'open');
const avatarColor = (a) => {
  if (!a) return '#3a3a44';
  let h = 0;
  for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
};

// Time-bank ring drawn around the seat to act, filling down as the clock ticks.
function TimeBankRing({ ms, total = 30000, size = 92, active }) {
  const frac = Math.max(0, Math.min(1, (Number(ms) || 0) / total));
  const r = 44;
  const circ = 2 * Math.PI * r;
  const low = frac < 0.25;
  const stroke = !active ? 'rgba(255,255,255,0.10)' : low ? '#E8AF34' : '#49EACB';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(-90deg)', pointerEvents: 'none' }}
      aria-hidden
    >
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="4" />
      {active && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.25s linear', filter: `drop-shadow(0 0 4px ${stroke})` }}
        />
      )}
    </svg>
  );
}

// Rounded seat plate: avatar + truncated address + chip count + dealer button,
// wrapped by the time-bank ring and the kaspa-green clock-active glow when it is
// this seat's turn. Pure presentation; all values are passed in already decoded.
function SeatPlate({ label, addr, stack, isButton, active, isMe, ms }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <TimeBankRing ms={ms} active={active} size={104} />
      <div
        className={`poker-seat-plate${active ? ' clock-active' : ''}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 11px 5px 5px', borderRadius: 999,
          backdropFilter: 'blur(6px)',
        }}
      >
        {/* avatar */}
        <div
          className="poker-seat-avatar"
          style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: addr ? avatarColor(addr) : '#23262e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 11, color: '#fff',
          }}
        >
          {addr ? addr.slice(2, 4).toUpperCase() : '·'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className={isMe ? 'poker-seat-label-me' : 'poker-seat-label'} style={{ fontSize: 10, letterSpacing: '1px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {label}
            </span>
            {isButton && (
              <span style={{ background: '#fff', color: '#000', fontSize: 8, fontWeight: 900, borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>D</span>
            )}
          </span>
          <span className="poker-seat-addr" style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{shortAddr(addr)}</span>
          <span className="poker-seat-stack" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{stack} chips</span>
        </div>
      </div>
    </div>
  );
}

// Bet chips that sit in front of a seat and pop when the committed amount changes
// (read as chips sliding toward the pot). Visual only.
function BetChips({ amount }) {
  if (!(amount > 0)) return <div style={{ minHeight: 30 }} />;
  return (
    <div key={`bet-${amount}`} className="anim-pop" style={{ marginTop: 4 }}>
      <ChipStack amount={amount} size={26} />
    </div>
  );
}

export default function FullScreenPoker({ stake = 100, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const { address, signMessage } = useWallet();

  // seats + join come from the shared match record (skill_games)
  const { game, status, myColor, joining, error: seatError, join, clocks, walletConnected } =
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

  // quick-size helpers (presentation: they only move the slider value; the
  // amount sent to act() is still clamped to [minTo, maxTo] exactly as before)
  const clampTo = (v) => Math.min(Math.max(Math.round(v) || 0, minTo), maxTo);
  const potNow = hand ? hand.pot : 0;
  const callTotal = hand && mySeat != null ? hand.current_bet : 0; // "to" level a call lands on
  // pot-sized raise-to ≈ call level + (pot + amount-to-call)
  const halfPotTo = clampTo(callTotal + (potNow + callAmount) * 0.5);
  const fullPotTo = clampTo(callTotal + (potNow + callAmount));
  const sizedTo = clampTo(raiseTo);
  const stackAfter = maxTo - sizedTo; // chips left behind after raising to `sizedTo`

  const matchOver = m?.status === 'finished';
  const iWonMatch = matchOver && mySeat != null && (m.chips[mySeat] ?? 0) > 0;
  const oppSeat = mySeat == null ? 1 : 1 - mySeat;

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
  const reveal = showdown || matchOver;
  const myCards = hole && hand && hole.hand_no === hand.hand_no ? hole.cards : null;
  const board = hand?.board || (reveal ? last?.board : []) || [];

  // ── deal/street animation tracking ──────────────────────────────────────
  // Tag freshly revealed cards with .anim-deal. Hold'em reveals are
  // deterministic by board length, so the index from which cards are "new" this
  // street is derived purely from how many community cards are showing: the flop
  // (3 cards) animates together, then the turn and river each animate alone.
  // The dealKey remounts those cards so the slide-in replays on each new street.
  // Purely visual: it never changes which cards exist or their encodings.
  const liveHandNo = hand?.hand_no ?? (reveal ? last?.hand_no : null);
  const boardLen = board.filter(Boolean).length;
  const dealtFrom = boardLen >= 5 ? 4 : boardLen >= 4 ? 3 : 0;
  // animation key bumps so React remounts the dealt cards and replays anim-deal
  const dealKey = `${liveHandNo ?? 'x'}-${boardLen}`;

  // winning combo set (visual ring) for the seat that won at showdown
  const winningSet = useMemo(() => {
    if (!reveal || !last || last.winner_seat == null || last.reason === 'fold') return null;
    if (!last.holes || !last.board) return null;
    return bestComboSet(last.board, last.holes[last.winner_seat]);
  }, [reveal, last]);
  const isWinCard = (code) => !!(winningSet && code && winningSet.has(code));

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

  // live clocks from the hook (mm:ss). player1 = white = seat 0, player2 = seat 1.
  const seatMs = (seat) => (seat === 0 ? clocks.whiteMs : clocks.blackMs);
  const seatActive = (seat) => !!(hand && status === 'active' && !matchOver && hand.to_act === seat && !hand.all_in_runout);

  // Which hole cards a seat shows, as PlayingCard descriptors (or null = back).
  const seatHoles = (seat) => {
    const isMe = mySeat != null && seat === mySeat;
    if (isMe && myCards) return myCards;
    if (reveal && last?.holes?.[seat]) return last.holes[seat];
    return [null, null];
  };

  // Build the props for a seat plate (already-decoded display values only).
  const seatPlateProps = (seat, label) => ({
    label,
    addr: m?.players?.[seat],
    stack: hand ? stacks[seat] : (m?.chips?.[seat] ?? 0),
    isButton: !!(hand && hand.button === seat),
    active: seatActive(seat),
    isMe: mySeat === seat,
    ms: seatMs(seat),
  });

  return (
    <div className="game-fullscreen-bg fixed inset-0 z-[999] flex flex-col">
      {/* Top bar */}
      <div className="h-12 sm:h-14 border-b border-white/10 light:border-slate-300/70 flex items-center justify-between gap-2 px-3 sm:px-4 text-sm bg-black/60 light:bg-white/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="font-bold tracking-wider text-amber-400 light:text-amber-600 truncate text-[11px] sm:text-sm">
            <span className="sm:hidden">POKER · NLHE</span>
            <span className="hidden sm:inline">POKER · HEADS-UP NLHE · KASPA COVENANT</span>
          </div>
          <div className="hidden sm:block px-2 py-0.5 rounded bg-white/5 light:bg-slate-900/5 text-[10px] font-mono border border-white/10 light:border-slate-300 whitespace-nowrap">{stake * 2} KAS POT · BLINDS {m?.blinds?.[0] ?? 1}/{m?.blinds?.[1] ?? 2}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hand?.commitment && (
            <div className="hidden md:flex items-center gap-1 text-[10px] text-gray-400 light:text-slate-600 font-mono" title="sha256 deck commitment, published before any card was visible">
              <ShieldCheck size={12} className="text-[#49EACB] light:text-[#0d9488]" /> deal {hand.commitment.slice(0, 12)}…
            </div>
          )}
          <button
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl border border-white/20 light:border-slate-400 hover:bg-white/5 light:hover:bg-slate-900/5 text-xs font-bold"
            aria-label="Exit poker arena"
          >EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start sm:justify-center p-3 gap-3 overflow-auto">
        {/* match score */}
        <div className="flex items-center gap-4 text-xs font-mono text-gray-300 light:text-slate-600">
          <span className={mySeat === 0 ? 'text-[#49EACB] light:text-[#0d9488]' : ''}>P1 {shortAddr(m?.players?.[0])} · {m?.chips?.[0] ?? '-'} chips</span>
          <span className="text-gray-500 light:text-slate-500">hand #{m?.hand_no ?? '-'}</span>
          <span className={mySeat === 1 ? 'text-[#49EACB] light:text-[#0d9488]' : ''}>P2 {shortAddr(m?.players?.[1])} · {m?.chips?.[1] ?? '-'} chips</span>
        </div>

        {/* Table (wood bezel around a teal-rail felt oval) */}
        <div className="board-bezel-wood w-full max-w-[880px] shrink-0" style={{ borderRadius: 999 }}>
          <div
            className="felt-radial felt-noise relative w-full aspect-[2/1]"
            style={{
              borderRadius: 999,
              boxShadow: 'inset 0 0 0 8px rgba(15,94,84,0.55), inset 0 0 60px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(73,234,203,0.18)',
            }}
          >
            {/* betting-line arc + pot ring + center brand mark */}
            <svg viewBox="0 0 880 440" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} aria-hidden>
              {/* outer betting line arc */}
              <ellipse cx="440" cy="220" rx="320" ry="150" fill="none" stroke="rgba(73,234,203,0.14)" strokeWidth="2" />
              {/* pot-area ring */}
              <ellipse cx="440" cy="196" rx="150" ry="70" fill="none" stroke="rgba(232,175,52,0.18)" strokeWidth="1.5" strokeDasharray="4 7" />
            </svg>
            <div
              className="poker-watermark absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, fontSize: 'clamp(28px, 7vw, 64px)', letterSpacing: '0.08em', pointerEvents: 'none' }}
            >
              COVEX
            </div>

            {/* opponent seat (top) */}
            <div className="absolute top-[2%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
              <SeatPlate {...seatPlateProps(oppSeat, mySeat == null ? `SEAT ${oppSeat + 1}` : 'OPPONENT')} />
              <div className="flex gap-1.5">
                {seatHoles(oppSeat).map((c, i) => {
                  const p = cardProps(c);
                  return p
                    ? <div key={i} className={reveal ? 'anim-deal' : ''}><PlayingCard {...p} width={44} highlight={isWinCard(c)} /></div>
                    : <PlayingCard key={i} faceDown width={44} />;
                })}
              </div>
              <BetChips amount={hand ? committed[oppSeat] : 0} />
            </div>

            {/* board + pot (center) */}
            <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
              <div className="flex gap-1.5" style={{ minHeight: 78 }}>
                {[0, 1, 2, 3, 4].map((i) => {
                  const code = board[i];
                  const p = cardProps(code);
                  const fresh = !!code && i >= dealtFrom;
                  return p
                    ? (
                      <div key={`${dealKey}-${i}`} className={fresh ? 'anim-deal' : ''} style={fresh ? { animationDelay: `${(i - dealtFrom) * 90}ms` } : undefined}>
                        <PlayingCard {...p} width={56} highlight={isWinCard(code)} />
                      </div>
                    )
                    : <PlayingCard key={i} faceDown width={56} />;
                })}
              </div>
              {/* pot as chip graphic */}
              <div className="flex flex-col items-center gap-0.5">
                {(() => {
                  const potVal = hand ? hand.pot : (reveal && last ? last.pot : 0);
                  return potVal > 0
                    ? <div key={`pot-${potVal}`} className="anim-pop"><ChipStack amount={potVal} size={30} /></div>
                    : <div className="text-xs font-bold font-mono text-emerald-300 light:text-emerald-800">POT 0</div>;
                })()}
                <div className="text-[10px] font-mono text-emerald-300 light:text-emerald-800 tracking-wider">POT</div>
              </div>
              {statusLine && <div className="text-[10px] text-gray-300 light:text-slate-600 uppercase tracking-[3px] font-mono">{statusLine}</div>}
            </div>

            {/* my seat (bottom) */}
            <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
              <BetChips amount={hand ? committed[mySeat == null ? 0 : mySeat] : 0} />
              <div className="flex gap-1.5">
                {seatHoles(mySeat == null ? 0 : mySeat).map((c, i) => {
                  const p = cardProps(c);
                  const big = mySeat != null; // your own cards bigger
                  return p
                    ? <div key={i} className={reveal ? 'anim-deal' : ''}><PlayingCard {...p} width={big ? 68 : 44} highlight={isWinCard(c)} /></div>
                    : <PlayingCard key={i} faceDown width={big ? 68 : 44} />;
                })}
              </div>
              <SeatPlate {...seatPlateProps(mySeat == null ? 0 : mySeat, mySeat == null ? 'SEAT 1' : 'YOU')} />
            </div>

            {/* join overlay */}
            {status !== 'active' && !matchOver && (
              <div className="game-join-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-sm px-4" style={{ borderRadius: 999 }}>
                {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                  <>
                    <SeatButton status={status} joining={joining} walletConnected={walletConnected} onJoin={join} stake={stake} seatHint="You take seat 1. Your opponent joins as seat 2." />
                    <TrustNote />
                  </>
                ) : (
                  <>
                    <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO TAKE SEAT 2...</div>
                    <InviteLink stake={stake} />
                  </>
                )}
                {seatError && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[280px] text-center">{seatError}</div>}
              </div>
            )}
          </div>
        </div>

        {/* last hand result + verification + hand label */}
        {last && reveal && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-gray-300">
            {last.reason !== 'fold' && last.win_label && (
              <span className="px-2 py-0.5 rounded-full border border-[#49EACB]/40 bg-[#49EACB]/10 text-[#49EACB] tracking-wide font-bold">
                {last.win_label}
              </span>
            )}
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
          <div className="w-full max-w-[880px] rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md p-3 flex flex-col items-stretch gap-3">
            {authBusy && <span className="text-[11px] text-amber-300 font-mono animate-pulse text-center">SIGNING TABLE SESSION...</span>}

            {!hand && (
              <div className="flex justify-center">
                <button onClick={deal} disabled={busy || authBusy}
                  className="px-6 py-2.5 rounded-xl bg-[#49EACB] text-black font-black text-sm disabled:opacity-50 flex items-center gap-2 shadow-[0_0_24px_rgba(73,234,203,0.3)]">
                  <RefreshCw size={14} /> DEAL {m?.hand_no > 1 ? 'NEXT HAND' : 'FIRST HAND'}
                </button>
              </div>
            )}

            {hand && myTurn && (
              <>
                {/* primary actions */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => act('fold')} disabled={busy}
                    className="px-5 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-sm font-bold disabled:opacity-50">FOLD</button>
                  {canCheck ? (
                    <button onClick={() => act('check')} disabled={busy}
                      className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-white text-sm font-bold disabled:opacity-50">CHECK</button>
                  ) : (
                    <button onClick={() => act('call')} disabled={busy}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">CALL {callAmount}</button>
                  )}
                  {maxTo > hand.current_bet && (
                    <button onClick={() => act(hand.current_bet > 0 ? 'raise' : 'bet', Math.min(Math.max(raiseTo, minTo), maxTo))} disabled={busy}
                      className="px-5 py-2.5 rounded-xl bg-[#E8AF34] hover:brightness-110 text-black text-sm font-black disabled:opacity-50">
                      {hand.current_bet > 0 ? 'RAISE TO' : 'BET'} {sizedTo}
                    </button>
                  )}
                </div>

                {/* bet sizing: quick buttons + slider + readout */}
                {maxTo > hand.current_bet && (
                  <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <button onClick={() => setRaiseTo(minTo)} disabled={busy}
                        className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-[11px] font-bold text-gray-200 font-mono disabled:opacity-50">MIN</button>
                      <button onClick={() => setRaiseTo(halfPotTo)} disabled={busy}
                        className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-[11px] font-bold text-gray-200 font-mono disabled:opacity-50">1/2 POT</button>
                      <button onClick={() => setRaiseTo(fullPotTo)} disabled={busy}
                        className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-[11px] font-bold text-gray-200 font-mono disabled:opacity-50">POT</button>
                      <button onClick={() => setRaiseTo(maxTo)} disabled={busy}
                        className="px-3 py-1.5 rounded-lg border border-[#E8AF34]/50 hover:bg-[#E8AF34]/15 text-[11px] font-bold text-[#E8AF34] font-mono disabled:opacity-50">ALL-IN</button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={minTo} max={maxTo} value={Math.min(Math.max(raiseTo, minTo), maxTo)}
                        onChange={(e) => setRaiseTo(parseInt(e.target.value || '0', 10))}
                        disabled={busy}
                        className="flex-1 cursor-pointer"
                        style={{ '--range-pct': `${maxTo > minTo ? ((Math.min(Math.max(raiseTo, minTo), maxTo) - minTo) / (maxTo - minTo)) * 100 : 0}%` }}
                      />
                      <input
                        type="number" min={minTo} max={maxTo} value={raiseTo}
                        onChange={(e) => setRaiseTo(Math.max(0, parseInt(e.target.value || '0', 10)))}
                        disabled={busy}
                        className="w-20 px-2 py-1.5 rounded-lg bg-black/60 border border-white/15 text-sm font-mono text-white text-center"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 px-0.5">
                      <span>raise to <span className="text-[#E8AF34] font-bold">{sizedTo}</span></span>
                      <span>stack after <span className="text-[#49EACB] font-bold">{Math.max(0, stackAfter)}</span></span>
                    </div>
                  </div>
                )}
              </>
            )}

            {hand && !myTurn && !hand.all_in_runout && (
              <span className="text-[11px] text-gray-400 font-mono text-center">waiting for opponent...</span>
            )}

            <div className="flex items-center justify-center">
              <button onClick={() => act('resign')} disabled={busy}
                className="px-3 py-2 rounded-xl border border-red-500/40 hover:bg-red-500/10 text-red-300 text-[11px] font-bold disabled:opacity-50">RESIGN MATCH</button>
            </div>
            {err && <span className="w-full text-center text-[11px] text-red-300">{err}</span>}
          </div>
        )}

        {!matchOver && mySeat == null && status === 'active' && (
          <div className="text-[11px] text-gray-500">You are spectating. Hole cards stay hidden; every deal is commitment-verified.</div>
        )}

        {/* match over: oracle + claim */}
        {matchOver && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-base font-bold text-[#49EACB] light:text-[#0d9488]">
              {mySeat == null
                ? `SEAT ${(m.chips[0] > 0 ? 1 : 2)} WINS THE MATCH`
                : iWonMatch ? 'YOU WIN THE MATCH!' : 'OPPONENT WINS THE MATCH'}
            </div>
            {mySeat != null && !payoutResult && (
              <p className="text-[11px] text-gray-300 light:text-slate-600 max-w-xs text-center leading-snug">
                Two steps: (1) the disclosed oracle co-signs who won, (2) you claim the on-chain payout. Covex never holds the pot.
              </p>
            )}
            {!oracleSubmitted && mySeat != null && (
              <button onClick={submitToOracle} disabled={oracleLoading}
                className="px-7 py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm disabled:opacity-50 shadow-[0_0_30px_rgba(73,234,203,0.35)]">
                {oracleLoading ? '...' : '1. Get oracle signature'}
              </button>
            )}
            {oracleError && <div className="text-red-400 text-xs font-mono p-2 border border-red-500/30 rounded-xl bg-red-500/5">{oracleError}</div>}
            {oracleSubmitted && !payoutResult && (
              <button onClick={claimPayout} disabled={payoutLoading}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">
                {payoutLoading ? 'COMPUTING...' : '2. Claim pot on-chain'}
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

      <div className="h-auto min-h-[2rem] border-t border-white/10 light:border-slate-300/70 text-[9px] sm:text-[10px] text-gray-500 light:text-slate-600 flex items-center justify-center font-mono shrink-0 px-3 py-1.5 text-center">
        COMMIT-REVEAL DEAL · OUTCOME CO-SIGNED BY THE DISCLOSED COVEX ORACLE · PAYOUT ENFORCED ON-CHAIN BY THE REDEEM SCRIPT
      </div>
    </div>
  );
}
