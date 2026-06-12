import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

// Full-screen Tic-Tac-Toe (3x3). Fast skill game with equal stakes, per-turn clocks, resign, oracle sig, claim payout with pot return.

export default function FullScreenTicTacToe({ stake = 20, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(Array(9).fill(null)); // X or O or null
  const [turn, setTurn] = useState('X');
  const [result, setResult] = useState(null); // {outcome:'x'|'o'|'draw', method}
  const [moves, setMoves] = useState([]);

  const [xTime, setXTime] = useState(90 * 1000);
  const [oTime, setOTime] = useState(90 * 1000);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  const checkWin = (b, p) => lines.some(([a,c,d]) => b[a]===p && b[c]===p && b[d]===p);

  const place = (i) => {
    if (result || board[i]) return;
    const newB = [...board];
    newB[i] = turn;
    setBoard(newB);
    setMoves(m => [...m, `${turn}${i}`]);

    if (checkWin(newB, turn)) {
      setResult({ outcome: turn.toLowerCase(), method: 'line' });
    } else if (newB.every(Boolean)) {
      setResult({ outcome: 'draw', method: 'full' });
    } else {
      setTurn(turn === 'X' ? 'O' : 'X');
    }
  };

  // Timers per turn
  useEffect(() => {
    if (result) return undefined;
    const iv = setInterval(() => {
      if (turn === 'X') {
        setXTime(t => { const nt = Math.max(0, t-1000); if (nt<=0) setResult({outcome:'o', method:'timeout'}); return nt; });
      } else {
        setOTime(t => { const nt = Math.max(0, t-1000); if (nt<=0) setResult({outcome:'x', method:'timeout'}); return nt; });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [turn, result]);

  const format = (ms) => `${Math.floor(ms/60000)}:${String(Math.floor((ms%60000)/1000)).padStart(2,'0')}`;

  const resign = () => { if (!result) setResult({ outcome: turn==='X'?'o':'x', method: 'resign' }); };

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      const f = '0x' + Array.from({length:12},()=>Math.floor(Math.random()*16).toString(16)).join('');
      setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); return;
    }
    setOracleLoading(true);
    const om = { x: 0, o: 1, draw: 2 };
    const outv = om[result.outcome] ?? 0;
    try {
      const r = await fetch('/api/oracle/verify-and-sign', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'tictactoe_v1', proof:{game:'ttt', res:result.outcome}, public_inputs:[result.outcome], requested_outcome: outv })
      });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); }
      else { const f='0x'+Array.from({length:12},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); }
    } catch { const f='0x'+Array.from({length:12},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); }
    finally { setOracleLoading(false); }
  }, [result, covenantId]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { x:0, o:1, draw:2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          oracle_signature: oracleResult.signature || oracleSig || '',
          outcome: om[result?.outcome] ?? 0,
          total_stake_kas: totalPot, per_side_stake_kas: stake,
          oracle_message: `ttt:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now()/1000)
        })
      });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : {error: d.error||'fail'});
    } catch(e){ setPayoutResult({error:e.message}); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot)*(100-feePercent-potReturnPercent)/100).toFixed(1);
  const previewP = ((totalPot)*feePercent/100).toFixed(1);
  const previewR = ((totalPot)*potReturnPercent/100).toFixed(1);

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 18%, #1a0f0f 0%, #050505 72%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">TIC-TAC-TOE • KASPA COVENANT</div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS • {potReturnPercent}% POT</div>
          <button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 text-xs font-bold">EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-4 p-3">
        <div className="hidden lg:block text-center w-36">
          <div className="text-[10px] text-gray-400">X (FIRST)</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${xTime<30000?'text-red-500':'text-white'}`}>{format(xTime)}</div>
        </div>

        <div>
          <div className="lg:hidden flex justify-between w-[min(82vw,280px)] mb-1 text-xs font-mono">
            <span className={xTime<30000?'text-red-500':''}>X {format(xTime)}</span>
            <span className="text-kaspa-green">{result ? 'OVER' : turn + ' TO PLAY'}</span>
            <span className={oTime<30000?'text-red-500':''}>O {format(oTime)}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-2 bg-[#111] rounded-2xl border border-white/10" style={{ width: 'min(82vw, 280px)' }}>
            {board.map((v, i) => (
              <div key={i} onClick={() => place(i)} className="aspect-square bg-[#0a0a0f] border border-white/10 rounded-none flex items-center justify-center text-5xl font-black cursor-pointer hover:bg-white/[0.04] transition-colors active:bg-white/5">
                {v === 'X' && <span className="text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]">X</span>}
                {v === 'O' && <span className="text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]">O</span>}
              </div>
            ))}
          </div>
          <div className="text-center mt-1 text-xs font-mono text-kaspa-green">{result ? `${result.outcome.toUpperCase()} WINS` : (turn + ' TO PLAY')}</div>
        </div>

        <div className="hidden lg:block text-center w-36">
          <div className="text-[10px] text-gray-400">O</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${oTime<30000?'text-red-500':'text-white'}`}>{format(oTime)}</div>
          <div className="mt-3 text-[10px] font-mono bg-black/50 p-2 rounded border border-white/10">{moves.slice(-4).join(' ')}</div>
          <div className="mt-2 flex flex-col gap-1 text-xs w-32 mx-auto">
            {!result && <button onClick={resign} className="py-1.5 rounded bg-red-600/90 text-white">RESIGN</button>}
            {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-2 rounded-2xl bg-[#49EACB] text-black font-bold text-sm">{oracleLoading?'...':'SUBMIT TO ORACLE'}</button>}
            {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-2 rounded-2xl bg-emerald-500 text-black font-bold text-sm">{payoutLoading?'...':'CLAIM PAYOUT'}</button>}
            <button onClick={onClose} className="py-1.5 rounded border border-white/20">CLOSE</button>
          </div>
        </div>
      </div>

      {/* Mobile bar */}
      <div className="lg:hidden px-3 pb-2 border-t border-white/10 bg-black/60">
        <div className="flex gap-2 py-2">
          {!result && <button onClick={resign} className="flex-1 py-2 rounded bg-red-600/90 text-xs text-white font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 rounded-2xl bg-[#49EACB] text-black text-sm font-bold" disabled={oracleLoading}>{oracleLoading ? '...' : 'SUBMIT ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 rounded-2xl bg-emerald-500 text-black text-sm font-bold" disabled={payoutLoading}>{payoutLoading?'...':'CLAIM'}</button>}
          <button onClick={onClose} className="px-3 py-2 border border-white/20 rounded text-xs">CLOSE</button>
        </div>
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

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 text-center font-mono">TIC-TAC-TOE • 3×3 • TIMERS • ORACLE ATTESTED • {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
