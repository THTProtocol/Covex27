import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Users } from 'lucide-react';
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
const ICONS = { rock: '✊', paper: '✋', scissors: '✌️' };
const COLORS = { rock: 'border-stone-400/40 hover:border-stone-300', paper: 'border-sky-400/40 hover:border-sky-300', scissors: 'border-rose-400/40 hover:border-rose-300' };

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

  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign } =
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

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #1a1408 0%, #050505 70%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">ROCK PAPER SCISSORS • BEST OF 3 • COMMIT-REVEAL</div>
        <div className="flex items-center gap-2"><div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS • {potReturnPercent}% POT</div><button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 text-xs font-bold">EXIT</button></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 relative">
        {status !== 'active' && !result && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
            {(status === 'none' || (status === 'waiting' && !myColor)) ? (
              <button onClick={join} disabled={joining}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2">
                <Users size={16} /> {joining ? 'JOINING...' : status === 'none' ? 'CREATE MATCH (X)' : 'JOIN AS O'}
              </button>
            ) : (
              <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS O...</div>
            )}
            {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
          </div>
        )}

        <div className="flex gap-8 text-center">
          <div>
            <div className="text-xs text-gray-400">X {myColor === 'white' && '(you)'}</div>
            <div className="text-[9px] font-mono text-gray-500">{seat(game?.player1)}</div>
            <div className="text-2xl font-bold">{score.p1}</div>
          </div>
          <div className="pt-2 text-kaspa-green text-xs tracking-[3px]">ROUND {Math.min(roundIndex + 1, 3)}/3</div>
          <div>
            <div className="text-xs text-gray-400">O {myColor === 'black' && '(you)'}</div>
            <div className="text-[9px] font-mono text-gray-500">{seat(game?.player2)}</div>
            <div className="text-2xl font-bold">{score.p2}</div>
          </div>
        </div>

        <div className="text-sm text-gray-300 text-center max-w-sm">{phaseText}</div>

        <div className="flex gap-3">
          {CHOICES.map((c) => (
            <button key={c} disabled={!myCommitPhase || !isMyTurn || !!result || status !== 'active'} onClick={() => pick(c)}
              className={`flex flex-col items-center gap-2 px-7 py-5 rounded-2xl border-2 bg-black/40 hover:bg-white/5 hover:scale-105 active:scale-[0.985] disabled:opacity-40 transition-all ${COLORS[c] || 'border-white/20'}`}>
              <span className="text-5xl leading-none">{ICONS[c]}</span>
              <span className="text-xs font-bold uppercase tracking-widest text-gray-300">{c}</span>
            </button>
          ))}
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

        <div className="flex flex-col gap-2 w-64">
          {!result && myColor && status === 'active' && <button onClick={resign} className="py-2 rounded bg-red-600/80 text-white text-xs">RESIGN MATCH</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm">{oracleLoading ? '...' : 'SUBMIT RESULT TO ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">{payoutLoading ? 'COMPUTING...' : 'CLAIM PAYOUT'}</button>}
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

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 text-center font-mono">RPS • BEST OF 3 • COMMIT-REVEAL FAIRNESS • ORACLE ATTESTED • {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
