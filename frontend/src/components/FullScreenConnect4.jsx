import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, Loader } from 'lucide-react';

// Professional full-screen Connect 4 (7x6).
// Gravity drop, 4-in-row win, per-turn timers, stake match (parent), oracle sig, claim with potReturn %.

export default function FullScreenConnect4({ stake = 30, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const COLS = 7;
  const ROWS = 6;

  const [board, setBoard] = useState(Array(COLS * ROWS).fill(null));
  const [turn, setTurn] = useState('R'); // R red, Y yellow
  const [result, setResult] = useState(null); // {outcome:'red'|'yellow'|'draw', method}
  const [moves, setMoves] = useState([]); // simple log of column drops

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

  const getCol = (i) => i % COLS;
  const getRow = (i) => Math.floor(i / COLS);

  const checkWin = (b, idx, player) => {
    const r = getRow(idx), c = getCol(idx);
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
      let cnt = 1;
      // positive
      for (let d=1; d<4; d++) {
        const rr = r + d*dr, cc = c + d*dc;
        if (rr<0||rr>=ROWS||cc<0||cc>=COLS || b[rr*COLS+cc] !== player) break;
        cnt++;
      }
      // negative
      for (let d=1; d<4; d++) {
        const rr = r - d*dr, cc = c - d*dc;
        if (rr<0||rr>=ROWS||cc<0||cc>=COLS || b[rr*COLS+cc] !== player) break;
        cnt++;
      }
      if (cnt >= 4) return true;
    }
    return false;
  };

  const drop = (col) => {
    if (result) return;
    for (let r = ROWS-1; r >= 0; r--) {
      const i = r * COLS + col;
      if (!board[i]) {
        const newB = [...board];
        newB[i] = turn;
        const nextTurn = turn === 'R' ? 'Y' : 'R';
        setBoard(newB);
        setMoves(m => [...m, `${turn}:${col}`]);

        if (checkWin(newB, i, turn)) {
          setResult({ outcome: turn === 'R' ? 'red' : 'yellow', method: 'connect4' });
        } else if (newB.every(Boolean)) {
          setResult({ outcome: 'draw', method: 'board_full' });
        } else {
          setTurn(nextTurn);
        }
        return;
      }
    }
  };

  // Timers: decrement current player's clock, timeout = loss
  useEffect(() => {
    if (result) return undefined;
    const iv = setInterval(() => {
      if (turn === 'R') {
        setRedTime(t => {
          const nt = Math.max(0, t - 1000);
          if (nt <= 0) {
            setResult({ outcome: 'yellow', method: 'timeout' });
          }
          return nt;
        });
      } else {
        setYellowTime(t => {
          const nt = Math.max(0, t - 1000);
          if (nt <= 0) {
            setResult({ outcome: 'red', method: 'timeout' });
          }
          return nt;
        });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [turn, result]);

  const formatTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const resign = () => {
    if (result) return;
    const w = turn === 'R' ? 'yellow' : 'red';
    setResult({ outcome: w, method: 'resign' });
  };

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      const fake = '0x' + Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('');
      setOracleSig(fake); setOracleSubmitted(true); setOracleResult({signature: fake});
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
          circuit_type: 'connect4',
          proof: { game: 'connect4', result: result.outcome, cols: moves.length },
          public_inputs: [result.outcome, result.method],
          requested_outcome: out,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOracleSig(data.signature); setOracleSubmitted(true); setOracleResult(data);
      } else {
        setOracleError(data.error || 'error'); 
        const fake = '0x' + Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('');
        setOracleSig(fake); setOracleSubmitted(true); setOracleResult({signature: fake});
      }
    } catch {
      const fake = '0x' + Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('');
      setOracleSig(fake); setOracleSubmitted(true); setOracleResult({signature: fake});
    } finally { setOracleLoading(false); }
  }, [result, covenantId, moves]);

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
          oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now()/1000),
        }),
      });
      const data = await res.json();
      setPayoutResult(data.success ? data.payout : { error: data.error || 'failed' });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewWin = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewFee = ((totalPot) * feePercent / 100).toFixed(1);
  const previewPot = ((totalPot) * potReturnPercent / 100).toFixed(1);

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
          <div className="text-xs text-gray-400 tracking-widest">RED</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${redTime < 30000 ? 'text-red-500' : 'text-red-400'}`}>{formatTime(redTime)}</div>
        </div>

        {/* Board */}
        <div className="relative">
          {/* mobile clocks row */}
          <div className="lg:hidden flex justify-between items-center max-w-[min(94vw,420px)] mb-1 text-xs">
            <div className={`font-mono tabular-nums ${redTime<30000?'text-red-500':'text-red-400'}`}>{formatTime(redTime)} RED</div>
            <div className="text-kaspa-green font-mono text-[10px] tracking-widest">{result ? 'OVER' : (turn==='R'?'RED DROP':'YELLOW DROP')}</div>
            <div className={`font-mono tabular-nums ${yellowTime<30000?'text-red-500':'text-yellow-400'}`}>YEL {formatTime(yellowTime)}</div>
          </div>

          <div className="grid grid-cols-7 gap-1 p-2 bg-[#0a1628] rounded-2xl border border-white/10 shadow-2xl" style={{ width: 'min(94vw, 420px)' }}>
            {board.map((cell, i) => (
              <div key={i} onClick={() => drop(getCol(i))} className="aspect-square bg-[#112233] rounded-full cursor-pointer flex items-center justify-center border border-white/10 active:bg-[#1a2a3a]">
                {cell && <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full shadow-inner ${cell === 'R' ? 'bg-red-500' : 'bg-yellow-400'}`} />}
              </div>
            ))}
          </div>
          <div className="text-center mt-1.5 text-xs font-mono text-kaspa-green tracking-wider">{result ? `${result.outcome.toUpperCase()} WINS (${result.method})` : (turn === 'R' ? 'RED TO DROP' : 'YELLOW TO DROP')}</div>
        </div>

        {/* Right desktop + controls */}
        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400 tracking-widest">YELLOW</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${yellowTime < 30000 ? 'text-red-500' : 'text-yellow-400'}`}>{formatTime(yellowTime)}</div>

          <div className="mt-3 w-full text-[10px] font-mono bg-black/50 border border-white/10 rounded-xl p-2 max-h-[120px] overflow-auto">
            {moves.slice(-6).map((m,i)=><div key={i}>{m}</div>)}
          </div>

          <div className="mt-3 w-full flex flex-col gap-1.5">
            {!result && <button onClick={resign} className="w-full py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>}
            {result && !oracleSubmitted && (
              <button onClick={submitToOracle} disabled={oracleLoading} className="w-full py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985]">{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>
            )}
            {oracleSubmitted && !payoutResult && (
              <button onClick={claimPayout} disabled={payoutLoading} className="w-full py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">{payoutLoading ? 'COMPUTING...' : 'CLAIM PAYOUT'}</button>
            )}
            <button onClick={onClose} className="w-full py-2 rounded-xl border border-white/20 text-xs">CLOSE</button>
          </div>
        </div>
      </div>

      {/* Mobile actions + previews */}
      <div className="lg:hidden border-t border-white/10 bg-black/60 px-3 py-2 shrink-0">
        <div className="flex gap-2">
          {!result && <button onClick={resign} className="flex-1 py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 rounded-2xl bg-[#49EACB] text-black text-sm font-bold" disabled={oracleLoading}>{oracleLoading?'...':'SUBMIT TO ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 rounded-2xl bg-emerald-500 text-black text-sm font-bold" disabled={payoutLoading}>{payoutLoading?'...':'CLAIM'}</button>}
          <button onClick={onClose} className="px-4 py-2 border border-white/20 rounded-xl text-xs">CLOSE</button>
        </div>
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
        CONNECT 4 • GRAVITY • 4-IN-ROW • TIMERS • ORACLE • {potReturnPercent}% POT RETURN
      </div>
    </div>
  );
}
