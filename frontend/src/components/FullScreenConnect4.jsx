import { useState, useCallback, useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';
import SeatButton, { TrustNote } from './SeatButton';
import InviteLink from './InviteLink';
import GamePotPanel from './GamePotPanel';
import { getCurrentNetwork } from './WalletContext';

// Professional full-screen Connect 4 (7x6): persistent two-wallet multiplayer
// over the covenant match record. Seats: player1 = R (red, drops first),
// player2 = Y. Board state is replayed from the server move log ("R:3", ...).

const COLS = 7;
const ROWS = 6;
const getCol = (i) => i % COLS;
const getRow = (i) => Math.floor(i / COLS);

// Returns the 4 winning cell indices (truthy) when `idx` completes a line for
// `player`, otherwise null (falsy). Win-detection callers use it as a boolean,
// so the truthiness is identical to the previous true/false contract; the
// returned indices are used only for highlighting the winning four.
const checkWin = (b, idx, player) => {
  const r = getRow(idx), c = getCol(idx);
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const line = [idx];
    for (let d = 1; d < 4; d++) {
      const rr = r + d * dr, cc = c + d * dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== player) break;
      line.push(rr * COLS + cc);
    }
    for (let d = 1; d < 4; d++) {
      const rr = r - d * dr, cc = c - d * dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== player) break;
      line.unshift(rr * COLS + cc);
    }
    if (line.length >= 4) return line.slice(0, 4);
  }
  return null;
};

// Scan the whole board for any winning line (display-only highlight helper).
const findWinningLine = (b) => {
  for (let i = 0; i < b.length; i++) {
    if (!b[i]) continue;
    const line = checkWin(b, i, b[i]);
    if (line) return line;
  }
  return null;
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

  // Index of the most recently landed disc, for the drop animation + landed ring.
  const [lastDrop, setLastDrop] = useState(-1);
  // Column the pointer is hovering, for the ghost-disc affordance (pointer only).
  const [hoverCol, setHoverCol] = useState(-1);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const onMoves = useCallback((moves) => {
    const b = replayBoard(moves);
    setBoard(b);
    // Mark the last replayed drop so it animates / rings for remote moves too.
    const lastMove = Array.isArray(moves) && moves.length ? moves[moves.length - 1] : null;
    const mt = typeof lastMove === 'string' && lastMove.match(/^([RY]):([0-6])$/);
    if (mt) {
      const col = Number(mt[2]);
      for (let r = 0; r < ROWS; r++) {
        const i = r * COLS + col;
        if (b[i]) { setLastDrop(i); break; }
      }
    }
  }, []);
  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, clocks, walletConnected, getSeatToken, refresh } =
    useGameSync({ covenantId, gameType: 'connect4', stake, onMoves });

  const myLabel = myColor === 'white' ? 'R' : myColor === 'black' ? 'Y' : null;
  const turnLabel = game?.current_turn === 'black' ? 'Y' : 'R';

  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'black' ? 'yellow' : 'red';
    return { outcome, method: localMethod || 'result' };
  }, [status, game, localMethod]);

  // The four winning cell indices (display-only highlight); empty when no line.
  const winningCells = useMemo(() => {
    if (result && result.outcome !== 'draw') {
      const line = findWinningLine(board);
      if (line) return line;
    }
    return [];
  }, [result, board]);
  const winSet = useMemo(() => new Set(winningCells), [winningCells]);
  const hasWinHighlight = winningCells.length === 4;

  // Topmost open row per column, for the hover ghost disc (null when full).
  const landingRow = useMemo(() => {
    const rows = Array(COLS).fill(null);
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 1; r >= 0; r--) {
        if (!board[r * COLS + c]) { rows[c] = r; break; }
      }
    }
    return rows;
  }, [board]);

  const drop = (col) => {
    if (status !== 'active' || !myLabel || result) return;
    if (!isMyTurn) { setError('Not your turn.'); return; }
    const newB = [...board];
    const landed = dropInto(newB, col, myLabel);
    if (landed < 0) return; // column full
    setBoard(newB);
    setLastDrop(landed);
    setError(null);
    const won = checkWin(newB, landed, myLabel);
    const full = newB.every(Boolean);
    if (won) setLocalMethod('connect4');
    else if (full) setLocalMethod('board_full');
    submitMove(`${myLabel}:${col}`, { finished: won || full, winner: won ? myColor : full ? 'draw' : null });
  };

  // Live countdown clocks come straight from the sync hook (server-authoritative,
  // ms remaining per side). Red is the white seat, Yellow is the black seat.
  const redTime = clocks?.whiteMs ?? 0;
  const yellowTime = clocks?.blackMs ?? 0;

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

  // Premium disc material: vertical color body, sharp top-left specular, a thin
  // 1px inner rim, and a deeper bottom shadow for a moulded plastic feel.
  const discStyle = (label) => ({
    background: label === 'R'
      ? 'radial-gradient(circle at 32% 28%, #ff7a6b 0%, #ef4444 42%, #b91c1c 100%)'
      : 'radial-gradient(circle at 32% 28%, #fde68a 0%, #facc15 44%, #ca8a04 100%)',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.55)',
      label === 'R'
        ? 'inset 0 0 0 1px rgba(255,160,150,0.45)'
        : 'inset 0 0 0 1px rgba(255,235,150,0.5)',
      'inset 0 -6px 10px rgba(0,0,0,0.42)',
      '0 3px 5px rgba(0,0,0,0.55)',
    ].join(','),
  });
  // A crisp specular highlight glint sitting on the disc's top-left.
  const discGlint = (
    <span className="pointer-events-none absolute rounded-full"
      style={{ top: '14%', left: '18%', width: '30%', height: '24%', background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 70%)' }} />
  );

  return (
    <div className="game-fullscreen-bg fixed inset-0 z-[999] flex flex-col">
      <style>{`
        @keyframes c4-drop-fall {
          0%   { transform: translateY(var(--drop-from, -380%)); }
          78%  { transform: translateY(0); }
          88%  { transform: translateY(-7%); }
          100% { transform: translateY(0); }
        }
        .c4-drop { animation: c4-drop-fall 0.4s cubic-bezier(0.45, 0.05, 0.55, 1) both; }
        @keyframes c4-win-glow {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.0), inset 0 -6px 10px rgba(0,0,0,0.42); }
          50%      { transform: scale(1.1); box-shadow: 0 0 16px 5px rgba(255,255,255,0.85), 0 0 28px 8px rgba(73,234,203,0.5), inset 0 -6px 10px rgba(0,0,0,0.42); }
        }
        .c4-win-pulse { animation: c4-win-glow 1.05s ease-in-out infinite; z-index: 1; }
        @keyframes c4-ring-flash {
          0%   { opacity: 0.95; transform: scale(0.92); }
          100% { opacity: 0;    transform: scale(1.28); }
        }
        .c4-land-ring {
          border: 2px solid rgba(73,234,203,0.95);
          box-shadow: 0 0 10px rgba(73,234,203,0.6);
          animation: c4-ring-flash 0.55s ease-out 1 forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .c4-drop, .c4-win-pulse, .c4-land-ring { animation: none; }
          .c4-win-pulse { transform: scale(1.06); box-shadow: 0 0 14px 4px rgba(255,255,255,0.8), inset 0 -6px 10px rgba(0,0,0,0.42); }
          .c4-land-ring { opacity: 0; }
        }
      `}</style>
      <div className="h-12 sm:h-14 border-b border-white/10 light:border-slate-300/70 flex items-center justify-between gap-2 px-3 sm:px-4 text-xs sm:text-sm bg-black/60 light:bg-white/80 backdrop-blur-xl shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB] light:text-[#0d9488] truncate text-[11px] sm:text-sm">
          <span className="sm:hidden">CONNECT 4</span>
          <span className="hidden sm:inline">CONNECT 4 · KASPA COVENANT</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block px-2 py-0.5 rounded bg-white/5 light:bg-slate-900/5 text-[10px] font-mono border border-white/10 light:border-slate-300 whitespace-nowrap">{totalPot} KAS POT · {potReturnPercent}% RETURN</div>
          <button
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 rounded-xl border border-white/20 light:border-slate-400 hover:bg-white/5 light:hover:bg-slate-900/5 text-xs font-bold"
            aria-label="Exit connect 4 arena"
          >EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-3 p-2 overflow-auto">
        {/* Left desktop red clock */}
        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400 light:text-slate-600 tracking-widest">RED{myLabel === 'R' && ' • YOU'}</div>
          <div className={`font-mono text-5xl font-bold tabular-nums px-3 py-1 ${turnLabel === 'R' && status === 'active' && !result ? 'clock-active' : ''} ${redTime < 30000 ? 'text-red-500' : 'text-red-400'}`}>{formatTime(redTime)}</div>
          <div className="mt-1 text-[10px] font-mono text-gray-500 light:text-slate-500">{seat(game?.player1)}</div>
        </div>

        {/* Board */}
        <div className="relative">
          {/* mobile clocks row */}
          <div className="lg:hidden flex justify-between items-center max-w-[min(94vw,420px)] mb-1 text-xs">
            <div className={`font-mono tabular-nums px-1.5 ${turnLabel === 'R' && status === 'active' && !result ? 'clock-active' : ''} ${redTime < 30000 ? 'text-red-500' : 'text-red-400'}`}>{formatTime(redTime)} RED</div>
            <div className="text-kaspa-green font-mono text-[10px] tracking-widest">{result ? 'OVER' : status === 'active' ? (turnLabel === 'R' ? 'RED DROP' : 'YELLOW DROP') : status.toUpperCase()}</div>
            <div className={`font-mono tabular-nums px-1.5 ${turnLabel === 'Y' && status === 'active' && !result ? 'clock-active' : ''} ${yellowTime < 30000 ? 'text-red-500' : 'text-yellow-400'}`}>YEL {formatTime(yellowTime)}</div>
          </div>

          {/* Premium board: deep vertical gradient, top-light/bottom-dark bevel, contact shadow */}
          <div
            className="relative grid grid-cols-7 gap-1.5 p-2.5 rounded-[20px]"
            style={{
              width: 'min(94vw, 420px)',
              background: 'linear-gradient(180deg, #2563eb 0%, #1e3a8a 100%)',
              boxShadow: [
                'inset 0 2px 2px rgba(255,255,255,0.28)',
                'inset 0 -10px 22px rgba(0,0,0,0.5)',
                'inset 0 0 0 1px rgba(255,255,255,0.08)',
                '0 22px 46px -14px rgba(0,0,0,0.7)',
                '0 8px 18px -6px rgba(29,78,216,0.5)',
              ].join(','),
            }}
          >
            {/* contact shadow under the board for grounding */}
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-3 w-[86%] h-5 rounded-[50%]"
              style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 72%)' }} aria-hidden="true" />
            {board.map((cell, i) => {
              const col = getCol(i);
              const row = getRow(i);
              const colPlayable = status === 'active' && !!myLabel && !result && isMyTurn && landingRow[col] !== null;
              const isHoverCol = hoverCol === col && colPlayable;
              const isGhost = isHoverCol && landingRow[col] === row;
              const isWinCell = winSet.has(i);
              const dimmed = hasWinHighlight && !isWinCell && !!cell;
              // Gravity fall distance scales with the landed row (top rows fall further).
              const dropVar = { '--drop-from': `-${(row + 1) * 118}%` };
              return (
                <div
                  key={i}
                  onClick={() => drop(col)}
                  onMouseEnter={() => setHoverCol(col)}
                  onMouseLeave={() => setHoverCol((c) => (c === col ? -1 : c))}
                  className={`relative aspect-square rounded-full flex items-center justify-center transition-colors ${colPlayable ? 'cursor-pointer' : ''} ${isHoverCol ? 'bg-[#13235a]' : 'bg-[#0b1530]'}`}
                  style={{ boxShadow: 'inset 0 4px 9px rgba(0,0,0,0.78), inset 0 -1px 0 rgba(255,255,255,0.05)' }}
                >
                  {/* hover ghost disc (current player's color) in the next landing slot */}
                  {isGhost && !cell && (
                    <div className="absolute w-[82%] h-[82%] rounded-full opacity-30"
                      style={{ background: myLabel === 'R' ? 'radial-gradient(circle at 32% 28%, #ff8a7a, #ef4444)' : 'radial-gradient(circle at 32% 28%, #fde68a, #facc15)' }} aria-hidden="true" />
                  )}
                  {cell && (
                    <div
                      className={`relative w-[82%] h-[82%] rounded-full ${i === lastDrop && !hasWinHighlight ? 'c4-drop' : ''} ${isWinCell ? 'c4-win-pulse' : ''}`}
                      style={{ ...discStyle(cell), ...(i === lastDrop && !hasWinHighlight ? dropVar : {}), opacity: dimmed ? 0.32 : 1, transition: 'opacity 0.4s ease' }}
                    >
                      {discGlint}
                      {/* brief ring around the just-landed disc */}
                      {i === lastDrop && !hasWinHighlight && (
                        <span className="pointer-events-none absolute -inset-[3px] rounded-full c4-land-ring" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* column numbers 1-7 */}
          <div className="grid grid-cols-7 gap-1.5 px-2.5 mt-1 select-none" style={{ width: 'min(94vw, 420px)' }} aria-hidden="true">
            {Array.from({ length: COLS }).map((_, c) => (
              <div key={c} className={`text-center text-[10px] font-mono ${hoverCol === c ? 'text-[#49EACB] light:text-[#0d9488]' : 'text-blue-300/45 light:text-blue-700/55'}`}>{c + 1}</div>
            ))}
          </div>

          {status !== 'active' && !result && (
            <div className="game-join-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-sm rounded-2xl px-4">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <>
                  <SeatButton status={status} joining={joining} walletConnected={walletConnected} onJoin={join} stake={stake} seatHint="You drop red, which moves first. Your opponent joins as yellow." />
                  <TrustNote />
                </>
              ) : (
                <>
                  <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS YELLOW...</div>
                  <InviteLink stake={stake} />
                </>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
            </div>
          )}

          <div className="text-center mt-1.5 text-xs font-mono text-kaspa-green tracking-wider">{result ? (result.outcome === 'draw' ? 'DRAW' : `${result.outcome.toUpperCase()} WINS`) : status === 'active' ? (turnLabel === 'R' ? 'RED TO DROP' : 'YELLOW TO DROP') : ''}</div>
          {!myColor && status === 'active' && <div className="text-center text-[10px] text-gray-500 light:text-slate-500 mt-0.5">You are spectating. Drops sync live.</div>}
          {error && status === 'active' && <div className="text-center text-[10px] text-red-300 mt-0.5">{error}</div>}
        </div>

        {/* Right desktop + controls */}
        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400 light:text-slate-600 tracking-widest">YELLOW{myLabel === 'Y' && ' • YOU'}</div>
          <div className={`font-mono text-5xl font-bold tabular-nums px-3 py-1 ${turnLabel === 'Y' && status === 'active' && !result ? 'clock-active' : ''} ${yellowTime < 30000 ? 'text-red-500' : 'text-yellow-400'}`}>{formatTime(yellowTime)}</div>
          <div className="mt-1 text-[10px] font-mono text-gray-500 light:text-slate-500">{seat(game?.player2)}</div>

          {/* Real, non-custodial winner-takes-all pot. Renders only when actionable. */}
          <div className="mt-3 w-full">
            <GamePotPanel covenantId={covenantId} gameType="connect4" game={game} seatToken={getSeatToken ? getSeatToken() : ''} network={getCurrentNetwork()} onChange={refresh} />
          </div>

          <div className="mt-3 w-full text-[10px] font-mono bg-black/50 light:bg-white light:border-slate-200 light:shadow-sm light:text-slate-700 border border-white/10 rounded-xl p-2 max-h-[120px] overflow-auto">
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
            <button onClick={onClose} className="w-full py-2 rounded-xl border border-white/20 light:border-slate-400 light:text-slate-700 light:hover:bg-slate-900/5 text-xs">CLOSE</button>
          </div>
          {oracleError && <div className="mt-2 text-[10px] text-amber-300 light:text-amber-600 text-center">{oracleError}</div>}
        </div>
      </div>

      {/* Mobile actions + previews */}
      <div className="lg:hidden border-t border-white/10 light:border-slate-300/70 bg-black/60 light:bg-white/80 px-3 py-2 shrink-0">
        <div className="flex gap-2">
          {!result && myColor && status === 'active' && <button onClick={resign} className="flex-1 py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 rounded-2xl bg-[#49EACB] text-black text-sm font-bold" disabled={oracleLoading}>{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 rounded-2xl bg-emerald-500 text-black text-sm font-bold" disabled={payoutLoading}>{payoutLoading ? '...' : 'CLAIM'}</button>}
          <button onClick={onClose} className="px-4 py-2 border border-white/20 light:border-slate-400 light:text-slate-700 light:hover:bg-slate-900/5 rounded-xl text-xs">CLOSE</button>
        </div>
        {oracleError && <div className="mt-1 text-[10px] text-amber-300 light:text-amber-600">{oracleError}</div>}
        {result && !payoutResult && (
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-center">
            <div className="bg-black/40 border border-white/10 light:bg-white light:border-slate-200 light:shadow-sm light:text-slate-600 rounded p-1">Win<br/><span className="text-emerald-400 light:text-emerald-700">{previewWin} KAS</span></div>
            <div className="bg-black/40 border border-white/10 light:bg-white light:border-slate-200 light:shadow-sm light:text-slate-600 rounded p-1">Plat<br/><span className="text-rose-400 light:text-rose-600">{previewFee} KAS</span></div>
            <div className="bg-black/40 border border-white/10 light:bg-white light:border-slate-200 light:shadow-sm light:text-slate-600 rounded p-1">Pot<br/><span className="text-kaspa-green light:text-[#0d9488]">{previewPot} KAS</span></div>
          </div>
        )}
      </div>

      {/* Desktop full payout */}
      {payoutResult && !payoutResult.error && (
        <div className="hidden lg:block max-w-md mx-auto mb-2 p-3 text-sm border border-emerald-500/30 rounded-xl bg-emerald-500/5 light:bg-white light:border-emerald-300 light:shadow-sm">
          <div className="text-emerald-400 light:text-emerald-700 text-xs mb-1 flex items-center gap-1"><CheckCircle2 size={13}/> PAYOUT COMPUTED</div>
          <div className="grid grid-cols-3 gap-2 text-xs text-center light:text-slate-600">
            <div>Winner <span className="font-bold text-white light:text-slate-900">{payoutResult.winner_share_kas} KAS</span></div>
            <div>Platform <span className="font-bold text-rose-400 light:text-rose-600">{payoutResult.platform_fee_kas} KAS</span></div>
            <div>Pot Return <span className="font-bold text-kaspa-green light:text-[#0d9488]">{payoutResult.pot_return_kas} KAS</span></div>
          </div>
          <details className="mt-1"><summary className="text-[9px] text-gray-400 light:text-slate-500">witness</summary><pre className="text-[8px] bg-black/40 light:bg-slate-900/5 light:text-slate-700 p-1 mt-0.5 rounded">{payoutResult.unlock_witness}</pre></details>
        </div>
      )}

      <div className="h-auto min-h-[2rem] border-t border-white/10 light:border-slate-300/70 text-[9px] sm:text-[10px] text-gray-500 light:text-slate-600 flex items-center justify-center font-mono shrink-0 px-3 py-1.5 text-center">
        GRAVITY · 4-IN-A-ROW · OUTCOME CO-SIGNED BY THE DISCLOSED COVEX ORACLE · {potReturnPercent}% POT RETURN
      </div>
    </div>
  );
}
