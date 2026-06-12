import { useState, useCallback, useEffect, useMemo } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';

// Professional full-screen Checkers (8x8, forced jumps, kings, multi-jump):
// persistent two-wallet multiplayer over the covenant match record.
// Seats: player1 = white pieces (moves first), player2 = black pieces.
// A full turn (including a multi-jump chain) is ONE server move string,
// e.g. "44-37" or "17-35-53"; board state is replayed from the move log.

function initBoard() {
  const b = Array(64).fill(null);
  const blackStarts = [1, 3, 5, 7, 8, 10, 12, 14, 17, 19, 21, 23];
  blackStarts.forEach((i) => { b[i] = 'b'; });
  const whiteStarts = [40, 42, 44, 46, 49, 51, 53, 55, 56, 58, 60, 62];
  whiteStarts.forEach((i) => { b[i] = 'w'; });
  return b;
}

const isDarkSquare = (i) => ((Math.floor(i / 8) + (i % 8)) % 2) === 1;
const isWhitePc = (p) => p === 'w' || p === 'W';
const isBlackPc = (p) => p === 'b' || p === 'B';
const isKing = (p) => p === 'W' || p === 'B';
const dirsFor = (p) => (isKing(p) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (isWhitePc(p) ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]));

// legal moves for the piece at `from` on `bd`, given whose turn it is ('w'|'b')
function legalMovesFor(bd, from, side) {
  const p = bd[from];
  if (!p) return [];
  if ((side === 'w' && !isWhitePc(p)) || (side === 'b' && !isBlackPc(p))) return [];
  const out = [];
  for (const [dr, dc] of dirsFor(p)) {
    const r = Math.floor(from / 8), c = from % 8;
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
      const mid = mr * 8 + mc, to = tr * 8 + tc;
      if (!bd[to] && bd[mid] && (isWhitePc(p) ? isBlackPc(bd[mid]) : isWhitePc(bd[mid])) && isDarkSquare(to)) {
        out.push({ to, jump: true, captured: mid });
      }
    }
  }
  if (out.length > 0) return out; // jumps are mandatory
  for (const [dr, dc] of dirsFor(p)) {
    const r = Math.floor(from / 8), c = from % 8;
    const tr = r + dr, tc = c + dc;
    if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
      const to = tr * 8 + tc;
      if (!bd[to] && isDarkSquare(to)) out.push({ to, jump: false });
    }
  }
  return out;
}

// apply one leg (move or jump) in place; promotes on the back rank
function applyLeg(bd, from, to) {
  let piece = bd[from];
  bd[from] = null;
  if (Math.abs(Math.floor(to / 8) - Math.floor(from / 8)) === 2) {
    bd[(from + to) / 2] = null; // diagonal midpoint is the captured square
  }
  const toRow = Math.floor(to / 8);
  if (piece === 'w' && toRow === 0) piece = 'W';
  if (piece === 'b' && toRow === 7) piece = 'B';
  bd[to] = piece;
}

function sideHasAnyMoves(bd, side) {
  for (let i = 0; i < 64; i++) {
    if (bd[i] && legalMovesFor(bd, i, side).length > 0) return true;
  }
  return false;
}

// rebuild board + side-to-move from the server move log
function replayState(moves) {
  const bd = initBoard();
  let side = 'w';
  for (const m of moves) {
    if (typeof m !== 'string' || m === 'resign' || m === 'pass') { side = side === 'w' ? 'b' : 'w'; continue; }
    const squares = m.replace(/\s*\(J\)$/, '').split('-').map(Number);
    if (squares.length >= 2 && squares.every((n) => Number.isInteger(n) && n >= 0 && n < 64)) {
      for (let k = 0; k + 1 < squares.length; k++) applyLeg(bd, squares[k], squares[k + 1]);
    }
    side = side === 'w' ? 'b' : 'w';
  }
  return { bd, side };
}

export default function FullScreenCheckers({ stake = 50, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(() => initBoard());
  const [selected, setSelected] = useState(null);
  const [chain, setChain] = useState(null); // in-progress multi-jump: [sq0, sq1, ...]
  const [localMethod, setLocalMethod] = useState(null);

  const [whiteTime, setWhiteTime] = useState(3 * 60 * 1000);
  const [blackTime, setBlackTime] = useState(3 * 60 * 1000);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const onMoves = useCallback((moves) => {
    const { bd } = replayState(moves);
    setBoard(bd);
    setSelected(null);
    setChain(null);
  }, []);

  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign } =
    useGameSync({ covenantId, gameType: 'checkers', stake, onMoves });

  // player1 (server white) plays the white pieces; pieces map 1:1 here
  const mySide = myColor === 'white' ? 'w' : myColor === 'black' ? 'b' : null;
  const turnSide = game?.current_turn === 'black' ? 'b' : 'w';

  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'black' ? 'black' : 'white';
    return { outcome, method: localMethod || 'result' };
  }, [status, game, localMethod]);

  const finalizeTurn = (bd, squares) => {
    const opponent = mySide === 'w' ? 'b' : 'w';
    const oppCanMove = sideHasAnyMoves(bd, opponent);
    const finished = !oppCanMove;
    const winner = finished ? myColor : null;
    if (finished) setLocalMethod('no_legal_moves');
    setSelected(null);
    setChain(null);
    submitMove(squares.join('-'), { finished, winner });
  };

  const onSquareClick = (i) => {
    if (result || !isDarkSquare(i) || status !== 'active' || !mySide) return;
    if (!isMyTurn) { setError('Not your turn.'); return; }

    // mid multi-jump: only continuation jumps from the chain head are allowed
    if (chain) {
      const head = chain[chain.length - 1];
      const conts = legalMovesFor(board, head, mySide).filter((m) => m.jump);
      const mv = conts.find((m) => m.to === i);
      if (!mv) return;
      const newB = [...board];
      applyLeg(newB, head, mv.to);
      setBoard(newB);
      const more = legalMovesFor(newB, mv.to, mySide).filter((m) => m.jump);
      const newChain = [...chain, mv.to];
      if (more.length > 0) { setChain(newChain); setSelected(mv.to); }
      else finalizeTurn(newB, newChain);
      return;
    }

    if (selected === null) {
      if (board[i] && legalMovesFor(board, i, mySide).length > 0) setSelected(i);
      return;
    }

    const legals = legalMovesFor(board, selected, mySide);
    const mv = legals.find((m) => m.to === i);
    if (!mv) { setSelected(null); return; }

    const newB = [...board];
    applyLeg(newB, selected, mv.to);
    setBoard(newB);
    setError(null);
    if (mv.jump) {
      const more = legalMovesFor(newB, mv.to, mySide).filter((m) => m.jump);
      if (more.length > 0) { setChain([selected, mv.to]); setSelected(mv.to); return; }
    }
    finalizeTurn(newB, [selected, mv.to]);
  };

  // display clocks tick for the side to move (advisory; server enforces turns, not time)
  useEffect(() => {
    if (status !== 'active') return undefined;
    const interval = setInterval(() => {
      if (game?.current_turn === 'white') setWhiteTime((t) => Math.max(0, t - 1000));
      else setBlackTime((t) => Math.max(0, t - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, game]);

  const formatTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const submitResultToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve. Create a checkers covenant to play for real stakes.');
      return;
    }
    setOracleLoading(true);
    setOracleError(null);

    const outcomeMap = { white: 0, black: 1, draw: 2 };
    const outcome = outcomeMap[result.outcome] ?? 0;

    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          covenant_id: covenantId,
          circuit_type: 'checkers_v1',
          proof: { game: 'checkers', result: result.outcome, method: result.method, moves: (game?.moves || []).length },
          public_inputs: [String(result.outcome), result.method],
          requested_outcome: outcome,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOracleSig(data.signature);
        setOracleSubmitted(true);
        setOracleResult(data);
      } else {
        setOracleError(data.error || 'Oracle error');
      }
    } catch (e) {
      setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.');
    } finally {
      setOracleLoading(false);
    }
  }, [result, covenantId, game]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    try {
      const outcomeMap = { white: 0, black: 1, draw: 2 };
      const res = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oracle_signature: oracleResult.signature || oracleSig || '',
          outcome: outcomeMap[result?.outcome] ?? 0,
          total_stake_kas: totalPot,
          per_side_stake_kas: stake,
          oracle_message: oracleResult.message || `checkers:${result?.outcome}:${result?.method}`,
          oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now() / 1000),
        }),
      });
      const data = await res.json();
      setPayoutResult(data.success ? data.payout : { error: data.error || 'Payout failed' });
    } catch (err) {
      setPayoutResult({ error: err.message });
    } finally {
      setPayoutLoading(false);
    }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewWinner = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewPlatform = ((totalPot) * feePercent / 100).toFixed(1);
  const previewPotRet = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const moves = Array.isArray(game?.moves) ? game.moves : [];
  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');
  const statusLine = result
    ? `${result.outcome.toUpperCase()} WINS (${result.method})`
    : chain
      ? 'MULTI-JUMP - CONTINUE JUMPING'
      : status === 'active'
        ? (turnSide === 'w' ? 'WHITE TO MOVE' : 'BLACK TO MOVE')
        : status.toUpperCase();

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #0a0f0d 0%, #050505 70%)' }}>
      {/* Top bar */}
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur-xl shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">CHECKERS • KASPA COVENANT</div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS POT • {potReturnPercent}% POT RETURN</div>
          <button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 hover:bg-white/5 text-xs font-bold">EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-3 p-2 sm:p-4 overflow-auto">
        {/* Desktop left: White clock */}
        <div className="hidden lg:flex flex-col items-center gap-1 w-44 shrink-0">
          <div className="text-[10px] uppercase tracking-[2px] text-gray-400">WHITE{mySide === 'w' && ' • YOU'}</div>
          <div className={`font-mono text-5xl xl:text-6xl font-bold tabular-nums tracking-tighter ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(whiteTime)}</div>
          <div className="text-[10px] font-mono text-gray-500">{seat(game?.player1)}</div>
          <div className="text-[10px] text-gray-500 mt-1">{status === 'active' && turnSide === 'w' ? 'TO MOVE' : ''}</div>
        </div>

        {/* CENTER BOARD + mobile clocks */}
        <div className="relative shrink-0">
          {/* Mobile clocks */}
          <div className="lg:hidden flex items-center justify-between w-full max-w-[min(92vw,520px)] mb-1 px-1">
            <div className="flex flex-col items-center">
              <div className="text-[9px] text-gray-400">WHITE</div>
              <div className={`font-mono text-xl font-bold tabular-nums ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(whiteTime)}</div>
            </div>
            <div className="text-center text-[10px] text-kaspa-green font-mono tracking-widest">{result ? 'GAME OVER' : statusLine}</div>
            <div className="flex flex-col items-center">
              <div className="text-[9px] text-gray-400">BLACK</div>
              <div className={`font-mono text-xl font-bold tabular-nums ${blackTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(blackTime)}</div>
            </div>
          </div>

          <div className="rounded-2xl p-2 bg-[#111] shadow-2xl border border-white/10" style={{ boxShadow: '0 25px 80px -15px rgba(0,0,0,0.8)' }}>
            <div className="grid grid-cols-8 gap-0.5 bg-[#222] p-1 rounded-xl" style={{ width: 'min(92vw, 520px)', aspectRatio: '1' }}>
              {board.map((p, i) => {
                const row = Math.floor(i / 8);
                const col = i % 8;
                const dark = (row + col) % 2 === 1;
                const isSelected = selected === i;
                const origin = chain ? chain[chain.length - 1] : selected;
                const legals = origin != null && mySide && isMyTurn
                  ? legalMovesFor(board, origin, mySide).filter((m) => !chain || m.jump).map((m) => m.to)
                  : [];
                const isLegal = legals.includes(i);
                return (
                  <div
                    key={i}
                    onClick={() => onSquareClick(i)}
                    className={`aspect-square flex items-center justify-center text-3xl sm:text-4xl cursor-pointer transition-all active:scale-[0.985] ${dark ? 'bg-[#7a4a2b]' : 'bg-[#e8c99b]'} ${isSelected ? 'ring-4 ring-[#49EACB]' : ''} ${isLegal ? 'ring-2 ring-emerald-400' : ''}`}
                  >
                    {p && (
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold shadow-inner ${isWhitePc(p) ? 'bg-gradient-to-br from-[#fafafa] to-[#cfcfcf] text-amber-600 ring-1 ring-black/20' : 'bg-gradient-to-br from-[#3a3a3a] to-[#0c0c0c] text-amber-400 ring-1 ring-white/15'} ${isKing(p) ? 'ring-2 ring-yellow-400' : ''}`}>
                        {isKing(p) ? '♛' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {status !== 'active' && !result && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <button onClick={join} disabled={joining}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2">
                  <Users size={16} /> {joining ? 'JOINING...' : status === 'none' ? 'CREATE MATCH (WHITE)' : 'JOIN AS BLACK'}
                </button>
              ) : (
                <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS BLACK...</div>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
            </div>
          )}

          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-black/80 border border-white/10 text-[10px] sm:text-xs font-mono text-kaspa-green tracking-wider">
            {statusLine}
          </div>
        </div>

        {/* Desktop right panel + actions */}
        <div className="hidden lg:flex flex-col items-center gap-1 w-44 xl:w-56 shrink-0">
          <div className="text-[10px] uppercase tracking-[2px] text-gray-400">BLACK{mySide === 'b' && ' • YOU'}</div>
          <div className={`font-mono text-5xl xl:text-6xl font-bold tabular-nums tracking-tighter ${blackTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(blackTime)}</div>
          <div className="text-[10px] font-mono text-gray-500">{seat(game?.player2)}</div>

          {/* Move log */}
          <div className="mt-3 w-full bg-black/60 border border-white/10 rounded-2xl p-2 text-[11px] font-mono max-h-[160px] overflow-auto text-gray-200">
            {moves.length ? moves.slice(-8).map((m, idx) => (
              <div key={idx} className="py-px border-b border-white/5 last:border-none">{m}</div>
            )) : <div className="text-gray-500 italic">No moves yet</div>}
          </div>

          <div className="mt-3 w-full flex flex-col gap-2">
            {!result && myColor && status === 'active' && (
              <button onClick={resign} className="w-full py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>
            )}
            {result && !oracleSubmitted && (
              <button onClick={submitResultToOracle} disabled={oracleLoading} className="w-full py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985]">
                {oracleLoading ? 'SUBMITTING...' : 'SUBMIT RESULT TO ORACLE'}
              </button>
            )}
            {oracleSubmitted && !payoutResult && (
              <button onClick={claimPayout} disabled={payoutLoading} className="w-full py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">
                {payoutLoading ? 'COMPUTING PAYOUT...' : 'CLAIM PAYOUT'}
              </button>
            )}
            <button onClick={onClose} className="w-full py-2 rounded-xl border border-white/20 text-xs">CLOSE ARENA</button>
          </div>

          {!myColor && status === 'active' && <div className="text-[10px] text-gray-500 mt-1">You are spectating. Moves sync live.</div>}
          {error && status === 'active' && <div className="text-[10px] text-red-300 mt-1">{error}</div>}
          {oracleError && <div className="text-[10px] text-amber-300 mt-1 text-center">{oracleError}</div>}

          {result && !payoutResult && (
            <div className="mt-2 text-[10px] w-full text-center text-gray-300">
              {oracleSubmitted ? 'Signature ready - claim to compute shares' : 'Game finished - submit for oracle sig'}
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom sheet: log + actions + payout */}
      <div className="lg:hidden border-t border-white/10 bg-black/70 backdrop-blur-xl shrink-0" style={{ maxHeight: '38vh' }}>
        <div className="px-3 py-2 text-[11px] font-mono text-gray-200 overflow-auto" style={{ maxHeight: '14vh' }}>
          {moves.length ? moves.slice(-6).map((m, i) => <span key={i} className="mr-3">{m}</span>) : <span className="text-gray-500">Tap pieces • Jumps mandatory</span>}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
          {!result && myColor && status === 'active' && (
            <button onClick={resign} className="flex-1 py-2 rounded-xl bg-red-600/90 text-white text-[11px] font-bold">RESIGN</button>
          )}
          {result && !oracleSubmitted && (
            <button onClick={submitResultToOracle} disabled={oracleLoading} className="flex-1 py-2.5 rounded-2xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985]">
              {oracleLoading ? 'SUBMITTING...' : 'SUBMIT TO ORACLE'}
            </button>
          )}
          {oracleSubmitted && !payoutResult && (
            <button onClick={claimPayout} disabled={payoutLoading} className="flex-1 py-2.5 rounded-2xl bg-emerald-500 text-black font-black text-sm">
              {payoutLoading ? 'COMPUTING...' : 'CLAIM PAYOUT'}
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/20 text-xs">CLOSE</button>
        </div>
        {oracleError && <div className="px-3 pb-1 text-[10px] text-amber-300">{oracleError}</div>}

        {/* Mobile payout previews */}
        {result && !payoutResult && (
          <div className="px-3 pb-2">
            <div className="text-[10px] text-emerald-400 font-mono mb-1">PREVIEW (FEE {feePercent}% • POT RETURN {potReturnPercent}%)</div>
            <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
              <div className="p-1.5 rounded bg-black/40 border border-white/10">Winner<br /><span className="text-emerald-400 font-bold">{previewWinner} KAS</span></div>
              <div className="p-1.5 rounded bg-black/40 border border-white/10">Platform<br /><span className="text-rose-400 font-bold">{previewPlatform} KAS</span></div>
              <div className="p-1.5 rounded bg-black/40 border border-white/10">Pot Return<br /><span className="text-kaspa-green font-bold">{previewPotRet} KAS</span></div>
            </div>
          </div>
        )}
        {payoutResult && !payoutResult.error && (
          <div className="px-3 pb-2 text-[10px]">
            <div className="text-emerald-400 font-bold mb-1">PAYOUT COMPUTED</div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>Winner: <span className="font-bold text-white">{payoutResult.winner_share_kas} KAS</span></div>
              <div>Platform: <span className="font-bold text-rose-400">{payoutResult.platform_fee_kas} KAS</span></div>
              <div>Pot: <span className="font-bold text-kaspa-green">{payoutResult.pot_return_kas} KAS</span></div>
            </div>
            <details className="mt-1"><summary className="text-[9px] text-gray-400 cursor-pointer">witness</summary><pre className="text-[8px] bg-black/50 p-1 rounded overflow-x-auto">{payoutResult.unlock_witness}</pre></details>
          </div>
        )}
      </div>

      {/* Desktop payout breakdown area (below center) */}
      <div className="hidden lg:block px-4 pb-2">
        {result && !payoutResult && (
          <div className="max-w-md mx-auto text-center">
            <div className="text-[10px] text-emerald-400 mb-1">PREVIEW USING {feePercent}% FEE + {potReturnPercent}% POT RETURN</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-black/40 border border-white/10">Winner: <span className="font-bold text-emerald-400">{previewWinner} KAS</span></div>
              <div className="p-2 rounded bg-black/40 border border-white/10">Platform: <span className="font-bold text-rose-400">{previewPlatform} KAS</span></div>
              <div className="p-2 rounded bg-black/40 border border-white/10">Pot Return: <span className="font-bold text-kaspa-green">{previewPotRet} KAS</span></div>
            </div>
          </div>
        )}
        {payoutResult && !payoutResult.error && (
          <div className="max-w-lg mx-auto mt-1 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30 text-sm">
            <div className="flex items-center gap-2 text-emerald-400 mb-1 text-xs"><CheckCircle2 size={14} /> PAYOUT COMPUTED - ORACLE SIG VERIFIED</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-black/40 border border-white/10">
                <div className="text-gray-400">Platform ({payoutResult.fee_percent || feePercent}%)</div>
                <div className="font-bold text-rose-400 tabular-nums">{payoutResult.platform_fee_kas} KAS</div>
              </div>
              <div className="p-2 rounded bg-black/40 border border-white/10">
                <div className="text-gray-400">{payoutResult.winner_label || 'Winner'}</div>
                <div className="font-bold text-emerald-400 tabular-nums">{payoutResult.winner_share_kas} KAS</div>
              </div>
              <div className="p-2 rounded bg-black/40 border border-white/10">
                <div className="text-gray-400">Pot Return ({payoutResult.pot_return_percent || potReturnPercent}%)</div>
                <div className="font-bold text-[#49EACB] tabular-nums">{payoutResult.pot_return_kas} KAS</div>
              </div>
            </div>
            <details className="mt-2 text-[10px]">
              <summary className="cursor-pointer text-gray-400">Copy unlock witness for on-chain claim</summary>
              <pre className="mt-1 p-2 rounded bg-black/60 text-[9px] text-gray-300 overflow-auto">{payoutResult.unlock_witness}</pre>
            </details>
          </div>
        )}
        {payoutResult && payoutResult.error && (
          <div className="text-amber-400 text-xs text-center">Payout error: {payoutResult.error}</div>
        )}
      </div>

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 flex items-center justify-center font-mono shrink-0">
        CHECKERS • FORCED JUMPS • KINGS • LIVE MULTIPLAYER • ORACLE ATTESTED • {potReturnPercent}% TO POT
      </div>
    </div>
  );
}
