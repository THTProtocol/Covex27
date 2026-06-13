import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Play, Users } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';
import PlayingCard from './games/PlayingCard';
import { ChipStack } from './games/Chips';

// Map our internal suit names to the PlayingCard primitive's suit codes.
const SUIT_CODE = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };

// Blackjack OPEN DUEL: persistent two-wallet multiplayer over the covenant
// match record. There is no house dealer: both players co-commit shuffle
// seeds (commit-reveal), the deck is derived deterministically from the two
// revealed seeds (neither side controls it), and each player plays their own
// open hand. Closest to 21 without busting wins; equal values push.
//
// Protocol over the strict turn alternation:
//   P1 "s:<sha256(seed)[:32]>"   P2 "s:<hash>"     (seed commits)
//   P1 "v:<seed>"                P2 "v:<seed>"     (reveals; deck derived)
//   P1 "h"* then "st"            P2 "h"* then "st" (hits keep the turn)
// Hands are public by design (open duel); secrecy is not claimed.

// SUITS feeds the oracle proof payload (e.g. "A♥"); leave its encoding intact.
const SUITS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_VALUES = { A: 11, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10 };

function orderedDeck() {
  const deck = [];
  for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += CARD_VALUES[card.rank] || 10;
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// sync 53-bit string hash (cyrb53) -> PRNG seed; commits still use sha256
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDeck(seedStr) {
  const rnd = mulberry32(cyrb53(seedStr) >>> 0);
  const deck = orderedDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

// derive the whole table from the move log; deterministic on every client
function deriveTable(moves) {
  const ms = (Array.isArray(moves) ? moves : []).filter((m) => typeof m === 'string' && m !== 'resign');
  const stageNames = ['p1commit', 'p2commit', 'p1reveal', 'p2reveal'];
  if (ms.length < 4) {
    return { stage: stageNames[ms.length], commits: { c1: ms[0]?.slice(2), c2: ms[1]?.slice(2) }, seeds: {}, p1: [], p2: [] };
  }
  const c1 = ms[0]?.startsWith('s:') ? ms[0].slice(2) : null;
  const c2 = ms[1]?.startsWith('s:') ? ms[1].slice(2) : null;
  const seed1 = ms[2]?.startsWith('v:') ? ms[2].slice(2) : null;
  const seed2 = ms[3]?.startsWith('v:') ? ms[3].slice(2) : null;
  const deck = buildDeck(`${seed1}:${seed2}`);
  const p1 = [deck[0], deck[2]];
  const p2 = [deck[1], deck[3]];
  let drawIdx = 4;
  let actor = 1;
  let p1stood = false, p2stood = false, bust = null;
  for (const m of ms.slice(4)) {
    if (m === 'h') {
      const card = deck[drawIdx++];
      if (!card) break;
      (actor === 1 ? p1 : p2).push(card);
      if (handValue(actor === 1 ? p1 : p2) > 21) { bust = actor; break; }
    } else if (m === 'st') {
      if (actor === 1) { p1stood = true; actor = 2; }
      else { p2stood = true; }
    }
  }
  const v1 = handValue(p1), v2 = handValue(p2);
  let stage, outcome = null;
  if (bust) { stage = 'done'; outcome = bust === 1 ? 'p2' : 'p1'; }
  else if (!p1stood) stage = 'p1play';
  else if (!p2stood) stage = 'p2play';
  else { stage = 'done'; outcome = v1 > v2 ? 'p1' : v2 > v1 ? 'p2' : 'push'; }
  return { stage, commits: { c1, c2 }, seeds: { seed1, seed2 }, deck, drawIdx, p1, p2, v1, v2, bust, outcome };
}

// A dealt hand of PlayingCards. Deals one card at a time with a stagger so each
// card slides from the shoe (.anim-deal) and flips back->face. This is purely a
// presentation concern: the cards/values are already derived by deriveTable().
function HandRow({ cards, width = 64, faceUp = true, dim = false, win = false }) {
  return (
    <div style={{ display: 'flex', gap: width * 0.18 }}>
      {cards.map((card, i) => (
        <div
          key={i}
          className="anim-deal"
          style={{
            animationDelay: `${i * 120}ms`,
            opacity: dim ? 0.45 : 1,
            filter: dim ? 'grayscale(0.85) brightness(0.8)' : 'none',
            transition: 'opacity 220ms ease, filter 220ms ease',
          }}
        >
          <PlayingCard
            rank={card.rank}
            suit={SUIT_CODE[card.suit]}
            width={width}
            faceDown={!faceUp}
            flipping={faceUp}
            highlight={win}
          />
        </div>
      ))}
    </div>
  );
}

export default function FullScreenBlackjack({ stake = 100, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [seedAlert, setSeedAlert] = useState(null); // commit-mismatch warning
  const [lostData, setLostData] = useState(false);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign } =
    useGameSync({ covenantId, gameType: 'blackjack', stake, onMoves: undefined });

  const table = useMemo(() => deriveTable(game?.moves), [game]);
  const mySeatNum = myColor === 'white' ? 1 : myColor === 'black' ? 2 : null;
  const myHand = mySeatNum === 2 ? table.p2 : table.p1;
  const oppHand = mySeatNum === 2 ? table.p1 : table.p2;
  const myVal = mySeatNum === 2 ? table.v2 : table.v1;
  const oppVal = mySeatNum === 2 ? table.v1 : table.v2;

  // verify revealed seeds against their commits
  useEffect(() => {
    if (!table.seeds?.seed1 || !table.seeds?.seed2) { setSeedAlert(null); return; }
    (async () => {
      const ok1 = (await sha256Hex(table.seeds.seed1)).slice(0, 32) === table.commits.c1;
      const ok2 = (await sha256Hex(table.seeds.seed2)).slice(0, 32) === table.commits.c2;
      if (!ok1 || !ok2) setSeedAlert(`${!ok1 ? 'X' : 'O'}'s seed reveal does not match their commit. The deal is void; resolve via the oracle with the public log.`);
      else setSeedAlert(null);
    })();
  }, [table.seeds?.seed1, table.seeds?.seed2]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'push' : w === 'black' ? 'p2' : 'p1';
    return { outcome };
  }, [status, game]);

  const myStage =
    (table.stage === 'p1commit' && mySeatNum === 1) || (table.stage === 'p2commit' && mySeatNum === 2) ? 'commit'
    : (table.stage === 'p1play' && mySeatNum === 1) || (table.stage === 'p2play' && mySeatNum === 2) ? 'play'
    : null;

  const storageKey = `bj:${covenantId}:${myColor}:${game?.created_at || 0}`;
  const submitting = useRef(-1);
  const msCount = (game?.moves || []).length;

  const cutDeck = async () => {
    if (status !== 'active' || !isMyTurn || myStage !== 'commit' || result) return;
    if (submitting.current === msCount) return;
    submitting.current = msCount;
    try {
      const seed = randHex(4);
      localStorage.setItem(storageKey, seed);
      const hash = (await sha256Hex(seed)).slice(0, 32);
      setError(null);
      await submitMove(`s:${hash}`);
    } finally { submitting.current = -1; }
  };

  // auto-reveal my seed when it is my reveal step
  useEffect(() => {
    if (status !== 'active' || !mySeatNum || !isMyTurn || result) return;
    const myReveal = (table.stage === 'p1reveal' && mySeatNum === 1) || (table.stage === 'p2reveal' && mySeatNum === 2);
    if (!myReveal) return;
    if (submitting.current === msCount) return;
    const seed = localStorage.getItem(storageKey);
    if (!seed) { setLostData(true); return; }
    submitting.current = msCount;
    (async () => {
      try { await submitMove(`v:${seed}`); } finally { submitting.current = -1; }
    })();
  }, [status, mySeatNum, isMyTurn, table.stage, msCount, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const hit = async () => {
    if (myStage !== 'play' || !isMyTurn || result) return;
    if (submitting.current === msCount) return;
    submitting.current = msCount;
    try {
      const nextCard = table.deck[table.drawIdx];
      const prospective = [...myHand, nextCard];
      const busts = handValue(prospective) > 21;
      setError(null);
      if (busts) {
        await submitMove('h', { finished: true, winner: myColor === 'white' ? 'black' : 'white' });
      } else {
        await submitMove('h', { keepTurn: true });
      }
    } finally { submitting.current = -1; }
  };

  const stand = async () => {
    if (myStage !== 'play' || !isMyTurn || result) return;
    if (submitting.current === msCount) return;
    submitting.current = msCount;
    try {
      setError(null);
      if (mySeatNum === 1) {
        await submitMove('st'); // turn passes to player 2
      } else {
        // second stand = showdown; attach the computed result
        const v1 = table.v1, v2 = handValue(table.p2);
        const winner = v1 > v2 ? 'white' : v2 > v1 ? 'black' : 'draw';
        await submitMove('st', { finished: true, winner });
      }
    } finally { submitting.current = -1; }
  };

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) { setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve.'); return; }
    setOracleLoading(true);
    setOracleError(null);
    const outcomeMap = { p1: 0, p2: 1, push: 2 };
    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          covenant_id: covenantId,
          circuit_type: 'blackjack_v1',
          proof: {
            game: 'blackjack_duel',
            p1_hand: table.p1.map((c) => `${c.rank}${SUITS[c.suit]}`),
            p2_hand: table.p2.map((c) => `${c.rank}${SUITS[c.suit]}`),
            p1_value: table.v1,
            p2_value: table.v2,
            log: game?.moves || [],
          },
          public_inputs: [result.outcome],
          requested_outcome: outcomeMap[result.outcome] ?? 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOracleSig(data.signature);
        setOracleResult(data);
        setOracleSubmitted(true);
      } else {
        setOracleError(data.error || 'Oracle rejected the result.');
      }
    } catch (e) {
      setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.');
    } finally {
      setOracleLoading(false);
    }
  }, [result, covenantId, table, game]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const outcomeMap = { p1: 0, p2: 1, push: 2 };
    try {
      const res = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oracle_signature: oracleResult.signature || '',
          outcome: outcomeMap[result?.outcome] ?? 0,
          total_stake_kas: totalPot,
          per_side_stake_kas: stake,
          oracle_message: oracleResult.message || '',
          oracle_timestamp: oracleResult.timestamp || null,
        }),
      });
      const data = await res.json();
      setPayoutResult(data.success ? data.payout : { error: data.error || 'Payout failed' });
    } catch (err) {
      setPayoutResult({ error: err.message });
    } finally {
      setPayoutLoading(false);
    }
  }, [covenantId, oracleResult, result, totalPot, stake]);

  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');
  const iWon = result && mySeatNum && result.outcome === (mySeatNum === 1 ? 'p1' : 'p2');

  // Presentation-only showdown flags (derived from already-computed values):
  // at resolution, flip every card face-up, glow the winning hand kaspa-green,
  // and grey out the busted hand. None of this touches game logic.
  const showdown = !!result;
  const p1Win = result && result.outcome === 'p1';
  const p2Win = result && result.outcome === 'p2';
  const p1Bust = table.bust === 1;
  const p2Bust = table.bust === 2;
  // Resolve flags from each viewer's perspective (seat 1 = X = white).
  const oppIsP2 = mySeatNum !== 2; // for a spectator/seat-1, the top hand is p2
  const oppWin = oppIsP2 ? p2Win : p1Win;
  const oppBust = oppIsP2 ? p2Bust : p1Bust;
  const meWin = oppIsP2 ? p1Win : p2Win;
  const meBust = oppIsP2 ? p1Bust : p2Bust;

  const resultText = !result ? null
    : result.outcome === 'push' ? 'PUSH'
    : mySeatNum ? (iWon ? 'YOU WIN!' : 'OPPONENT WINS')
    : result.outcome === 'p1' ? 'X WINS' : 'O WINS';

  const stageText = result ? null
    : status !== 'active' ? null
    : table.stage === 'p1commit' || table.stage === 'p2commit'
      ? (myStage === 'commit' && isMyTurn ? 'CUT THE DECK: commit your shuffle seed' : 'WAITING FOR THE DECK TO BE CUT...')
    : table.stage === 'p1reveal' || table.stage === 'p2reveal' ? 'REVEALING SEEDS, DERIVING THE SHARED DECK...'
    : myStage === 'play' && isMyTurn ? 'YOUR HAND: HIT OR STAND'
    : 'OPPONENT IS PLAYING THEIR HAND...';

  return (
    <div className="fixed inset-0 z-[999] flex flex-col" style={{ background: 'radial-gradient(ellipse at 50% 60%, #0a1a0a 0%, #050510 70%)' }}>
      {/* Top bar */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 text-sm bg-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="font-bold tracking-wider text-amber-400">BLACKJACK OPEN DUEL • KASPA COVENANT</div>
          <div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS POT • {feePercent}% FEE</div>
          <div className="text-[10px] text-emerald-400 font-mono">CO-COMMITTED DECK • NO HOUSE</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-gray-400 font-mono">ORACLE ATTESTED RESULT</div>
          <button onClick={onClose} className="px-4 py-1.5 rounded-xl border border-white/20 hover:bg-white/5 text-xs font-bold">
            EXIT FULL SCREEN
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8 overflow-auto">
        {/* Table surface */}
        <div className="board-bezel-wood relative w-full max-w-[850px] aspect-[2.2/1] rounded-[160px] shadow-2xl">
          <div className="felt-radial felt-noise absolute inset-0 rounded-[150px] overflow-hidden"
               style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(73,234,203,0.10)' }}>

            {/* Center insignia: BLACKJACK arc + PAYS 3:2 */}
            <div className="absolute top-[30%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none"
                 style={{ opacity: 0.5 }}>
              <svg width="320" height="86" viewBox="0 0 320 86" aria-hidden>
                <defs>
                  <path id="bj-arc" d="M30 80 A150 150 0 0 1 290 80" fill="none" />
                </defs>
                <text fill="#E8AF34" fontFamily="'Inter', sans-serif" fontWeight="700"
                      fontSize="26" letterSpacing="8">
                  <textPath href="#bj-arc" startOffset="50%" textAnchor="middle">BLACKJACK</textPath>
                </text>
              </svg>
              <div className="mt-1 font-mono tracking-[6px]" style={{ color: '#49EACB', fontSize: 13, opacity: 0.85 }}>
                PAYS 3:2
              </div>
              <div className="mt-1.5 font-mono tracking-[3px] text-white/35" style={{ fontSize: 8 }}>
                DEALER MUST DRAW TO 16 AND STAND ON ALL 17S
              </div>
            </div>

            {/* Deck / shoe object on the upper-right corner of the felt */}
            <div className="absolute top-[8%] right-[6%] pointer-events-none select-none" aria-hidden>
              <div className="relative" style={{ width: 58, height: 78 }}>
                {/* stacked deck edges */}
                <div className="absolute inset-0 rounded-[8px]"
                     style={{ background: 'linear-gradient(160deg,#0b2a26,#06151a)', boxShadow: '0 6px 14px rgba(0,0,0,0.5)', border: '1px solid rgba(232,175,52,0.5)' }} />
                <div className="absolute rounded-[8px]" style={{ inset: '-3px -3px 3px -3px', background: 'linear-gradient(160deg,#0e342f,#08191f)', zIndex: -1, border: '1px solid rgba(232,175,52,0.3)' }} />
                <div className="absolute rounded-[8px]" style={{ inset: '-6px -6px 6px -6px', background: 'linear-gradient(160deg,#0e342f,#08191f)', zIndex: -2, border: '1px solid rgba(232,175,52,0.2)' }} />
                {/* gold inner frame + DAG diamond mark */}
                <div className="absolute" style={{ inset: 6, borderRadius: 5, border: '1px solid rgba(232,175,52,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden>
                    <g fill="none" stroke="#49EACB" strokeWidth="6" opacity="0.85">
                      <path d="M50 14 L86 50 L50 86 L14 50 Z" />
                    </g>
                  </svg>
                </div>
              </div>
              <div className="text-center font-mono text-white/30 tracking-[2px]" style={{ fontSize: 7, marginTop: 4 }}>SHOE</div>
            </div>

            {/* Opponent area - top */}
            <div className="absolute top-[13%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <div className="text-[12px] text-gray-300 uppercase tracking-[3px] font-mono">
                {mySeatNum ? 'OPPONENT' : 'O SEAT'} <span className="lowercase tracking-normal text-gray-400">{seat(mySeatNum === 2 ? game?.player1 : game?.player2)}</span>
              </div>
              {/* betting circle for the opponent */}
              <div className="relative flex items-center justify-center"
                   style={{ minHeight: 72, padding: '4px 18px', borderRadius: 999,
                            boxShadow: oppWin ? '0 0 0 2px #49EACB, 0 0 22px rgba(73,234,203,0.5)' : 'inset 0 0 0 2px rgba(255,255,255,0.10)',
                            transition: 'box-shadow 260ms ease' }}>
                {(mySeatNum ? oppHand : table.p2).length ? (
                  <HandRow
                    cards={mySeatNum ? oppHand : table.p2}
                    width={48}
                    faceUp={showdown}
                    dim={showdown && oppBust}
                    win={showdown && oppWin}
                  />
                ) : (
                  <span className="font-mono text-white/20 tracking-[3px]" style={{ fontSize: 9 }}>BET</span>
                )}
              </div>
              <div className="text-sm font-bold font-mono tabular-nums text-white">{(mySeatNum ? oppHand : table.p2).length ? (mySeatNum ? oppVal : table.v2) : ''}</div>
            </div>

            {/* Center status */}
            <div className="absolute top-[49%] left-1/2 -translate-x-1/2 text-center w-full px-10">
              {stageText && <div className="text-[10px] text-gray-300 uppercase tracking-[3px] font-mono">{stageText}</div>}
              {seedAlert && <div className="mt-1 text-[10px] text-amber-300 font-mono">{seedAlert}</div>}
              {result && (
                <div className="inline-block px-4 py-1.5 rounded-xl bg-black/60 border border-white/10 mt-1 anim-pop">
                  <span className="text-sm font-bold font-mono uppercase tracking-wider text-[#49EACB]">{resultText}</span>
                </div>
              )}
            </div>

            {/* My area - bottom */}
            <div className="absolute bottom-[9%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              {/* betting circle for me */}
              <div className="relative flex items-center justify-center"
                   style={{ minHeight: 96, padding: '4px 18px', borderRadius: 999,
                            boxShadow: meWin ? '0 0 0 2px #49EACB, 0 0 26px rgba(73,234,203,0.55)' : 'inset 0 0 0 2px rgba(255,255,255,0.12)',
                            transition: 'box-shadow 260ms ease' }}>
                {(mySeatNum ? myHand : table.p1).length ? (
                  <HandRow
                    cards={mySeatNum ? myHand : table.p1}
                    width={64}
                    faceUp={showdown}
                    dim={showdown && meBust}
                    win={showdown && meWin}
                  />
                ) : (
                  <span className="font-mono text-white/20 tracking-[3px]" style={{ fontSize: 9 }}>BET</span>
                )}
              </div>
              <div className="text-sm font-bold font-mono tabular-nums text-white">{(mySeatNum ? myHand : table.p1).length ? (mySeatNum ? myVal : table.v1) : ''}</div>
              <div className="text-[12px] text-gray-300 uppercase tracking-[3px] font-mono">
                {mySeatNum ? 'YOU' : 'X SEAT'} <span className="lowercase tracking-normal text-gray-400">{seat(mySeatNum === 2 ? game?.player2 : game?.player1)}</span>
              </div>
            </div>

            {/* Pot display: a real chip stack that slides toward the winner on resolution */}
            <div className="absolute top-[6%] left-[12%] text-center"
                 style={{
                   transform: result
                     ? (result.outcome === 'push' ? 'none' : `translateY(${(oppIsP2 ? oppWin : meWin) ? 120 : -10}px)`)
                     : 'none',
                   transition: 'transform 600ms cubic-bezier(0.22,1,0.36,1)',
                 }}>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">POT</div>
              <ChipStack amount={totalPot} size={36} />
            </div>
          </div>
          {/* end felt surface */}

          {/* Join overlay */}
          {status !== 'active' && !result && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm rounded-[150px]">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <button onClick={join} disabled={joining}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2">
                  <Users size={16} /> {joining ? 'JOINING...' : status === 'none' ? 'TAKE SEAT X (CREATE DUEL)' : 'TAKE SEAT O (JOIN DUEL)'}
                </button>
              ) : (
                <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO TAKE SEAT O...</div>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
            </div>
          )}

          {/* Action buttons */}
          {status === 'active' && !result && (
            <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex gap-4">
              {myStage === 'commit' && isMyTurn && (
                <button onClick={cutDeck} className="px-8 py-3 rounded-xl bg-[#49EACB] text-black text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-lg">
                  CUT THE DECK
                </button>
              )}
              {myStage === 'play' && isMyTurn && (
                <>
                  <button onClick={hit} className="px-8 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-lg">
                    HIT
                  </button>
                  <button onClick={stand} className="px-8 py-3 rounded-xl bg-red-600/90 text-white text-sm font-bold hover:bg-red-700 active:scale-95 transition-all shadow-lg">
                    STAND
                  </button>
                </>
              )}
              {myColor && !myStage && <div className="text-[10px] text-gray-400 font-mono uppercase tracking-widest pt-2">waiting for opponent...</div>}
            </div>
          )}
        </div>

        {lostData && !result && (
          <div className="text-[10px] text-amber-300 max-w-sm text-center">Your shuffle seed is not on this device (different browser or cleared storage), so it cannot be revealed. You can resign the duel.</div>
        )}
        {!myColor && status === 'active' && <div className="text-[10px] text-gray-500">You are spectating. Both hands are open by design.</div>}
        {error && status === 'active' && <div className="text-[10px] text-red-300">{error}</div>}
        {!result && myColor && status === 'active' && (
          <button onClick={resign} className="px-5 py-2 rounded-xl bg-red-600/80 text-white text-xs font-bold">RESIGN DUEL</button>
        )}

        {/* Oracle result section */}
        {result && (
          <div className="flex flex-col items-center gap-4">
            {!oracleSubmitted && (
              <button
                onClick={submitToOracle}
                disabled={oracleLoading}
                className="px-8 py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985] shadow-[0_0_30px_rgba(73,234,203,0.35)] disabled:opacity-50"
              >
                {oracleLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    SUBMITTING TO ORACLE...
                  </span>
                ) : (
                  'SUBMIT RESULT TO ORACLE (GET SIGNED OUTCOME)'
                )}
              </button>
            )}
            {oracleError && (
              <div className="text-red-400 text-xs font-mono p-3 border border-red-500/30 rounded-xl bg-red-500/5">
                {oracleError}
              </div>
            )}
            {oracleSubmitted && !payoutResult && (
              <div className="text-emerald-400 text-sm font-bold p-4 border border-emerald-500/30 rounded-xl bg-emerald-500/5 flex flex-col items-center gap-2">
                <span className="flex items-center gap-2">
                  <Play size={14} className="text-emerald-400" />
                  ORACLE SIGNATURE RECEIVED - RESOLUTION READY
                </span>
                <span className="text-[10px] text-emerald-400/60 font-mono break-all max-w-lg text-center">
                  {oracleSig}
                </span>
                <div className="text-[9px] text-gray-300 mt-1 grid grid-cols-3 gap-2 w-full max-w-xs text-center">
                  <div>Winner: {((stake * 2) * (100 - feePercent - potReturnPercent) / 100).toFixed(1)} KAS</div>
                  <div>Platform: {((stake * 2) * feePercent / 100).toFixed(1)} KAS</div>
                  <div className="text-kaspa-green">Pot return: {((stake * 2) * potReturnPercent / 100).toFixed(1)} KAS</div>
                </div>
                <button
                  onClick={claimPayout}
                  disabled={payoutLoading}
                  className="mt-2 px-6 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {payoutLoading ? 'Computing...' : 'CLAIM PAYOUT (VERIFY ON BACKEND)'}
                </button>
              </div>
            )}
            {payoutResult && !payoutResult.error && (
              <div className="text-emerald-400 text-sm font-bold p-4 border border-emerald-500/30 rounded-xl bg-emerald-500/5 flex flex-col items-center gap-2">
                <span>PAYOUT COMPUTED</span>
                <div className="grid grid-cols-3 gap-2 w-full max-w-xs text-center text-xs">
                  <div>Winner: <span className="font-bold text-white">{payoutResult.winner_share_kas} KAS</span></div>
                  <div>Platform: <span className="font-bold text-rose-400">{payoutResult.platform_fee_kas} KAS</span></div>
                  <div>Pot Rtn: <span className="font-bold text-kaspa-green">{payoutResult.pot_return_kas} KAS</span></div>
                </div>
                <details className="w-full max-w-lg"><summary className="text-[10px] text-gray-400 cursor-pointer">Copy witness data</summary>
                  <pre className="mt-1 p-2 rounded bg-black/40 text-[9px] text-gray-300 whitespace-pre-wrap font-mono">{payoutResult.unlock_witness}</pre>
                </details>
              </div>
            )}
            {payoutResult && payoutResult.error && (
              <div className="text-amber-400 text-xs p-3 border border-amber-500/30 rounded-xl bg-amber-500/5">Payout error: {payoutResult.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-10 border-t border-white/10 text-[10px] text-gray-500 flex items-center justify-center font-mono">
        BLACKJACK OPEN DUEL • CO-COMMITTED DECK (COMMIT-REVEAL) • OPEN HANDS • CLOSEST TO 21 • ORACLE ATTESTED
      </div>
    </div>
  );
}
