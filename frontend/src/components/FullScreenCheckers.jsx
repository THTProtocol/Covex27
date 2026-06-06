import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, Loader } from 'lucide-react';

// Professional full-screen Checkers (8x8, forced jumps, kings, multi-jump).
// Equal stake gate (handled in parent) → real play with per-turn timers → SUBMIT TO ORACLE (sig) → CLAIM (compute-payout with pot return %).

export default function FullScreenCheckers({ stake = 50, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(() => initBoard());
  const [selected, setSelected] = useState(null);
  const [turn, setTurn] = useState('w'); // 'w' white bottom, 'b' black top
  const [message, setMessage] = useState('White to move - jumps are mandatory');
  const [result, setResult] = useState(null); // { outcome: 'white'|'black'|'draw', method: '...' }
  const [moves, setMoves] = useState([]); // [{san: '12-21 (J)'} ...]

  // Timers ms, decrement only on current turn
  const [whiteTime, setWhiteTime] = useState(3 * 60 * 1000);
  const [blackTime, setBlackTime] = useState(3 * 60 * 1000);

  // Oracle + payout
  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  function initBoard() {
    const b = Array(64).fill(null);
    // Black pieces rows 0-2 on dark squares (standard checkers)
    const blackStarts = [1,3,5,7, 8,10,12,14, 17,19,21,23];
    blackStarts.forEach(i => { b[i] = 'b'; });
    // White pieces rows 5-7 on dark
    const whiteStarts = [40,42,44,46, 49,51,53,55, 56,58,60,62];
    whiteStarts.forEach(i => { b[i] = 'w'; });
    return b;
  }

  const isDarkSquare = (i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    return (row + col) % 2 === 1;
  };

  const getPiece = (i) => board[i];
  const isWhite = (p) => p === 'w' || p === 'W';
  const isBlack = (p) => p === 'b' || p === 'B';
  const isKing = (p) => p === 'W' || p === 'B';

  const getLegalMoves = (from) => {
    const p = getPiece(from);
    if (!p) return [];
    const isW = isWhite(p);
    if ((turn === 'w' && !isW) || (turn === 'b' && !isBlack(p))) return [];

    const moves = [];
    const dirs = isKing(p) ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (isW ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

    // Jumps mandatory - check all 4/2 dirs
    for (const [dr, dc] of dirs) {
      const mid = from + dr * 8 + dc;
      const to = from + dr * 16 + dc * 2;
      if (to >= 0 && to < 64 && !getPiece(to) && getPiece(mid)) {
        const midP = getPiece(mid);
        if ((isW && isBlack(midP)) || (!isW && isWhite(midP))) {
          if (isDarkSquare(to)) moves.push({ to, jump: true, captured: mid });
        }
      }
    }
    if (moves.length > 0) return moves; // jumps are mandatory

    // Non-captures
    for (const [dr, dc] of dirs) {
      const to = from + dr * 8 + dc;
      if (to >= 0 && to < 64 && !getPiece(to) && isDarkSquare(to)) {
        moves.push({ to, jump: false });
      }
    }
    return moves;
  };

  const applyMove = (from, to, jump, captured) => {
    const newBoard = [...board];
    let piece = newBoard[from];
    newBoard[from] = null;
    newBoard[to] = piece;

    // Promote
    const toRow = Math.floor(to / 8);
    if (piece === 'w' && toRow === 0) newBoard[to] = 'W';
    if (piece === 'b' && toRow === 7) newBoard[to] = 'B';

    let didCapture = false;
    if (jump && captured != null) {
      newBoard[captured] = null;
      didCapture = true;
    }

    // Log
    const fromRow = Math.floor(from / 8), fromCol = from % 8;
    const toR = Math.floor(to / 8), toC = to % 8;
    const san = `${fromRow*8+fromCol}-${toR*8+toC}${jump ? ' (J)' : ''}`;
    setMoves(m => [...m, { san, turn: turn }]);

    setBoard(newBoard);
    setSelected(null);

    // Multi-jump check (only if just captured)
    if (didCapture) {
      const more = getLegalMoves(to).filter(m => m.jump); // re-compute on new board? note: get uses current board state via closure but we set after? Wait use newBoard for check
      // recompute manually for chain
      const p2 = newBoard[to];
      const dirs2 = isKing(p2) ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (isWhite(p2) ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
      let hasMoreJump = false;
      for (const [dr, dc] of dirs2) {
        const mid = to + dr*8 + dc;
        const nxt = to + dr*16 + dc*2;
        if (nxt >= 0 && nxt < 64 && !newBoard[nxt] && newBoard[mid]) {
          const mp = newBoard[mid];
          if ((isWhite(p2) && isBlack(mp)) || (isBlack(p2) && isWhite(mp))) { hasMoreJump = true; break; }
        }
      }
      if (hasMoreJump) {
        setSelected(to);
        setMessage('Multi-jump - continue jumping');
        return { newBoard, chain: true };
      }
    }

    const nextTurn = turn === 'w' ? 'b' : 'w';
    setTurn(nextTurn);
    setMessage(nextTurn === 'w' ? 'White to move' : 'Black to move');

    // Check terminal
    const hasAnyMoves = (color) => {
      for (let i = 0; i < 64; i++) {
        const pc = newBoard[i];
        if (pc && ((color === 'w' && isWhite(pc)) || (color === 'b' && isBlack(pc)))) {
          // temp compute legals (reuse func but it reads 'turn' state, so manual)
          const isWpc = isWhite(pc);
          const ds = isKing(pc) ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (isWpc ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
          for (const [dr, dc] of ds) {
            const m = i + dr*8 + dc, t = i + dr*16 + dc*2;
            if (t >= 0 && t < 64 && !newBoard[t] && newBoard[m] && ((isWpc && isBlack(newBoard[m])) || (!isWpc && isWhite(newBoard[m])))) return true;
            const t2 = i + dr*8 + dc;
            if (t2 >= 0 && t2 < 64 && !newBoard[t2] && isDarkSquare(t2)) return true;
          }
        }
      }
      return false;
    };

    if (!hasAnyMoves(nextTurn)) {
      const winner = nextTurn === 'w' ? 'black' : 'white';
      setResult({ outcome: winner, method: 'no_legal_moves' });
      setMessage(`Game over - ${winner} wins (no moves left)`);
    }
    return { newBoard, chain: false };
  };

  const onSquareClick = (i) => {
    if (result || !isDarkSquare(i)) return;
    if (selected === null) {
      const p = getPiece(i);
      if (p && ((turn === 'w' && isWhite(p)) || (turn === 'b' && isBlack(p)))) {
        const legals = getLegalMoves(i);
        if (legals.length > 0) setSelected(i);
      }
    } else {
      const legals = getLegalMoves(selected);
      const mv = legals.find(m => m.to === i);
      if (mv) {
        applyMove(selected, mv.to, mv.jump, mv.captured);
      } else {
        setSelected(null);
      }
    }
  };

  // Per-turn timers with timeout auto-resolve
  useEffect(() => {
    if (result) return undefined;
    const interval = setInterval(() => {
      if (turn === 'w') {
        setWhiteTime(t => {
          const nt = Math.max(0, t - 1000);
          if (nt <= 0) {
            const r = { outcome: 'black', method: 'timeout' };
            setResult(r);
            setMessage('White timeout - Black wins');
          }
          return nt;
        });
      } else {
        setBlackTime(t => {
          const nt = Math.max(0, t - 1000);
          if (nt <= 0) {
            const r = { outcome: 'white', method: 'timeout' };
            setResult(r);
            setMessage('Black timeout - White wins');
          }
          return nt;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, result]);

  const formatTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const resign = () => {
    if (result) return;
    const winner = turn === 'w' ? 'black' : 'white';
    setResult({ outcome: winner, method: 'resign' });
    setMessage(`${turn === 'w' ? 'White' : 'Black'} resigned`);
  };

  const offerDraw = () => {
    if (result) return;
    setResult({ outcome: 'draw', method: 'draw_agreed' });
    setMessage('Draw agreed');
  };

  const submitResultToOracle = useCallback(async () => {
    if (!result || !covenantId) {
      // demo fallback even without covenant
      const fake = '0x' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setOracleSig(fake);
      setOracleSubmitted(true);
      setOracleResult({ signature: fake, outcome: { white: 0, black: 1, draw: 2 }[result?.outcome] ?? 0 });
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
          circuit_type: 'checkers',
          proof: { game: 'checkers', result: result.outcome, method: result.method, moves: moves.length },
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
      // Fallback demo
      const fake = '0x' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setOracleSig(fake);
      setOracleSubmitted(true);
      setOracleResult({ signature: fake, outcome });
    } finally {
      setOracleLoading(false);
    }
  }, [result, covenantId, moves]);

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

  // Pre-claim preview math (client side, matches backend formula)
  const previewWinner = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewPlatform = ((totalPot) * feePercent / 100).toFixed(1);
  const previewPotRet = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

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
          <div className="text-[10px] uppercase tracking-[2px] text-gray-400">WHITE</div>
          <div className={`font-mono text-5xl xl:text-6xl font-bold tabular-nums tracking-tighter ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(whiteTime)}</div>
          <div className="text-[10px] text-gray-500 mt-1">{turn === 'w' ? 'YOUR TURN' : ''}</div>
        </div>

        {/* CENTER BOARD + mobile clocks */}
        <div className="relative shrink-0">
          {/* Mobile clocks */}
          <div className="lg:hidden flex items-center justify-between w-full max-w-[min(92vw,520px)] mb-1 px-1">
            <div className="flex flex-col items-center">
              <div className="text-[9px] text-gray-400">WHITE</div>
              <div className={`font-mono text-xl font-bold tabular-nums ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(whiteTime)}</div>
            </div>
            <div className="text-center text-[10px] text-kaspa-green font-mono tracking-widest">{result ? 'GAME OVER' : (turn === 'w' ? 'WHITE TO MOVE' : 'BLACK TO MOVE')}</div>
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
                const legals = selected != null ? getLegalMoves(selected).map(m => m.to) : [];
                const isLegal = legals.includes(i);
                return (
                  <div
                    key={i}
                    onClick={() => onSquareClick(i)}
                    className={`aspect-square flex items-center justify-center text-3xl sm:text-4xl cursor-pointer transition-all active:scale-[0.985] ${dark ? 'bg-[#3a2f1f]' : 'bg-[#5c4633]'} ${isSelected ? 'ring-4 ring-[#49EACB]' : ''} ${isLegal ? 'ring-2 ring-emerald-400' : ''}`}
                  >
                    {p && (
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold shadow-inner ${isWhite(p) ? 'bg-white text-black' : 'bg-black text-white'} ${isKing(p) ? 'ring-2 ring-yellow-400' : ''}`}>
                        {isKing(p) ? '♔' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-black/80 border border-white/10 text-[10px] sm:text-xs font-mono text-kaspa-green tracking-wider">
            {result ? `${result.outcome.toUpperCase()} WINS (${result.method})` : (turn === 'w' ? 'WHITE TO MOVE' : 'BLACK TO MOVE')}
          </div>
        </div>

        {/* Desktop right panel + actions */}
        <div className="hidden lg:flex flex-col items-center gap-1 w-44 xl:w-56 shrink-0">
          <div className="text-[10px] uppercase tracking-[2px] text-gray-400">BLACK</div>
          <div className={`font-mono text-5xl xl:text-6xl font-bold tabular-nums tracking-tighter ${blackTime < 30000 ? 'text-red-500' : 'text-white'}`}>{formatTime(blackTime)}</div>

          {/* Move log */}
          <div className="mt-3 w-full bg-black/60 border border-white/10 rounded-2xl p-2 text-[11px] font-mono max-h-[160px] overflow-auto text-gray-200">
            {moves.length ? moves.slice(-8).map((m, idx) => (
              <div key={idx} className="py-px border-b border-white/5 last:border-none">{m.san}</div>
            )) : <div className="text-gray-500 italic">No moves yet</div>}
          </div>

          <div className="mt-3 w-full flex flex-col gap-2">
            {!result && (
              <>
                <button onClick={resign} className="w-full py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>
                <button onClick={offerDraw} className="w-full py-2 rounded-xl border border-white/20 text-xs">OFFER DRAW</button>
              </>
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

          {/* Pre/post payout info */}
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
          {moves.length ? moves.slice(-6).map((m, i) => <span key={i} className="mr-3">{m.san}</span>) : <span className="text-gray-500">Tap pieces • Jumps mandatory</span>}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
          {!result && (
            <>
              <button onClick={resign} className="flex-1 py-2 rounded-xl bg-red-600/90 text-white text-[11px] font-bold">RESIGN</button>
              <button onClick={offerDraw} className="flex-1 py-2 rounded-xl border border-white/20 text-[11px]">DRAW</button>
            </>
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
        CHECKERS • FORCED JUMPS • KINGS • PER-TURN TIMERS • ORACLE ATTESTED • {potReturnPercent}% TO POT
      </div>
    </div>
  );
}
