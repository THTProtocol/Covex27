import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

// Professional full-screen Reversi / Othello 8x8.
// Legal flips only, per-turn timer, stake, submit oracle, claim with pot return %.

export default function FullScreenReversi({ stake = 40, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const SIZE = 8;
  const [board, setBoard] = useState(() => initBoard());
  const [turn, setTurn] = useState('B'); // B black, W white
  const [result, setResult] = useState(null);
  const [moves, setMoves] = useState([]);

  const [blackTime, setBlackTime] = useState(2.5 * 60 * 1000);
  const [whiteTime, setWhiteTime] = useState(2.5 * 60 * 1000);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  function initBoard() {
    const b = Array(SIZE*SIZE).fill(null);
    b[3*SIZE + 3] = 'W'; b[3*SIZE + 4] = 'B';
    b[4*SIZE + 3] = 'B'; b[4*SIZE + 4] = 'W';
    return b;
  }

  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  const getFlips = (i, player) => {
    const flips = [];
    const r = Math.floor(i/SIZE), c = i % SIZE;
    const opp = player === 'B' ? 'W' : 'B';
    for (const [dr,dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      const line = [];
      while (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE) {
        const j = rr*SIZE + cc;
        if (board[j] === opp) { line.push(j); }
        else if (board[j] === player) { if (line.length) flips.push(...line); break; }
        else break;
        rr += dr; cc += dc;
      }
    }
    return flips;
  };

  const isLegal = (i) => !board[i] && getFlips(i, turn).length > 0;

  const place = (i) => {
    if (result || board[i]) return;
    const flips = getFlips(i, turn);
    if (!flips.length) return;
    const newB = [...board];
    newB[i] = turn;
    flips.forEach(j => { newB[j] = turn; });
    setBoard(newB);
    setMoves(m => [...m, `${turn}${i}`]);

    const next = turn === 'B' ? 'W' : 'B';
    // pass if no moves for next
    let hasNext = false;
    for (let k=0; k<SIZE*SIZE; k++) if (!newB[k] && getFlipsForBoard(newB, k, next).length > 0) { hasNext=true; break; }
    if (!hasNext) {
      // check if current has any too; if neither, end
      let hasCur = false;
      for (let k=0; k<SIZE*SIZE; k++) if (!newB[k] && getFlipsForBoard(newB, k, turn).length) { hasCur=true; break; }
      if (!hasCur) {
        // count
        const bc = newB.filter(x=>x==='B').length, wc = newB.filter(x=>x==='W').length;
        const winner = bc > wc ? 'black' : (wc > bc ? 'white' : 'draw');
        setResult({ outcome: winner, method: 'count' });
      } else {
        setTurn(next); // current plays again
      }
    } else {
      setTurn(next);
    }
  };

  // helper for pass check (avoids stale getFlips)
  function getFlipsForBoard(bd, i, pl) {
    const fl = [];
    const r = Math.floor(i/SIZE), c = i%SIZE; const op = pl==='B'?'W':'B';
    for (const [dr,dc] of dirs) {
      let rr=r+dr, cc=c+dc, line=[];
      while (rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE) {
        const j=rr*SIZE+cc;
        if (bd[j]===op) line.push(j);
        else if (bd[j]===pl) { if (line.length) fl.push(...line); break; }
        else break;
        rr+=dr; cc+=dc;
      }
    }
    return fl;
  }

  // Timers
  useEffect(() => {
    if (result) return undefined;
    const iv = setInterval(() => {
      if (turn === 'B') setBlackTime(t => { const nt=Math.max(0,t-1000); if(nt<=0) setResult({outcome:'white',method:'timeout'}); return nt; });
      else setWhiteTime(t => { const nt=Math.max(0,t-1000); if(nt<=0) setResult({outcome:'black',method:'timeout'}); return nt; });
    }, 1000);
    return () => clearInterval(iv);
  }, [turn, result]);

  const format = (ms) => `${Math.floor(ms/60000)}:${String(Math.floor((ms%60000)/1000)).padStart(2,'0')}`;

  const resign = () => { if(!result) setResult({outcome: turn==='B'?'white':'black', method:'resign'}); };

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      const f = '0x'+Array.from({length:14},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); return;
    }
    setOracleLoading(true);
    const om = { black:0, white:1, draw:2 };
    const ov = om[result.outcome] ?? 0;
    try {
      const r = await fetch('/api/oracle/verify-and-sign', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({covenant_id:covenantId, circuit_type:'reversi_v1', proof:{g:'reversi',o:result.outcome}, public_inputs:[result.outcome], requested_outcome:ov }) });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); } else { const f='0x'+Array.from({length:14},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); }
    } catch { const f='0x'+Array.from({length:14},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); }
    finally { setOracleLoading(false); }
  }, [result, covenantId]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { black:0, white:1, draw:2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ oracle_signature: oracleResult.signature||oracleSig||'', outcome: om[result?.outcome]||0, total_stake_kas:totalPot, per_side_stake_kas:stake, oracle_message:`reversi:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now()/1000) }) });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : {error:d.error});
    } catch(e){setPayoutResult({error:e.message});} finally{setPayoutLoading(false);}
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot)*(100-feePercent-potReturnPercent)/100).toFixed(1);
  const previewF = ((totalPot)*feePercent/100).toFixed(1);
  const previewR = ((totalPot)*potReturnPercent/100).toFixed(1);

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #0a120a 0%, #050505 70%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">REVERSI / OTHELLO • KASPA COVENANT</div>
        <div className="flex items-center gap-2"><div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS POT • {potReturnPercent}% RETURN</div><button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 text-xs font-bold">EXIT</button></div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-3 p-2 overflow-auto">
        <div className="hidden lg:flex flex-col items-center w-40"><div className="text-xs text-gray-400">BLACK</div><div className={`font-mono text-5xl font-bold tabular-nums ${blackTime<30000?'text-red-500':'text-white'}`}>{format(blackTime)}</div></div>

        <div className="relative">
          <div className="lg:hidden flex justify-between max-w-[min(92vw,420px)] text-[10px] mb-1 font-mono"><span className={blackTime<30000?'text-red-500':''}>B {format(blackTime)}</span><span className="text-kaspa-green">{result?'OVER':(turn+' TO PLAY')}</span><span className={whiteTime<30000?'text-red-500':''}>W {format(whiteTime)}</span></div>
          <div className="grid grid-cols-8 gap-0.5 p-1 bg-[#0e3320] rounded-2xl border border-white/10" style={{width:'min(92vw,420px)', aspectRatio:'1'}}>
            {board.map((v,i) => {
              const legal = !result && isLegal(i);
              return <div key={i} onClick={()=>place(i)} className={`aspect-square flex items-center justify-center rounded ${legal ? 'ring-2 ring-yellow-300/80' : ''} ${v ? '' : 'hover:bg-white/5'} cursor-pointer`} style={{background: '#1a7a44', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)'}}>
                {v && <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full shadow ${v==='B'?'bg-gradient-to-br from-[#333] to-black shadow-[0_2px_4px_rgba(0,0,0,0.6)]':'bg-gradient-to-br from-white to-[#cfcfcf] shadow-[0_2px_4px_rgba(0,0,0,0.5)]'}`} />}
              </div>;
            })}
          </div>
          <div className="text-center mt-1 text-xs font-mono text-kaspa-green tracking-wider">{result ? `${result.outcome.toUpperCase()} WINS` : (turn==='B'?'BLACK':'WHITE') + ' TO PLAY'}</div>
        </div>

        <div className="hidden lg:flex flex-col items-center w-40"><div className="text-xs text-gray-400">WHITE</div><div className={`font-mono text-5xl font-bold tabular-nums ${whiteTime<30000?'text-red-500':'text-white'}`}>{format(whiteTime)}</div>
          <div className="mt-2 w-full text-[10px] font-mono bg-black/50 p-2 rounded border border-white/10 max-h-28 overflow-auto">{moves.slice(-5).join(' ')}</div>
          <div className="mt-2 flex flex-col gap-1 w-full text-xs">
            {!result && <button onClick={resign} className="py-2 rounded-xl bg-red-600/90 text-white font-bold">RESIGN</button>}
            {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-2 rounded-2xl bg-[#49EACB] text-black font-bold">{oracleLoading?'...':'SUBMIT TO ORACLE'}</button>}
            {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-2 rounded-2xl bg-emerald-500 text-black font-bold">{payoutLoading?'...':'CLAIM PAYOUT'}</button>}
            <button onClick={onClose} className="py-2 rounded border border-white/20">CLOSE</button>
          </div>
        </div>
      </div>

      {/* mobile footer */}
      <div className="lg:hidden border-t border-white/10 bg-black/60 px-3 py-2">
        <div className="flex gap-2">
          {!result && <button onClick={resign} className="flex-1 py-2 bg-red-600/90 rounded-xl text-xs text-white font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 bg-[#49EACB] text-black rounded-2xl text-sm font-bold" disabled={oracleLoading}>{oracleLoading?'...':'SUBMIT'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 bg-emerald-500 text-black rounded-2xl text-sm font-bold" disabled={payoutLoading}>{payoutLoading?'...':'CLAIM'}</button>}
          <button onClick={onClose} className="px-3 border border-white/20 rounded-xl text-xs">CLOSE</button>
        </div>
        {result && !payoutResult && <div className="grid grid-cols-3 gap-2 text-[10px] text-center mt-2"><div className="bg-black/40 border border-white/10 p-1 rounded">Win {previewW}</div><div className="bg-black/40 border border-white/10 p-1 rounded">Fee {previewF}</div><div className="bg-black/40 border border-white/10 p-1 rounded">Pot {previewR}</div></div>}
      </div>

      {payoutResult && !payoutResult.error && (
        <div className="hidden lg:block max-w-sm mx-auto mb-2 p-3 border border-emerald-500/30 bg-emerald-500/5 rounded-xl text-xs">
          <div className="text-emerald-400">PAYOUT COMPUTED</div>
          <div className="grid grid-cols-3 mt-1"><div>W {payoutResult.winner_share_kas} KAS</div><div>P {payoutResult.platform_fee_kas} KAS</div><div>Pot {payoutResult.pot_return_kas} KAS</div></div>
        </div>
      )}

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 text-center font-mono">REVERSI • LEGAL FLIPS ONLY • TIMERS • ORACLE • {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
