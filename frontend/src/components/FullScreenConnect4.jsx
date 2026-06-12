import { useState, useCallback, useEffect, useMemo } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';

// Professional full-screen Connect 4 (7x6): persistent two-wallet multiplayer
// over the covenant match record. Seats: player1 = R (red, drops first),
// player2 = Y. Board state is replayed from the server move log ("R:3", ...).

const COLS = 7;
const ROWS = 6;
const getCol = (i) => i % COLS;
const getRow = (i) => Math.floor(i / COLS);

const checkWin = (b, idx, player) => {
  const r = getRow(idx), c = getCol(idx);
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let cnt = 1;
    for (let d = 1; d < 4; d++) {
      const rr = r + d * dr, cc = c + d * dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== player) break;
      cnt++;
    }
    for (let d = 1; d < 4; d++) {
      const rr = r - d * dr, cc = c - d * dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== player) break;
      cnt++;
    }
    if (cnt >= 4) return true;
  }
  return false;
};

const dropInto = (b, col, label) => {
  for (let r = ROWS - 1; r >= 0; r--) {
    const i = r * COLS + col;
    if (!b[i]) { b[i] = label; return i; }
  }
  return -1;
};

const replayBoard = (moves) => {
  const b = Array(COLS * ROWS).fill(null);
  for (const m of moves) {
    const mt = typeof m === 'string' && m.match(/^([RY]):([0-6])$/);
    if (mt) dropInto(b, Number(mt[2]), mt[1]);
  }
  return b;
};

export default function FullScreenConnect4({ stake = 30, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(Array(COLS * ROWS).fill(null));
  const [localMethod, setLocalMethod] = useState(null);

  const [redTime, setRedTime] = useState(2 * 60 * 1000);
  const [yellowTime, setYellowTime] = useState(2 * 60 * 1000);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const onMoves = useCallback((moves) => { setBoard(replayBoard(moves)); }, []);
  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign } =
    useGameSync({ covenantId, gameType: 'connect4', stake, onMoves });

  const myLabel = myColor === 'white' ? 'R' : myColor === 'black' ? 'Y' : null;
  const turnLabel = game?.current_turn === 'black' ? 'Y' : 'R';

  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'black' ? 'yellow' : 'red';
    return { outcome, method: localMethod || 'result' };
  }, [status, game, localMethod]);

  const drop = (col) => {
    if (status !== 'active' || !myLabel || result) return;
    if (!isMyTurn) { setError('Not your turn.'); return; }
    const newB = [...board];
    const landed = dropInto(newB, col, myLabel);
    if (landed < 0) return; // column full
    setBoard(newB);
    setError(null);
    const won = checkWin(newB, landed, myLabel);
    const full = newB.every(Boolean);
    if (won) setLocalMethod('connect4');
    else if (full) setLocalMethod('board_full');
    submitMove(`${myLabel}:${col}`, { finished: won || full, winner: won ? myColor : full ? 'draw' : null });
  };

  // display clocks tick for the side to move (advisory; server enforces turns, not time)
  useEffect(() => {
    if (status !== 'active') return undefined;
    const iv = setInterval(() => {
      if (game?.current_turn === 'white') setRedTime((t) => Math.max(0, t - 1000));
      else setYellowTime((t) => Math.max(0, t - 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [status, game]);

  const formatTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve. Create a connect4 covenant to play for real stakes.');
      return;
    }
    setOracleLoading(true); setOracleError(null);
    const om = { red: 0, yellow: 1, draw: 2 };
    const out = om[result.outcome] ?? 0;
    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          covenant_id: covenantId,
          circuit_type: 'connect4_v1',
          proof: { game: 'connect4', result: result.outcome, cols: (game?.moves || []).length },
          public_inputs: [result.outcome, result.method],
          requested_outcome: out,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOracleSig(data.signature); setOracleSubmitted(true); setOracleResult(data);
      } else {
        setOracleError(data.error || 'Oracle rejected the result.');
      }
    } catch (e) {
      setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.');
    } finally { setOracleLoading(false); }
  }, [result, covenantId, game]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { red: 0, yellow: 1, draw: 2 };
    try {
      const res = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oracle_signature: oracleResult.signature || oracleSig || '',
          outcome: om[result?.outcome] ?? 0,
          total_stake_kas: totalPot,
          per_side_stake_kas: stake,
          oracle_message: oracleResult.message || `connect4:${result?.outcome}`,
          oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now() / 1000),
        }),
      });
      const data = await res.json();
      setPayoutResult(data.success ? data.payout : { error: data.error || 'failed' });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewWin = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewFee = ((totalPot) * feePercent / 100).toFixed(1);
  const previewPot = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const moves = Array.isArray(game?.moves) ? game.moves : [];
  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #0a1628 0%, #050505 70%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur-xl shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">CONNECT 4 • KASPA COVENANT</div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS POT • {potReturnPercent}% RETURN</div>
          <button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 hover:bg-white/5 text-xs font-bold">EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-3 p-2 overflow-auto">
        {/* Left desktop red clock */}
        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400 tracking-widest">RED{myLabel === 'R' && ' • YOU'}</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${redTime < 30000 ? 'text-red-500' : 'text-red-400'}`}>{formatTime(redTime)}</div>
          <div className="mt-1 text-[10px] font-mono text-gray-500">{seat(game?.player1)}</div>
        </div>

        {/* Board */}
        <div className="relative">
          {/* mobile clocks row */}
          <div className="lg:hidden flex justify-between items-center max-w-[min(94vw,420px)] mb-1 text-xs">
            <div className={`font-mono tabular-nums ${redTime < 30000 ? 'text-red-500' : 'text-red-400'}`}>{formatTime(redTime)} RED</div>
            <div className="text-kaspa-green font-mono text-[10px] tracking-widest">{result ? 'OVER' : status === 'active' ? (turnLabel === 'R' ? 'RED DROP' : 'YELLOW DROP') : status.toUpperCase()}</div>
            <div className={`font-mono tabular-nums ${yellowTime < 30000 ? 'text-red-500' : 'text-yellow-400'}`}>YEL {formatTime(yellowTime)}</div>
          </div>

          <div className="grid grid-cols-7 gap-1 p-2 bg-[#1d4ed8] rounded-2xl border-4 border-[#1e40af] shadow-[0_16px_50px_-12px_rgba(29,78,216,0.55)]" style={{ width: 'min(94vw, 420px)' }}>
            {board.map((cell, i) => (
              <div key={i} onClick={() => drop(getCol(i))} className="aspect-square bg-[#0b1530] rounded-full cursor-pointer flex items-center justify-center shadow-[inset_0_3px_8px_rgba(0,0,0,0.7)] hover:bg-[#101d42] active:bg-[#15265a] transition-colors">
                {cell && <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full ${cell === 'R' ? 'bg-gradient-to-br from-red-400 to-red-600 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.35),0_2px_4px_rgba(0,0,0,0.5)]' : 'bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.5)]'}`} />}
              </div>
            ))}
          </div>

          {status !== 'active' && !result && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <button onClick={join} disabled={joining}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2">
                  <Users size={16} /> {joining ? 'JOINING...' : status === 'none' ? 'CREATE MATCH (RED)' : 'JOIN AS YELLOW'}
                </button>
              ) : (
                <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS YELLOW...</div>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
            </div>
          )}

          <div className="text-center mt-1.5 text-xs font-mono text-kaspa-green tracking-wider">{result ? (result.outcome === 'draw' ? 'DRAW' : `${result.outcome.toUpperCase()} WINS`) : status === 'active' ? (turnLabel === 'R' ? 'RED TO DROP' : 'YELLOW TO DROP') : ''}</div>
          {!myColor && status === 'active' && <div className="text-center text-[10px] text-gray-500 mt-0.5">You are spectating. Drops sync live.</div>}
          {error && status === 'active' && <div className="text-center text-[10px] text-red-300 mt-0.5">{error}</div>}
        </div>

        {/* Right desktop + controls */}
        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400 tracking-widest">YELLOW{myLabel === 'Y' && ' • YOU'}</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${yellowTime < 30000 ? 'text-red-500' : 'text-yellow-400'}`}>{formatTime(yellowTime)}</div>
          <div className="mt-1 text-[10px] font-mono text-gray-500">{seat(game?.player2)}</div>

          <div className="mt-3 w-full text-[10px] font-mono bg-black/50 border border-white/10 rounded-xl p-2 max-h-[120px] overflow-auto">
            {moves.slice(-6).map((m, i) => <div key={i}>{m}</div>)}
          </div>

          <div className="mt-3 w-full flex flex-col gap-1.5">
            {!result && myColor && status === 'active' && <button onClick={resign} className="w-full py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>}
            {result && !oracleSubmitted && (
              <button onClick={submitToOracle} disabled={oracleLoading} className="w-full py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985]">{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>
            )}
            {oracleSubmitted && !payoutResult && (
              <button onClick={claimPayout} disabled={payoutLoading} className="w-full py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">{payoutLoading ? 'COMPUTING...' : 'CLAIM PAYOUT'}</button>
            )}
            <button onClick={onClose} className="w-full py-2 rounded-xl border border-white/20 text-xs">CLOSE</button>
          </div>
          {oracleError && <div className="mt-2 text-[10px] text-amber-300 text-center">{oracleError}</div>}
        </div>
      </div>

      {/* Mobile actions + previews */}
      <div className="lg:hidden border-t border-white/10 bg-black/60 px-3 py-2 shrink-0">
        <div className="flex gap-2">
          {!result && myColor && status === 'active' && <button onClick={resign} className="flex-1 py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 rounded-2xl bg-[#49EACB] text-black text-sm font-bold" disabled={oracleLoading}>{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 rounded-2xl bg-emerald-500 text-black text-sm font-bold" disabled={payoutLoading}>{payoutLoading ? '...' : 'CLAIM'}</button>}
          <button onClick={onClose} className="px-4 py-2 border border-white/20 rounded-xl text-xs">CLOSE</button>
        </div>
        {oracleError && <div className="mt-1 text-[10px] text-amber-300">{oracleError}</div>}
        {result && !payoutResult && (
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-center">
            <div className="bg-black/40 border border-white/10 rounded p-1">Win<br/><span className="text-emerald-400">{previewWin} KAS</span></div>
            <div className="bg-black/40 border border-white/10 rounded p-1">Plat<br/><span className="text-rose-400">{previewFee} KAS</span></div>
            <div className="bg-black/40 border border-white/10 rounded p-1">Pot<br/><span className="text-kaspa-green">{previewPot} KAS</span></div>
          </div>
        )}
      </div>

      {/* Desktop full payout */}
      {payoutResult && !payoutResult.error && (
        <div className="hidden lg:block max-w-md mx-auto mb-2 p-3 text-sm border border-emerald-500/30 rounded-xl bg-emerald-500/5">
          <div className="text-emerald-400 text-xs mb-1 flex items-center gap-1"><CheckCircle2 size={13}/> PAYOUT COMPUTED</div>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div>Winner <span className="font-bold text-white">{payoutResult.winner_share_kas} KAS</span></div>
            <div>Platform <span className="font-bold text-rose-400">{payoutResult.platform_fee_kas} KAS</span></div>
            <div>Pot Return <span className="font-bold text-kaspa-green">{payoutResult.pot_return_kas} KAS</span></div>
          </div>
          <details className="mt-1"><summary className="text-[9px] text-gray-400">witness</summary><pre className="text-[8px] bg-black/40 p-1 mt-0.5 rounded">{payoutResult.unlock_witness}</pre></details>
        </div>
      )}

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 flex items-center justify-center font-mono shrink-0">
        CONNECT 4 • GRAVITY • 4-IN-ROW • LIVE MULTIPLAYER • ORACLE • {potReturnPercent}% POT RETURN
      </div>
    </div>
  );
}
