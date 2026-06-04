import { useState } from 'react';
import { Play } from 'lucide-react';

// Full-screen Tic-Tac-Toe arena — 3x3 grid, turn-based, oracle resolution.

export default function FullScreenTicTacToe({ stake, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState('X');
  const [result, setResult] = useState(null);
  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const [xTime, setXTime] = useState(1.5 * 60 * 1000);
  const [oTime, setOTime] = useState(1.5 * 60 * 1000);

  const totalPot = stake * 2;
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  const checkWin = (b) => {
    for (const [a,b_,c] of lines) if (b[a] && b[a]===b[b_] && b[a]===b[c]) return b[a];
    return b.every(v => v) ? 'draw' : null;
  };

  const move = (i) => {
    if (result || board[i]) return;
    const b = [...board]; b[i] = turn;
    setBoard(b);
    const w = checkWin(b);
    if (w) { setResult(w); return; }
    setTurn(turn === 'X' ? 'O' : 'X');
  };

  const submitOracle = async () => {
    setOracleLoading(true);
    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'chess_v1', proof: { result, board }, public_inputs: [] }),
      });
      const data = await res.json();
      setOracleSig(data.signature || 'SIGNED');
      setOracleSubmitted(true);
    } catch(e) { setOracleSig('ORACLE ERROR'); setOracleSubmitted(true); }
    setOracleLoading(false);
  };

  const claimPayout = async () => {
    setPayoutLoading(true);
    try {
      const res = await fetch(`/api/covenant/${encodeURIComponent(covenantId)}/compute-payout`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ oracle_sig: oracleSig, winner: result === 'X' ? 0 : result === 'O' ? 1 : 2 }),
      });
      const data = await res.json();
      setPayoutResult(data);
    } catch(e) { setPayoutResult({ error: 'Failed' }); }
    setPayoutLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white">✕ Exit</button>
        <span className="text-sm font-bold text-white">Tic-Tac-Toe Arena</span>
        <span className="text-xs text-gray-500">{turn === 'X' ? 'X' : 'O'}'s turn</span>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-2 w-[280px]">
          {board.map((v, i) => (
            <button key={i} onClick={() => move(i)}
              className="aspect-square rounded-xl bg-white/[0.04] border border-white/10 hover:border-kaspa-green/30 flex items-center justify-center text-3xl font-black transition-all">
              <span className={v==='X'?'text-kaspa-green':v==='O'?'text-[#7e14ff]':'text-transparent'}>{v||'.'}</span>
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="px-4 py-3 border-t border-white/5 space-y-2">
          <p className="text-center text-sm text-white">
            {result==='draw' ? 'Draw!' : `${result} wins!`}
          </p>
          {!oracleSubmitted ? (
            <button onClick={submitOracle} disabled={oracleLoading}
              className="w-full py-2.5 rounded-xl bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green text-xs font-bold uppercase tracking-wider hover:bg-kaspa-green/20">
              {oracleLoading ? 'Submitting...' : 'Submit Result to Oracle'}
            </button>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-[10px] text-gray-400">Oracle Signature: {oracleSig}</p>
              {!payoutResult ? (
                <button onClick={claimPayout} disabled={payoutLoading}
                  className="w-full py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-bold">
                  {payoutLoading ? 'Computing...' : `CLAIM PAYOUT (${totalPot} KAS pot)`}
                </button>
              ) : payoutResult.error ? (
                <p className="text-xs text-red-400">{payoutResult.error}</p>
              ) : (
                <div className="text-xs text-white space-y-1">
                  <p>PAYOUT COMPUTED</p>
                  <p className="text-gray-400">Winner: {payoutResult.winner_share} KAS</p>
                  <p className="text-gray-400">Fee: {payoutResult.platform_fee} KAS</p>
                  <p className="text-gray-400">Pot Return: {payoutResult.pot_return} KAS</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
