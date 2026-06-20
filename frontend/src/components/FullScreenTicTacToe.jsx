import { useState, useCallback, useMemo } from 'react';
import useGameSync from '../hooks/useGameSync';
import SeatButton, { TrustNote } from './SeatButton';
import InviteLink from './InviteLink';

// Full-screen Tic-Tac-Toe (3x3): persistent two-wallet multiplayer over the
// covenant match record. Seats: player1 = X (moves first), player2 = O.
// Board state is replayed from the server move log ("X4", "O7", ...).

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const checkWin = (b, p) => LINES.some(([a, c, d]) => b[a] === p && b[c] === p && b[d] === p);
// Find the actual winning triple (for the on-board strike line + cell pulse). Visual only.
const findWinningLine = (b) => {
  for (const p of ['X', 'O']) {
    const line = LINES.find(([a, c, d]) => b[a] === p && b[c] === p && b[d] === p);
    if (line) return { line, mark: p };
  }
  return null;
};

// Cell centers on a 0..300 viewBox (3x3 grid, 100px cells). Visual geometry only.
const CELL_CENTERS = [
  [50, 50], [150, 50], [250, 50],
  [50, 150], [150, 150], [250, 150],
  [50, 250], [150, 250], [250, 250],
];

// Inline SVG X (two kaspa-green strokes) and O (kaspa-gold ring) that draw in on place.
function MarkX({ ghost = false }) {
  const stroke = '#49EACB';
  return (
    <svg viewBox="0 0 100 100" className={`w-3/4 h-3/4 ${ghost ? '' : 'anim-pop'}`} style={ghost ? { opacity: 0.25 } : undefined}>
      <g
        fill="none"
        stroke={stroke}
        strokeWidth="11"
        strokeLinecap="round"
        style={ghost ? undefined : { filter: 'drop-shadow(0 0 8px rgba(73,234,203,0.65))' }}
      >
        <line x1="24" y1="24" x2="76" y2="76" style={ghost ? undefined : { strokeDasharray: 74, strokeDashoffset: 74, animation: 'ttt-draw 0.25s ease-out 0.02s forwards' }} />
        <line x1="76" y1="24" x2="24" y2="76" style={ghost ? undefined : { strokeDasharray: 74, strokeDashoffset: 74, animation: 'ttt-draw 0.25s ease-out 0.12s forwards' }} />
      </g>
    </svg>
  );
}

function MarkO({ ghost = false }) {
  const stroke = '#E8AF34';
  return (
    <svg viewBox="0 0 100 100" className={`w-3/4 h-3/4 ${ghost ? '' : 'anim-pop'}`} style={ghost ? { opacity: 0.25 } : undefined}>
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke={stroke}
        strokeWidth="11"
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={ghost ? undefined : { strokeDasharray: 188.5, strokeDashoffset: 188.5, animation: 'ttt-draw 0.25s ease-out forwards', filter: 'drop-shadow(0 0 8px rgba(232,175,52,0.6))' }}
      />
    </svg>
  );
}

const replayBoard = (moves) => {
  const b = Array(9).fill(null);
  for (const m of moves) {
    const mt = typeof m === 'string' && m.match(/^([XO])([0-8])$/);
    if (mt) b[Number(mt[2])] = mt[1];
  }
  return b;
};

export default function FullScreenTicTacToe({ stake = 20, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [localMethod, setLocalMethod] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const onMoves = useCallback((moves) => { setBoard(replayBoard(moves)); }, []);
  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, clocks, walletConnected } =
    useGameSync({ covenantId, gameType: 'tictactoe', stake, onMoves });

  const myLabel = myColor === 'white' ? 'X' : myColor === 'black' ? 'O' : null;
  const turnLabel = game?.current_turn === 'black' ? 'O' : 'X';

  // server state is the source of truth for the result
  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'black' ? 'o' : 'x';
    return { outcome, method: localMethod || 'result' };
  }, [status, game, localMethod]);

  const place = (i) => {
    if (status !== 'active' || !myLabel || board[i] || result) return;
    if (!isMyTurn) { setError('Not your turn.'); return; }
    const newB = [...board];
    newB[i] = myLabel;
    setBoard(newB);
    setError(null);
    const won = checkWin(newB, myLabel);
    const full = newB.every(Boolean);
    if (won) setLocalMethod('line');
    else if (full) setLocalMethod('full');
    submitMove(`${myLabel}${i}`, { finished: won || full, winner: won ? myColor : full ? 'draw' : null });
  };

  // Live mm:ss rendered from the hook's server-authoritative clocks; no local clock state.
  const xTime = clocks?.whiteMs ?? 0;
  const oTime = clocks?.blackMs ?? 0;
  const format = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  // Winning triple for the on-board strike line + cell pulse (presentation only).
  const winInfo = useMemo(() => findWinningLine(board), [board]);
  const winSet = winInfo ? new Set(winInfo.line) : null;
  const xIsTurn = game?.current_turn === 'white';

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve.');
      return;
    }
    setOracleLoading(true); setOracleError(null);
    const om = { x: 0, o: 1, draw: 2 };
    const outv = om[result.outcome] ?? 0;
    try {
      const r = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'tictactoe_v1', proof: { game: 'ttt', res: result.outcome }, public_inputs: [result.outcome], requested_outcome: outv })
      });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); }
      else { setOracleError(d.error || 'Oracle rejected the result.'); }
    } catch (e) { setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.'); }
    finally { setOracleLoading(false); }
  }, [result, covenantId]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { x: 0, o: 1, draw: 2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oracle_signature: oracleResult.signature || oracleSig || '',
          outcome: om[result?.outcome] ?? 0,
          total_stake_kas: totalPot, per_side_stake_kas: stake,
          oracle_message: `ttt:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now() / 1000)
        })
      });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : { error: d.error || 'fail' });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewP = ((totalPot) * feePercent / 100).toFixed(1);
  const previewR = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const moves = Array.isArray(game?.moves) ? game.moves : [];
  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 18%, #1a0f0f 0%, #050505 72%)' }}>
      <style>{`
        @keyframes ttt-draw { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) {
          [style*="ttt-draw"] { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>
      <div className="h-12 sm:h-14 border-b border-white/10 flex items-center justify-between gap-2 px-3 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB] truncate text-[11px] sm:text-sm">
          <span className="sm:hidden">TIC-TAC-TOE</span>
          <span className="hidden sm:inline">TIC-TAC-TOE · KASPA COVENANT</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10 whitespace-nowrap">{totalPot} KAS · {potReturnPercent}% POT</div>
          <button
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 rounded-xl border border-white/20 text-xs font-bold"
            aria-label="Exit tic-tac-toe arena"
          >EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-4 p-3">
        <div className="hidden lg:block text-center w-40">
          <div className="text-[10px] tracking-widest text-gray-400 mb-1">X (FIRST){myLabel === 'X' && ' • YOU'}</div>
          <div className={`rounded-2xl bg-black/50 border border-white/10 px-4 py-3 ${status === 'active' && xIsTurn ? 'clock-active' : ''}`}>
            <div className={`font-mono text-5xl font-bold tabular-nums ${xTime < 30000 ? 'text-red-500' : 'text-white'}`}>{format(xTime)}</div>
          </div>
        </div>

        <div className="relative">
          <div className="lg:hidden flex justify-between items-center w-[min(86vw,380px)] mb-2 text-xs font-mono">
            <span className={`px-2 py-1 rounded-lg bg-black/50 border border-white/10 ${status === 'active' && xIsTurn ? 'clock-active' : ''} ${xTime < 30000 ? 'text-red-500' : ''}`}>X {format(xTime)}</span>
            <span className="text-kaspa-green tracking-wider">{result ? 'OVER' : status === 'active' ? turnLabel + ' TO PLAY' : status.toUpperCase()}</span>
            <span className={`px-2 py-1 rounded-lg bg-black/50 border border-white/10 ${status === 'active' && !xIsTurn ? 'clock-active' : ''} ${oTime < 30000 ? 'text-red-500' : ''}`}>O {format(oTime)}</span>
          </div>

          <div
            className="relative rounded-2xl p-3"
            style={{
              width: 'min(86vw, 380px)',
              background: 'linear-gradient(160deg, rgba(18,22,26,0.95), rgba(6,8,10,0.95))',
              border: '1px solid rgba(73,234,203,0.16)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 18px 60px -18px rgba(73,234,203,0.45), 0 0 80px -30px rgba(73,234,203,0.6)',
            }}
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 38%, #0d141a 0%, #05080a 78%)' }}>
              {/* Neon grid dividers over one glass panel */}
              <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full pointer-events-none">
                <g stroke="rgba(73,234,203,0.3)" strokeWidth="2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px rgba(73,234,203,0.4))' }}>
                  <line x1="100" y1="14" x2="100" y2="286" />
                  <line x1="200" y1="14" x2="200" y2="286" />
                  <line x1="14" y1="100" x2="286" y2="100" />
                  <line x1="14" y1="200" x2="286" y2="200" />
                </g>
                {/* Winning strike line through the 3 winning cells */}
                {winInfo && (() => {
                  const [a, , c] = winInfo.line;
                  const [x1, y1] = CELL_CENTERS[a];
                  const [x2, y2] = CELL_CENTERS[c];
                  return (
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="#49EACB" strokeWidth="7" strokeLinecap="round"
                      style={{ strokeDasharray: 320, strokeDashoffset: 320, animation: 'ttt-draw 0.4s ease-out 0.1s forwards', filter: 'drop-shadow(0 0 10px rgba(73,234,203,0.9))' }}
                    />
                  );
                })()}
              </svg>

              {/* Cells */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {board.map((v, i) => {
                  const isWinCell = winSet?.has(i);
                  const canPlay = status === 'active' && !!myLabel && !v && !result && isMyTurn;
                  return (
                    <div
                      key={i}
                      onClick={() => place(i)}
                      onMouseEnter={() => setHoverCell(i)}
                      onMouseLeave={() => setHoverCell((c) => (c === i ? null : c))}
                      className={`relative flex items-center justify-center rounded-xl transition-colors ${canPlay ? 'cursor-pointer hover:bg-white/[0.035]' : 'cursor-default'} ${isWinCell ? 'animate-pulse' : ''}`}
                      style={isWinCell ? { background: 'rgba(73,234,203,0.12)' } : undefined}
                    >
                      {v === 'X' && <MarkX />}
                      {v === 'O' && <MarkO />}
                      {!v && canPlay && hoverCell === i && (myLabel === 'X' ? <MarkX ghost /> : <MarkO ghost />)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {status !== 'active' && !result && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl px-4">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <>
                  <SeatButton status={status} joining={joining} walletConnected={walletConnected} onJoin={join} stake={stake} seatHint="You play X, which moves first. Your opponent joins as O." />
                  <TrustNote />
                </>
              ) : (
                <>
                  <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS O...</div>
                  <InviteLink stake={stake} />
                </>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[240px] text-center">{error}</div>}
            </div>
          )}

          <div className="text-center mt-1 text-xs font-mono text-kaspa-green">{result ? (result.outcome === 'draw' ? 'DRAW' : `${result.outcome.toUpperCase()} WINS`) : status === 'active' ? (turnLabel + ' TO PLAY') : ''}</div>
          <div className="text-center mt-0.5 text-[10px] font-mono text-gray-500">
            X {seat(game?.player1)}{myColor === 'white' && ' (you)'} · O {seat(game?.player2)}{myColor === 'black' && ' (you)'}
          </div>
          {!myColor && status === 'active' && <div className="text-center text-[10px] text-gray-500 mt-0.5">You are spectating. Moves sync live.</div>}
          {error && status === 'active' && <div className="text-center text-[10px] text-red-300 mt-0.5">{error}</div>}
        </div>

        <div className="hidden lg:block text-center w-40">
          <div className="text-[10px] tracking-widest text-gray-400 mb-1">O{myLabel === 'O' && ' • YOU'}</div>
          <div className={`rounded-2xl bg-black/50 border border-white/10 px-4 py-3 ${status === 'active' && !xIsTurn ? 'clock-active' : ''}`}>
            <div className={`font-mono text-5xl font-bold tabular-nums ${oTime < 30000 ? 'text-red-500' : 'text-white'}`}>{format(oTime)}</div>
          </div>
          <div className="mt-3 text-[10px] font-mono bg-black/50 p-2 rounded border border-white/10">{moves.slice(-4).join(' ')}</div>
          <div className="mt-2 flex flex-col gap-1 text-xs w-32 mx-auto">
            {!result && myColor && status === 'active' && <button onClick={resign} className="py-1.5 rounded bg-red-600/90 text-white">RESIGN</button>}
            {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-2 rounded-2xl bg-[#49EACB] text-black font-bold text-sm">{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>}
            {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-2 rounded-2xl bg-emerald-500 text-black font-bold text-sm">{payoutLoading ? '...' : 'CLAIM PAYOUT'}</button>}
            <button onClick={onClose} className="py-1.5 rounded border border-white/20">CLOSE</button>
          </div>
          {oracleError && <div className="mt-2 text-[10px] text-amber-300 max-w-[140px] mx-auto">{oracleError}</div>}
        </div>
      </div>

      {/* Mobile bar */}
      <div className="lg:hidden px-3 pb-2 border-t border-white/10 bg-black/60">
        <div className="flex gap-2 py-2">
          {!result && myColor && status === 'active' && <button onClick={resign} className="flex-1 py-2 rounded bg-red-600/90 text-xs text-white font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 rounded-2xl bg-[#49EACB] text-black text-sm font-bold" disabled={oracleLoading}>{oracleLoading ? '...' : 'SUBMIT ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 rounded-2xl bg-emerald-500 text-black text-sm font-bold" disabled={payoutLoading}>{payoutLoading ? '...' : 'CLAIM'}</button>}
          <button onClick={onClose} className="px-3 py-2 border border-white/20 rounded text-xs">CLOSE</button>
        </div>
        {oracleError && <div className="text-[10px] text-amber-300 pb-1">{oracleError}</div>}
        {result && !payoutResult && <div className="grid grid-cols-3 gap-2 text-[10px] text-center mb-1">
          <div className="bg-black/40 rounded p-1 border border-white/10">Win {previewW} KAS</div>
          <div className="bg-black/40 rounded p-1 border border-white/10">Fee {previewP} KAS</div>
          <div className="bg-black/40 rounded p-1 border border-white/10">Pot {previewR} KAS</div>
        </div>}
      </div>

      {/* Desktop payout */}
      {payoutResult && !payoutResult.error && (
        <div className="hidden lg:block max-w-sm mx-auto mb-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/30 text-xs">
          <div className="text-emerald-400 mb-1">PAYOUT COMPUTED</div>
          <div className="grid grid-cols-3 gap-2">
            <div>Winner: <span className="font-bold text-white">{payoutResult.winner_share_kas} KAS</span></div>
            <div>Plat: <span className="font-bold text-rose-400">{payoutResult.platform_fee_kas} KAS</span></div>
            <div>Pot: <span className="font-bold text-kaspa-green">{payoutResult.pot_return_kas} KAS</span></div>
          </div>
        </div>
      )}

      <div className="h-auto min-h-[2rem] border-t border-white/10 text-[9px] sm:text-[10px] text-gray-500 flex items-center justify-center text-center font-mono px-3 py-1.5 shrink-0">3×3 · LIVE MULTIPLAYER · OUTCOME CO-SIGNED BY THE DISCLOSED COVEX ORACLE · {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
