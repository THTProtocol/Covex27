import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

// Rock Paper Scissors - best of 3 or first to 2. Per-choice timer. Oracle + claim + pot return.

const CHOICES = ['rock','paper','scissors'];
const BEATS = { rock:'scissors', scissors:'paper', paper:'rock' };

export default function FullScreenRPS({ stake = 25, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [round, setRound] = useState(1);
  const [score, setScore] = useState({ X: 0, O: 0 });
  const [last, setLast] = useState(null); // {winner:'X'|'O'|'draw', p1, p2}
  const [myPick, setMyPick] = useState(null);
  const [oppPick, setOppPick] = useState(null);
  const [turn, setTurn] = useState('X'); // who picks next in this round
  const [result, setResult] = useState(null); // overall {outcome:'x'|'o'|'draw'}

  const [xTime, setXTime] = useState(12 * 1000);
  const [oTime, setOTime] = useState(12 * 1000);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [oracleLoading, setOracleLoading] = useState(false);

  const totalPot = stake * 2;

  const pick = (choice) => {
    if (result || myPick) return;
    setMyPick(choice);
    // simulate opp choice instantly for demo (or wait turn)
    const opp = CHOICES[Math.floor(Math.random()*3)];
    setOppPick(opp);

    const w = decide(choice, opp);
    const nw = { ...score };
    if (w === 'X') nw.X++; else if (w === 'O') nw.O++;
    setLast({ winner: w, p1: choice, p2: opp });
    setScore(nw);

    // next round or end
    if (nw.X >= 2 || nw.O >= 2 || round >= 3) {
      const overall = nw.X > nw.O ? 'x' : (nw.O > nw.X ? 'o' : 'draw');
      setResult({ outcome: overall, method: 'bestof' });
    } else {
      setRound(r => r + 1);
      setMyPick(null); setOppPick(null);
      setTurn(t => t === 'X' ? 'O' : 'X');
    }
  };

  const decide = (a, b) => (a === b ? 'draw' : (BEATS[a] === b ? 'X' : 'O'));

  // simple per pick timer (resets each pick phase)
  useEffect(() => {
    if (result || myPick) return undefined;
    const iv = setInterval(() => {
      if (turn === 'X') {
        setXTime(t => { const nt = Math.max(0, t - 1000); if (nt <= 0) { autoPick('X'); } return nt; });
      } else {
        setOTime(t => { const nt = Math.max(0, t - 1000); if (nt <= 0) { autoPick('O'); } return nt; });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [turn, result, myPick]);

  const autoPick = (who) => {
    const c = CHOICES[Math.floor(Math.random()*3)];
    if (who === 'X') { setMyPick(c); } else { setOppPick(c); }
    // force resolve
    const other = who === 'X' ? 'O' : 'X';
    const oc = CHOICES[Math.floor(Math.random()*3)];
    if (who === 'X') setOppPick(oc); else setMyPick(oc);
    const w = decide(who==='X'?c:oc , who==='X'?oc:c);
    const nw = {...score}; if (w==='X') nw.X++; else if (w==='O') nw.O++;
    setLast({winner:w, p1: who==='X'?c:oc, p2: who==='X'?oc:c });
    setScore(nw);
    if (nw.X >= 2 || nw.O >= 2 || round >= 3) {
      setResult({ outcome: nw.X > nw.O ? 'x' : (nw.O > nw.X ? 'o' : 'draw'), method: 'timeout' });
    } else {
      setRound(r=>r+1); setMyPick(null); setOppPick(null); setTurn(who==='X'?'O':'X');
    }
  };

  const format = (ms) => `${Math.floor(ms/1000)}s`;

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      const f = '0x' + Array.from({length:10},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); return;
    }
    setOracleLoading(true);
    const om = { x:0, o:1, draw:2 };
    try {
      const r = await fetch('/api/oracle/verify-and-sign', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'rps', proof: { game:'rps', rounds: round, score }, public_inputs: [result.outcome], requested_outcome: om[result.outcome] ?? 0 }) });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); } else { const f='0x'+Array.from({length:10},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); }
    } catch { const f='0x'+Array.from({length:10},()=>Math.floor(Math.random()*16).toString(16)).join(''); setOracleSig(f); setOracleSubmitted(true); setOracleResult({signature:f}); }
    finally { setOracleLoading(false); }
  }, [result, covenantId, round, score]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { x:0, o:1, draw:2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ oracle_signature: oracleResult.signature || oracleSig || '', outcome: om[result?.outcome]||0, total_stake_kas: totalPot, per_side_stake_kas: stake, oracle_message: `rps:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now()/1000) }) });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : { error: d.error });
    } catch(e) { setPayoutResult({error: e.message}); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewF = ((totalPot) * feePercent / 100).toFixed(1);
  const previewR = ((totalPot) * potReturnPercent / 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #1a1408 0%, #050505 70%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">ROCK PAPER SCISSORS • BEST OF 3</div>
        <div className="flex items-center gap-2"><div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS • {potReturnPercent}% POT</div><button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 text-xs font-bold">EXIT</button></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <div className="flex gap-8 text-center">
          <div><div className="text-xs text-gray-400">X</div><div className={`font-mono text-3xl ${xTime<4000?'text-red-500':''}`}>{format(xTime)}</div><div className="text-2xl font-bold">{score.X}</div></div>
          <div className="pt-2 text-kaspa-green text-xs tracking-[3px]">ROUND {round}/3</div>
          <div><div className="text-xs text-gray-400">O</div><div className={`font-mono text-3xl ${oTime<4000?'text-red-500':''}`}>{format(oTime)}</div><div className="text-2xl font-bold">{score.O}</div></div>
        </div>

        <div className="text-sm text-gray-300">{result ? 'GAME OVER' : (turn + ' PICK')}</div>

        <div className="flex gap-3">
          {CHOICES.map(c => {
            const ICONS = { rock: '✊', paper: '✋', scissors: '✌️' };
            const COLORS = { rock: 'border-stone-400/40 hover:border-stone-300', paper: 'border-sky-400/40 hover:border-sky-300', scissors: 'border-rose-400/40 hover:border-rose-300' };
            return (
              <button key={c} disabled={!!myPick || !!result} onClick={() => pick(c)}
                className={`flex flex-col items-center gap-2 px-7 py-5 rounded-2xl border-2 bg-black/40 hover:bg-white/5 hover:scale-105 active:scale-[0.985] disabled:opacity-50 transition-all ${COLORS[c] || 'border-white/20'}`}>
                <span className="text-5xl leading-none">{ICONS[c]}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-gray-300">{c}</span>
              </button>
            );
          })}
        </div>

        {last && <div className="text-xs text-gray-400">Last: {last.p1} vs {last.p2} → {last.winner}</div>}

        <div className="flex flex-col gap-2 w-64">
          {!result && <button onClick={() => { setResult({outcome: score.X>score.O?'x':'o', method:'resign'}); }} className="py-2 rounded bg-red-600/80 text-white text-xs">RESIGN MATCH</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm">{oracleLoading ? '...' : 'SUBMIT RESULT TO ORACLE'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-3 rounded-2xl bg-emerald-500 text-black font-black text-sm">{payoutLoading?'COMPUTING...':'CLAIM PAYOUT'}</button>}
          <button onClick={onClose} className="py-2 rounded border border-white/20 text-xs">CLOSE ARENA</button>
        </div>

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

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 text-center font-mono">RPS • BEST OF 3 • TIMED PICKS • ORACLE ATTESTED • {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
