import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import SeatButton, { TrustNote } from './SeatButton';
import InviteLink from './InviteLink';
import useGameSync from '../hooks/useGameSync';

// Rock Paper Scissors, best of 3: persistent two-wallet multiplayer with a
// COMMIT-REVEAL protocol so picks stay secret until both are locked.
//
// One round = 4 server moves, riding the strict turn alternation:
//   P1 "c:<sha256(choice:salt)[:32]>"  P2 "c:<hash>"
//   P1 "r:<choice>:<salt>"             P2 "r:<choice>:<salt>"
// A reveal that does not hash to its commit forfeits the round. Salts are
// kept in localStorage so a refresh mid-round can still reveal. If an
// opponent abandons mid-round the match stays open, like any other arena.

const CHOICES = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

// Per-choice brand accents (visual only). Move encodings never depend on these.
const ACCENTS = {
  rock: '#49EACB', // kaspa-green
  paper: '#E8AF34', // kaspa-gold
  scissors: '#F2557A', // rose
};
const LABELS = { rock: 'ROCK', paper: 'PAPER', scissors: 'SCISSORS' };

// ── Custom inline-SVG hand icons (no OS emoji, identical everywhere) ──────────
// Consistent stroke weight, subtle gradient fills, kaspa-green/gold/rose accents.
// Pure presentation: nothing here reads or writes a move string.
function RpsIcon({ choice, size = 56, accent }) {
  const c = accent || ACCENTS[choice] || '#49EACB';
  const gid = `rps-grad-${choice}`;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 100 100',
    fill: 'none',
    stroke: c,
    strokeWidth: 4.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  return (
    <svg {...common}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.28" />
          <stop offset="100%" stopColor={c} stopOpacity="0.06" />
        </linearGradient>
      </defs>
      {choice === 'rock' && (
        <>
          {/* a closed fist */}
          <path
            fill={`url(#${gid})`}
            d="M30 46 C30 36 38 30 50 30 C64 30 72 38 72 50 L72 62 C72 74 63 82 50 82 C36 82 28 74 28 62 Z"
          />
          <path d="M30 46 C30 36 38 30 50 30 C64 30 72 38 72 50 L72 62 C72 74 63 82 50 82 C36 82 28 74 28 62 Z" />
          {/* knuckle creases */}
          <path d="M38 46 L38 56 M50 44 L50 56 M62 46 L62 56" />
          {/* thumb */}
          <path d="M28 58 C22 56 20 50 25 48" />
        </>
      )}
      {choice === 'paper' && (
        <>
          {/* an open hand / flat palm with four fingers */}
          <path
            fill={`url(#${gid})`}
            d="M32 50 L32 30 L40 30 L40 26 L48 26 L48 24 L56 24 L56 28 L64 28 L64 52 C64 68 56 80 48 80 C38 80 32 70 32 58 Z"
          />
          <path d="M32 50 L32 30 L40 30 L40 26 L48 26 L48 24 L56 24 L56 28 L64 28 L64 52 C64 68 56 80 48 80 C38 80 32 70 32 58 Z" />
          {/* finger separations */}
          <path d="M40 30 L40 48 M48 26 L48 48 M56 28 L56 48" />
        </>
      )}
      {choice === 'scissors' && (
        <>
          {/* two extended fingers in a V */}
          <path fill={`url(#${gid})`} d="M44 80 C36 70 34 58 34 44 L42 44 L46 64 L54 64 L58 44 L66 44 C66 58 64 70 56 80 Z" />
          <path d="M40 26 L48 60" />
          <path d="M60 26 L52 60" />
          <path d="M44 80 C36 70 34 58 34 44 M56 80 C64 70 66 58 66 44" />
          <path d="M44 80 L56 80" />
        </>
      )}
    </svg>
  );
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

// protocol moves in order, resign excluded
const protocolMoves = (moves) => (Array.isArray(moves) ? moves : []).filter((m) => typeof m === 'string' && m !== 'resign');

function parseRounds(ms) {
  const rounds = [];
  for (let i = 0; i + 3 < ms.length; i += 4) {
    rounds.push({
      c1: ms[i]?.startsWith('c:') ? ms[i].slice(2) : null,
      c2: ms[i + 1]?.startsWith('c:') ? ms[i + 1].slice(2) : null,
      r1: ms[i + 2]?.startsWith('r:') ? ms[i + 2].slice(2) : null,
      r2: ms[i + 3]?.startsWith('r:') ? ms[i + 3].slice(2) : null,
    });
  }
  return rounds;
}

export default function FullScreenRPS({ stake = 25, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  // verification verdicts per completed round index: { r1ok, r2ok }
  const [verdicts, setVerdicts] = useState({});
  const [lostData, setLostData] = useState(false);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [oracleLoading, setOracleLoading] = useState(false);

  const totalPot = stake * 2;

  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, walletConnected } =
    useGameSync({ covenantId, gameType: 'rps', stake, onMoves: undefined });

  const ms = protocolMoves(game?.moves);
  const phase = ms.length % 4; // 0: P1 commit, 1: P2 commit, 2: P1 reveal, 3: P2 reveal
  const roundIndex = Math.floor(ms.length / 4);
  const rounds = useMemo(() => parseRounds(ms), [game]);

  // verify reveals against commits as rounds complete
  useEffect(() => {
    (async () => {
      const next = {};
      let changed = false;
      for (let i = 0; i < rounds.length; i++) {
        if (verdicts[i]) { next[i] = verdicts[i]; continue; }
        const r = rounds[i];
        const r1ok = !!(r.r1 && r.c1 && (await sha256Hex(r.r1)).slice(0, 32) === r.c1 && CHOICES.includes(r.r1.split(':')[0]));
        const r2ok = !!(r.r2 && r.c2 && (await sha256Hex(r.r2)).slice(0, 32) === r.c2 && CHOICES.includes(r.r2.split(':')[0]));
        next[i] = { r1ok, r2ok };
        changed = true;
      }
      if (changed) setVerdicts(next);
    })();
  }, [rounds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const roundWinner = useCallback((r, v) => {
    const p1 = r.r1?.split(':')[0];
    const p2 = r.r2?.split(':')[0];
    const ok1 = v ? v.r1ok : CHOICES.includes(p1);
    const ok2 = v ? v.r2ok : CHOICES.includes(p2);
    if (!ok1 && !ok2) return 'draw';
    if (!ok1) return 'p2';
    if (!ok2) return 'p1';
    if (p1 === p2) return 'draw';
    return BEATS[p1] === p2 ? 'p1' : 'p2';
  }, []);

  const score = useMemo(() => {
    const s = { p1: 0, p2: 0, cheats: [] };
    rounds.forEach((r, i) => {
      const v = verdicts[i];
      const w = roundWinner(r, v);
      if (w === 'p1') s.p1++; else if (w === 'p2') s.p2++;
      if (v && (!v.r1ok || !v.r2ok)) s.cheats.push({ round: i + 1, by: !v.r1ok ? 'X' : 'O' });
    });
    return s;
  }, [rounds, verdicts, roundWinner]);

  const lastMove = (game?.moves || [])[(game?.moves || []).length - 1];
  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'black' ? 'o' : 'x';
    return { outcome, method: lastMove === 'resign' ? 'resign' : 'bestof' };
  }, [status, game, lastMove]);

  const myCommitPhase = (phase === 0 && myColor === 'white') || (phase === 1 && myColor === 'black');
  const myRevealPhase = (phase === 2 && myColor === 'white') || (phase === 3 && myColor === 'black');
  const storageKey = (idx) => `rps:${covenantId}:${idx}:${myColor}`;
  const submitting = useRef(-1);

  const pick = async (choice) => {
    if (status !== 'active' || !myColor || result) return;
    if (!isMyTurn || !myCommitPhase) { setError('Wait for your pick phase.'); return; }
    if (submitting.current === ms.length) return;
    submitting.current = ms.length;
    try {
      const salt = randHex(4);
      const full = `${choice}:${salt}`;
      localStorage.setItem(storageKey(roundIndex), full);
      const hash = (await sha256Hex(full)).slice(0, 32);
      setError(null);
      await submitMove(`c:${hash}`);
    } finally {
      submitting.current = -1;
    }
  };

  // auto-reveal when it is my reveal phase; the final reveal of a round also
  // decides whether the match is over and attaches finished/winner
  useEffect(() => {
    if (status !== 'active' || !myColor || !isMyTurn || !myRevealPhase) return;
    if (submitting.current === ms.length) return;
    const stored = localStorage.getItem(storageKey(roundIndex));
    if (!stored) { setLostData(true); return; }
    submitting.current = ms.length;
    (async () => {
      try {
        const opts = {};
        if (phase === 3) {
          // my reveal completes the round: compute the prospective result
          const r1str = ms[ms.length - 1]?.startsWith('r:') ? ms[ms.length - 1].slice(2) : null;
          const c1 = ms[ms.length - 3]?.startsWith('c:') ? ms[ms.length - 3].slice(2) : null;
          const p1choice = r1str?.split(':')[0];
          const p1ok = !!(r1str && c1 && (await sha256Hex(r1str)).slice(0, 32) === c1 && CHOICES.includes(p1choice));
          const myChoice = stored.split(':')[0];
          let rw;
          if (!p1ok) rw = 'p2';
          else if (p1choice === myChoice) rw = 'draw';
          else rw = BEATS[p1choice] === myChoice ? 'p1' : 'p2';
          const p1s = score.p1 + (rw === 'p1' ? 1 : 0);
          const p2s = score.p2 + (rw === 'p2' ? 1 : 0);
          const played = rounds.length + 1;
          if (p1s >= 2 || p2s >= 2 || played >= 3) {
            opts.finished = true;
            opts.winner = p1s > p2s ? 'white' : p2s > p1s ? 'black' : 'draw';
          }
        }
        await submitMove(`r:${stored}`, opts);
      } finally {
        submitting.current = -1;
      }
    })();
  }, [status, myColor, isMyTurn, myRevealPhase, ms.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) { setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve.'); return; }
    setOracleLoading(true); setOracleError(null);
    const om = { x: 0, o: 1, draw: 2 };
    try {
      const r = await fetch('/api/oracle/verify-and-sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'rps_v1', proof: { game: 'rps', rounds: rounds.length, score: { X: score.p1, O: score.p2 }, log: ms }, public_inputs: [result.outcome], requested_outcome: om[result.outcome] ?? 0 }) });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); }
      else { setOracleError(d.error || 'Oracle rejected the result.'); }
    } catch (e) { setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.'); }
    finally { setOracleLoading(false); }
  }, [result, covenantId, rounds.length, score, ms]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { x: 0, o: 1, draw: 2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oracle_signature: oracleResult.signature || oracleSig || '', outcome: om[result?.outcome] ?? 0, total_stake_kas: totalPot, per_side_stake_kas: stake, oracle_message: `rps:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now() / 1000) }) });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : { error: d.error });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewF = ((totalPot) * feePercent / 100).toFixed(1);
  const previewR = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const lastRound = rounds.length ? rounds[rounds.length - 1] : null;
  const lastV = rounds.length ? verdicts[rounds.length - 1] : null;
  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');

  const phaseText = result ? 'GAME OVER'
    : status !== 'active' ? status.toUpperCase()
    : myCommitPhase ? 'PICK NOW (LOCKED AS A HASH UNTIL BOTH REVEAL)'
    : myRevealPhase ? 'REVEALING YOUR PICK...'
    : phase <= 1 ? 'OPPONENT IS LOCKING A PICK...'
    : 'OPPONENT IS REVEALING...';

  // ── Presentation-only derivations (no game logic, no move strings touched) ──
  // The "showdown" view decodes the most recently completed round's reveals
  // purely for animation. p1 = X (white seat), p2 = O (black seat); we orient
  // them to "me" vs "opponent" based on myColor. These are read-only.
  const showdown = useMemo(() => {
    if (!lastRound || !lastRound.r1 || !lastRound.r2) return null;
    const p1pick = lastRound.r1.split(':')[0];
    const p2pick = lastRound.r2.split(':')[0];
    if (!CHOICES.includes(p1pick) || !CHOICES.includes(p2pick)) return null;
    const w = roundWinner(lastRound, lastV); // 'p1' | 'p2' | 'draw'
    const iAmP1 = myColor === 'white';
    const iAmP2 = myColor === 'black';
    const mine = iAmP1 ? p1pick : iAmP2 ? p2pick : p1pick;
    const opp = iAmP1 ? p2pick : iAmP2 ? p1pick : p2pick;
    // outcome from the local player's perspective for flourish styling
    let myOutcome = 'draw';
    if (w !== 'draw') {
      const iWon = (w === 'p1' && iAmP1) || (w === 'p2' && iAmP2);
      const iLost = (w === 'p1' && iAmP2) || (w === 'p2' && iAmP1);
      myOutcome = iWon ? 'win' : iLost ? 'loss' : 'spectate';
    }
    return { mine, opp, winner: w, myOutcome, roundNo: rounds.length };
  }, [lastRound, lastV, myColor, rounds.length, roundWinner]);

  // Re-key the showdown so its slide/clash animation replays for each new round.
  const showdownKey = showdown ? `${showdown.roundNo}` : 'none';

  // Round flourish wrapper class, keyed off the local player's outcome.
  const flourishClass = !showdown
    ? ''
    : showdown.myOutcome === 'win'
      ? 'rps-flourish-win'
      : showdown.myOutcome === 'loss'
        ? 'rps-flourish-loss'
        : 'rps-flourish-draw';

  // 3-2-1 count-in: shown while we wait on the opponent during a live round.
  const countingIn = status === 'active' && !result && !myCommitPhase && !myRevealPhase;

  // Best-of-3 progress pips per seat (visual mirror of the score, capped at 3).
  const pipRow = (won) =>
    [0, 1, 2].map((i) => (i < won ? 'filled' : i < Math.min(rounds.length, 3) ? 'played' : 'empty'));

  // Reveal phase: the padlock badge snaps open while my pick is being revealed.
  const lockOpen = myRevealPhase || phase >= 2 || !!result;

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #1a1408 0%, #050505 70%)' }}>
      <div className="h-12 sm:h-14 border-b border-white/10 flex items-center justify-between gap-2 px-3 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB] truncate text-[11px] sm:text-sm">
          <span className="sm:hidden">RPS · BO3</span>
          <span className="hidden sm:inline">ROCK PAPER SCISSORS · BEST OF 3 · COMMIT-REVEAL</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10 whitespace-nowrap">{totalPot} KAS · {potReturnPercent}% POT</div>
          <button
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 rounded-xl border border-white/20 text-xs font-bold"
            aria-label="Exit RPS arena"
          >EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 relative">
        {status !== 'active' && !result && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm px-4">
            {(status === 'none' || (status === 'waiting' && !myColor)) ? (
              <>
                <SeatButton status={status} joining={joining} walletConnected={walletConnected} onJoin={join} stake={stake} seatHint="You play X. Your opponent joins as O." />
                <TrustNote />
              </>
            ) : (
              <>
                <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS O...</div>
                <InviteLink stake={stake} />
              </>
            )}
            {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
          </div>
        )}

        {/* ── Premium scoreboard with best-of-3 progress pips ── */}
        <div className="flex items-center gap-6 sm:gap-10 text-center">
          <div className={`flex flex-col items-center ${myColor === 'white' ? 'rps-seat-me' : ''}`}>
            <div className="text-[11px] font-bold tracking-wider text-gray-300">X {myColor === 'white' && <span className="text-[#49EACB]">(you)</span>}</div>
            <div className="text-[9px] font-mono text-gray-500">{seat(game?.player1)}</div>
            <div className="text-3xl font-black font-mono tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 18px rgba(73,234,203,0.25)' }}>{score.p1}</div>
            <div className="flex gap-1.5 mt-1.5">
              {pipRow(score.p1).map((s, i) => <span key={i} className={`rps-pip rps-pip-x rps-pip-${s}`} />)}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className="text-[#49EACB] text-[10px] tracking-[4px] font-bold">ROUND</div>
            <div className="font-mono text-lg font-black text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{Math.min(roundIndex + 1, 3)}<span className="text-gray-600">/3</span></div>
          </div>
          <div className={`flex flex-col items-center ${myColor === 'black' ? 'rps-seat-me' : ''}`}>
            <div className="text-[11px] font-bold tracking-wider text-gray-300">O {myColor === 'black' && <span className="text-[#49EACB]">(you)</span>}</div>
            <div className="text-[9px] font-mono text-gray-500">{seat(game?.player2)}</div>
            <div className="text-3xl font-black font-mono tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 18px rgba(232,175,52,0.25)' }}>{score.p2}</div>
            <div className="flex gap-1.5 mt-1.5">
              {pipRow(score.p2).map((s, i) => <span key={i} className={`rps-pip rps-pip-o rps-pip-${s}`} />)}
            </div>
          </div>
        </div>

        {/* ── Showdown stage: count-in pulse, or the slide-in clash on reveal ── */}
        <div className={`rps-stage ${flourishClass}`} key={showdownKey}>
          {showdown ? (
            <div className="flex items-center justify-center gap-3 sm:gap-6">
              {/* my hand slides in from the left */}
              <div className={`rps-hand rps-hand-left rps-clash ${showdown.myOutcome === 'loss' ? 'rps-dim' : ''}`}>
                <div className={`rps-hand-tile ${showdown.myOutcome === 'win' ? 'rps-hand-win' : ''}`} style={{ '--rps-accent': ACCENTS[showdown.mine] }}>
                  <RpsIcon choice={showdown.mine} size={64} />
                </div>
                <div className="text-[10px] font-bold tracking-widest mt-1.5 text-gray-300">{myColor ? 'YOU' : 'X'}</div>
              </div>
              {/* VS divider */}
              <div className="flex flex-col items-center">
                <div className="rps-vs font-black text-lg sm:text-xl" style={{ fontFamily: "'JetBrains Mono', monospace" }}>VS</div>
              </div>
              {/* opponent hand slides in from the right */}
              <div className={`rps-hand rps-hand-right rps-clash ${showdown.myOutcome === 'win' ? 'rps-dim' : ''}`}>
                <div className={`rps-hand-tile ${showdown.myOutcome === 'loss' ? 'rps-hand-win' : ''}`} style={{ '--rps-accent': ACCENTS[showdown.opp] }}>
                  <RpsIcon choice={showdown.opp} size={64} />
                </div>
                <div className="text-[10px] font-bold tracking-widest mt-1.5 text-gray-300">{myColor ? 'OPPONENT' : 'O'}</div>
              </div>
            </div>
          ) : countingIn ? (
            <div className="flex flex-col items-center gap-1">
              <div className="rps-countin font-black" style={{ fontFamily: "'JetBrains Mono', monospace" }}>3 · 2 · 1</div>
              <div className="text-[10px] text-gray-500 tracking-widest">LOCKING IN</div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-5 opacity-60">
              {CHOICES.map((c) => (
                <div key={c} className="rps-float" style={{ animationDelay: `${CHOICES.indexOf(c) * 0.18}s` }}>
                  <RpsIcon choice={c} size={40} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-sm text-gray-300 text-center max-w-sm tracking-wide">{phaseText}</div>

        {/* ── Premium glass choice tiles with idle float + LOCKED padlock badge ── */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
          {CHOICES.map((c, i) => {
            const disabled = !myCommitPhase || !isMyTurn || !!result || status !== 'active';
            return (
              <button
                key={c}
                disabled={disabled}
                onClick={() => pick(c)}
                className={`rps-tile ${disabled ? 'rps-tile-locked' : 'rps-tile-live'}`}
                style={{ '--rps-accent': ACCENTS[c], animationDelay: `${i * 0.22}s` }}
              >
                <span className="rps-tile-icon"><RpsIcon choice={c} size={52} /></span>
                <span className="text-xs font-bold uppercase tracking-[2px] text-gray-200">{LABELS[c]}</span>
                {/* padlock fairness badge: closed while committed/hidden, snaps open on reveal */}
                <span className={`rps-lock ${lockOpen ? 'rps-lock-open' : 'rps-lock-closed'}`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    {lockOpen
                      ? <path d="M8 11V7a4 4 0 0 1 8 0" />
                      : <path d="M8 11V7a4 4 0 0 1 8 0v4" />}
                  </svg>
                  {lockOpen ? 'OPEN' : 'LOCKED (hashed)'}
                </span>
              </button>
            );
          })}
        </div>

        {lastRound && lastRound.r1 && lastRound.r2 && (
          <div className="text-xs text-gray-400">
            Round {rounds.length}: {lastRound.r1.split(':')[0]} vs {lastRound.r2.split(':')[0]} → {(() => { const w = roundWinner(lastRound, lastV); return w === 'draw' ? 'draw' : w === 'p1' ? 'X' : 'O'; })()}
          </div>
        )}
        {score.cheats.map((c, i) => (
          <div key={i} className="text-[10px] text-amber-300">Round {c.round}: {c.by}'s reveal did not match their commit - round forfeited to the other side.</div>
        ))}
        {lostData && !result && (
          <div className="text-[10px] text-amber-300 max-w-xs text-center">Your pick data for this round is not on this device (different browser or cleared storage), so it cannot be revealed. You can resign the match.</div>
        )}
        {!myColor && status === 'active' && <div className="text-[10px] text-gray-500">You are spectating. Picks stay hidden until both reveal.</div>}
        {error && status === 'active' && <div className="text-[10px] text-red-300">{error}</div>}

        {result && myColor && !payoutResult && (
          <p className="text-[11px] text-gray-300 light:text-slate-600 max-w-xs text-center leading-snug">
            Two steps: (1) the disclosed oracle co-signs who won, (2) you claim the on-chain payout. Covex never holds the pot.
          </p>
        )}
        <div className="flex flex-col gap-2 w-64">
          {!result && myColor && status === 'active' && <button onClick={resign} className="py-2 rounded bg-red-600/80 text-white text-xs">RESIGN MATCH</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm">{oracleLoading ? '...' : '1. Get oracle signature'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">{payoutLoading ? 'COMPUTING...' : '2. Claim pot on-chain'}</button>}
          <button onClick={onClose} className="py-2 rounded border border-white/20 text-xs">CLOSE ARENA</button>
        </div>
        {oracleError && <div className="text-[10px] text-amber-300 max-w-xs text-center">{oracleError}</div>}

        {result && (
          <div className="text-sm font-bold text-[#49EACB]">{result.outcome === 'draw' ? 'MATCH DRAWN' : `${result.outcome.toUpperCase()} WINS THE MATCH`}{result.method === 'resign' ? ' • BY RESIGNATION' : ''}</div>
        )}

        {result && !payoutResult && (
          <div className="text-[10px] grid grid-cols-3 gap-2 w-72 text-center">
            <div className="p-2 bg-black/40 border border-white/10 rounded">Winner {previewW} KAS</div>
            <div className="p-2 bg-black/40 border border-white/10 rounded">Platform {previewF} KAS</div>
            <div className="p-2 bg-black/40 border border-white/10 rounded">Pot {previewR} KAS</div>
          </div>
        )}
        {payoutResult && !payoutResult.error && (
          <div className="text-xs p-3 border border-emerald-500/30 bg-emerald-500/5 rounded-xl">
            PAYOUT: Winner {payoutResult.winner_share_kas} • Platform {payoutResult.platform_fee_kas} • Pot {payoutResult.pot_return_kas} KAS
            <details><summary className="text-[9px] text-gray-400">witness</summary><pre className="text-[8px]">{payoutResult.unlock_witness}</pre></details>
          </div>
        )}
      </div>

      <div className="h-auto min-h-[2rem] border-t border-white/10 light:border-slate-300/70 text-[11px] text-gray-300 light:text-slate-600 flex items-center justify-center text-center font-mono px-3 py-1.5 shrink-0">COMMIT-REVEAL FAIRNESS · OUTCOME CO-SIGNED BY THE DISCLOSED COVEX ORACLE · {potReturnPercent}% POT RETURN</div>

      {/* Self-contained premium styles for this arena (rps-* scoped, visual only). */}
      <style>{`
        /* progress pips */
        .rps-pip { width: 9px; height: 9px; border-radius: 50%; display: inline-block; box-sizing: border-box; }
        .rps-pip-empty { background: transparent; border: 1.5px solid rgba(255,255,255,0.18); }
        .rps-pip-played { background: rgba(255,255,255,0.18); }
        .rps-pip-x.rps-pip-filled { background: #49EACB; box-shadow: 0 0 8px rgba(73,234,203,0.7); }
        .rps-pip-o.rps-pip-filled { background: #E8AF34; box-shadow: 0 0 8px rgba(232,175,52,0.7); }
        .rps-seat-me { transform: translateY(-2px); }

        /* showdown stage frame */
        .rps-stage {
          min-height: 132px;
          display: flex; align-items: center; justify-content: center;
          width: 100%; max-width: 460px;
          padding: 14px 18px; border-radius: 18px;
          background: linear-gradient(160deg, rgba(255,255,255,0.04), rgba(0,0,0,0.25));
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 30px -18px rgba(0,0,0,0.8);
        }

        /* hand tile inside the stage */
        .rps-hand { display: flex; flex-direction: column; align-items: center; transition: opacity .3s ease, transform .3s ease; }
        .rps-hand-tile {
          width: 92px; height: 92px; display: flex; align-items: center; justify-content: center;
          border-radius: 18px;
          background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--rps-accent) 16%, transparent), rgba(0,0,0,0.35));
          border: 1.5px solid color-mix(in srgb, var(--rps-accent) 45%, transparent);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 0 22px -6px var(--rps-accent);
        }
        .rps-hand-win { box-shadow: 0 0 0 2px var(--rps-accent), 0 0 28px -2px var(--rps-accent); animation: rps-winflash 0.7s ease-out 0.45s 2; }
        .rps-dim { opacity: 0.5; transform: scale(0.86); }

        /* slide-in clash on reveal: left from -x, right from +x, both with a shake */
        .rps-clash.rps-hand-left { animation: rps-slide-left 0.5s cubic-bezier(0.22,1,0.36,1) both, rps-shake 0.32s ease-in-out 0.5s 1; }
        .rps-clash.rps-hand-right { animation: rps-slide-right 0.5s cubic-bezier(0.22,1,0.36,1) both, rps-shake 0.32s ease-in-out 0.5s 1; }
        @keyframes rps-slide-left { from { transform: translateX(-120px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes rps-slide-right { from { transform: translateX(120px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes rps-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        @keyframes rps-winflash { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.6); } }

        .rps-vs {
          color: #E8AF34; letter-spacing: 2px;
          text-shadow: 0 0 12px rgba(232,175,52,0.5);
        }

        /* 3-2-1 count-in pulse */
        .rps-countin { font-size: 34px; color: #49EACB; letter-spacing: 4px; animation: rps-countpulse 1.2s ease-in-out infinite; }
        @keyframes rps-countpulse { 0%,100% { opacity: 0.45; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.08); text-shadow: 0 0 22px rgba(73,234,203,0.6); } }

        /* idle float for the resting icon strip */
        .rps-float { animation: rps-float 3.2s ease-in-out infinite; }
        @keyframes rps-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }

        /* round flourishes wrapping the whole stage */
        .rps-flourish-win { animation: rps-glowpop 0.85s ease-out 0.5s 1; }
        .rps-flourish-loss { animation: rps-redshake 0.5s ease-in-out 0.5s 1; }
        .rps-flourish-draw { animation: rps-neutralpulse 1.1s ease-in-out 0.5s 1; }
        @keyframes rps-glowpop {
          0% { transform: scale(1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 30px -18px rgba(0,0,0,0.8); }
          35% { transform: scale(1.035); box-shadow: 0 0 0 1px rgba(73,234,203,0.6), 0 0 40px -4px rgba(73,234,203,0.7); }
          100% { transform: scale(1); }
        }
        @keyframes rps-redshake {
          0%,100% { transform: translateX(0); box-shadow: 0 0 0 1px rgba(242,85,122,0.4); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(7px); }
          60% { transform: translateX(-5px); box-shadow: 0 0 30px -6px rgba(242,85,122,0.7); }
          80% { transform: translateX(4px); }
        }
        @keyframes rps-neutralpulse { 0%,100% { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); } 50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.25), 0 0 26px -8px rgba(255,255,255,0.3); } }

        /* premium glass choice tiles */
        .rps-tile {
          position: relative;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 18px 24px; border-radius: 20px;
          background: linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015));
          border: 1.5px solid color-mix(in srgb, var(--rps-accent) 30%, rgba(255,255,255,0.12));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 28px -16px rgba(0,0,0,0.85);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          transition: transform .18s ease, box-shadow .25s ease, border-color .25s ease, opacity .2s ease;
          cursor: pointer;
        }
        .rps-tile-live { animation: rps-tilefloat 3.4s ease-in-out infinite; }
        .rps-tile-live:hover {
          transform: translateY(-6px) scale(1.05);
          border-color: var(--rps-accent);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px var(--rps-accent), 0 0 30px -6px var(--rps-accent);
        }
        .rps-tile-live:active { transform: translateY(-2px) scale(0.99); }
        .rps-tile-locked { opacity: 0.5; cursor: default; }
        .rps-tile-icon { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--rps-accent) 50%, transparent)); }
        @keyframes rps-tilefloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

        /* commit-reveal padlock fairness badge */
        .rps-lock {
          position: absolute; top: -9px; right: -9px;
          display: flex; align-items: center; gap: 3px;
          padding: 2px 7px 2px 5px; border-radius: 999px;
          font-size: 8px; font-weight: 800; letter-spacing: 0.5px;
          font-family: 'JetBrains Mono', monospace;
          transition: background .25s ease, color .25s ease, box-shadow .25s ease, transform .25s ease;
        }
        .rps-lock-closed { background: rgba(232,175,52,0.18); color: #E8AF34; box-shadow: 0 0 0 1px rgba(232,175,52,0.4); animation: rps-lockclose 0.3s ease-out; }
        .rps-lock-open { background: rgba(73,234,203,0.16); color: #49EACB; box-shadow: 0 0 0 1px rgba(73,234,203,0.4); animation: rps-locksnap 0.42s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes rps-lockclose { from { transform: scale(1.25); } to { transform: scale(1); } }
        @keyframes rps-locksnap { 0% { transform: scale(1) rotate(0); } 40% { transform: scale(1.25) rotate(-8deg); } 100% { transform: scale(1) rotate(0); } }

        @media (prefers-reduced-motion: reduce) {
          .rps-clash.rps-hand-left, .rps-clash.rps-hand-right,
          .rps-hand-win, .rps-countin, .rps-float, .rps-tile-live,
          .rps-flourish-win, .rps-flourish-loss, .rps-flourish-draw,
          .rps-lock-closed, .rps-lock-open { animation: none; }
        }
      `}</style>
    </div>
  );
}
