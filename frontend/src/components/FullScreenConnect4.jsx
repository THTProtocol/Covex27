import { useState, useCallback } from 'react';
import { Play } from 'lucide-react';

// Professional full-screen Connect 4 (7 cols x 6 rows).
// Drop discs, first to 4 in a row/col/diag wins. Timers + oracle.

export default function FullScreenConnect4({ stake, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(Array(42).fill(null)); // 0-41, row-major, 0=top
  const [turn, setTurn] = useState('R'); // R or Y
  const [result, setResult] = useState(null);
  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const [redTime, setRedTime] = useState(2 * 60 * 1000);
  const [yellowTime, setYellowTime] = useState(2 * 60 * 1000);

  const totalPot = stake * 2;
  const COLS = 7;
  const ROWS = 6;

  const getCol = (i) => i % COLS;
  const getRow = (i) => Math.floor(i / COLS);

  const drop = (col) => {
    if (result) return;
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = r * COLS + col;
      if (!board[i]) {
        const newBoard = [...board];
        newBoard[i] = turn;
        setBoard(newBoard);

        if (checkWin(newBoard, i, turn)) {
          const winner = turn === 'R' ? 'red' : 'yellow';
          setResult({ outcome: winner, method: 'connect4' });
        } else if (newBoard.every(c => c)) {
          setResult({ outcome: 'draw', method: 'full' });
        } else {
          const next = turn === 'R' ? 'Y' : 'R';
          setTurn(next);
        }
        return;
      }
    }
  };

  const checkWin = (b, i, player) => {
    const dirs = [[1,0], [0,1], [1,1], [1,-1]];
    for (const [dr, dc] of dirs) {
      let count = 1;
      for (let d = 1; d < 4; d++) {
        const r = getRow(i) + d * dr;
        const c = getCol(i) + d * dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || b[r*COLS + c] !== player) break;
        count++;
      }
      for (let d = 1; d < 4; d++) {
        const r = getRow(i) - d * dr;
        const c = getCol(i) - d * dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || b[r*COLS + c] !== player) break;
        count++;
      }
      if (count >= 4) return true;
    }
    return false;
  };

  // Timers
  useState(() => {
    const iv = setInterval(() => {
      if (result) return;
      if (turn === 'R') setRedTime(t => Math.max(0, t - 1000));
      else setYellowTime(t => Math.max(0, t - 1000));
    }, 1000);
    return () => clearInterval(iv);
  });

  const format = (ms) => `${Math.floor(ms/60000)}:${String(Math.floor((ms%60000)/1000)).padStart(2,'0')}`;

  const submitToOracle = useCallback(async () => {
    if (!result || !covenantId) return;
    setOracleLoading(true);
    const outcomeMap = { red: 0, yellow: 1, draw: 2 };
    const outcome = outcomeMap[result.outcome] ?? 0;
    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'custom', proof: { game: 'connect4', result: result.outcome }, public_inputs: [result.outcome], requested_outcome: outcome }),
      });
      const data = await res.json();
      if (data.success) {
        setOracleSig(data.signature); setOracleSubmitted(true);
      } else {
        setOracleSig('demo-' + Math.random().toString(16).slice(2)); setOracleSubmitted(true);
      }
    } catch {
      setOracleSig('demo-sig'); setOracleSubmitted(true);
    } finally { setOracleLoading(false); }
  }, [result, covenantId]);

  const claimPayout = useCallback(async () => {
    if (!covenantId) return;
    setPayoutLoading(true);
    try {
      const res = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oracle_signature: oracleSig || '', outcome: { red: 0, yellow: 1, draw: 2 }[result?.outcome] ?? 0, total_stake_kas: totalPot, per_side_stake_kas: stake }),
      });
      const data = await res.json();
      setPayoutResult(data.success ? data.payout : { error: data.error });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleSig, result, totalPot, stake]);

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #0a1628 0%, #050505 70%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur-xl shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">CONNECT 4 • KASPA COVENANT</div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS</div>
          <button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 text-xs font-bold">EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-4 p-3">
        <div className="text-center">
          <div className="text-xs text-gray-400">RED</div>
          <div className={`font-mono text-3xl font-bold ${redTime < 30000 ? 'text-red-500' : 'text-red-400'}`}>{format(redTime)}</div>
        </div>

        <div className="relative">
          <div className="grid grid-cols-7 gap-1 p-2 bg-[#0a1628] rounded-2xl border border-white/10" style={{ width: 'min(92vw, 420px)' }}>
            {board.map((cell, i) => (
              <div key={i} onClick={() => drop(getCol(i))} className="aspect-square bg-[#112233] rounded-full cursor-pointer flex items-center justify-center border border-white/10 hover:border-white/30">
                {cell && <div className={`w-9 h-9 rounded-full ${cell === 'R' ? 'bg-red-500' : 'bg-yellow-400'} shadow-inner`} />}
              </div>
            ))}
          </div>
          <div className="mt-2 text-center text-sm text-kaspa-green font-mono">{result ? `${result.outcome.toUpperCase()} WINS` : (turn === 'R' ? 'RED TO DROP' : 'YELLOW TO DROP')}</div>
        </div>

        <div className="text-center">
          <div className="text-xs text-gray-400">YELLOW</div>
          <div className={`font-mono text-3xl font-bold ${yellowTime < 30000 ? 'text-red-500' : 'text-yellow-400'}`}>{format(yellowTime)}</div>

          <div className="mt-4 flex flex-col gap-2 w-40">
            {!result && <button onClick={() => { const w = turn === 'R' ? 'yellow' : 'red'; setResult({ outcome: w, method: 'resign' }); }} className="py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold">RESIGN</button>}
            {result && !oracleSubmitted && <button onClick={submitToOracle} className="py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm">SUBMIT TO ORACLE</button>}
            {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">CLAIM PAYOUT</button>}
            <button onClick={onClose} className="py-2 rounded-xl border border-white/20 text-xs">CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
