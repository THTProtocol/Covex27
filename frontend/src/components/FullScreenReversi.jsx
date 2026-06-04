import { useState } from 'react';
import { Play } from 'lucide-react';

// Full-screen Reversi / Othello arena — 8x8 board, flip discs, oracle resolution.

export default function FullScreenReversi({ stake, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(() => {
    const b = Array(64).fill(null);
    b[27]=b[36]='W'; b[28]=b[35]='B'; // standard start
    return b;
  });
  const [turn, setTurn] = useState('B');
  const [result, setResult] = useState(null);
  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const [blackTime, setBlackTime] = useState(3 * 60 * 1000);
  const [whiteTime, setWhiteTime] = useState(3 * 60 * 1000);

  const totalPot = stake * 2;
  const DIRS = [-9,-8,-7,-1,1,7,8,9];

  const inBounds = (r,c) => r>=0 && r<8 && c>=0 && c<8;
  const idx = (r,c) => r*8+c;
  const rc = (i) => [Math.floor(i/8), i%8];

  // Check if placing at (r,c) for current turn flips any discs
  const getFlips = (r, c, color, b) => {
    const opp = color==='B'?'W':'B';
    const flips = [];
    for (const d of DIRS) {
      const tmp = [];
      let nr = r + Math.floor(d/8)*(d>0?1:d<0?-1:0), nc = c + (d%8);
      let nr2 = r, nc2 = c;
      while (true) {
        nr2 += d>0 ? (Math.abs(d)===9||Math.abs(d)===7 ? (d>0?1:-1) : d===1?0:d===-1?0:d===8?1:d===-8?-1:0) : 0;
        nc2 += d===1 ? 1 : d===-1 ? -1 : d===9 ? 1 : d===-9 ? -1 : d===7 ? -1 : d===-7 ? 1 : 0;
        break; // Simplified — just use basic direction
      }
    }
    // Simplified flip detection — real implementation would trace rays
    const allDirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr,dc] of allDirs) {
      const line = [];
      let cr = r+dr, cc = c+dc;
      while (inBounds(cr,cc) && b[idx(cr,cc)] === opp) {
        line.push(idx(cr,cc));
        cr += dr; cc += dc;
      }
      if (line.length > 0 && inBounds(cr,cc) && b[idx(cr,cc)] === color) {
        flips.push(...line);
      }
    }
    return flips;
  };

  const getValidMoves = (color, b) => {
    const moves = [];
    for (let r=0; r<8; r++)
      for (let c=0; c<8; c++)
        if (!b[idx(r,c)] && getFlips(r,c,color,b).length > 0)
          moves.push([r,c]);
    return moves;
  };

  const move = (r, c) => {
    if (result) return;
    const i = idx(r,c);
    if (board[i]) return;
    const flips = getFlips(r, c, turn, board);
    if (flips.length === 0) return;
    const b = [...board];
    b[i] = turn;
    for (const f of flips) b[f] = turn;
    setBoard(b);

    const oppTurn = turn==='B'?'W':'B';
    if (getValidMoves(oppTurn, b).length > 0) {
      setTurn(oppTurn);
    } else if (getValidMoves(turn, b).length > 0) {
      // opponent has no moves, current player goes again
    } else {
      // game over
      const blacks = b.filter(v=>v==='B').length;
      const whites = b.filter(v=>v==='W').length;
      setResult(blacks > whites ? 'Black' : whites > blacks ? 'White' : 'draw');
    }
  };

  const blacks = board.filter(v=>v==='B').length;
  const whites = board.filter(v=>v==='W').length;
  const validMoves = result ? [] : getValidMoves(turn, board);

  const submitOracle = async () => {
    setOracleLoading(true);
    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'chess_v1', proof: { result }, public_inputs: [] }),
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
        body: JSON.stringify({ oracle_sig: oracleSig, winner: result === 'Black' ? 0 : result === 'White' ? 1 : 2 }),
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
        <span className="text-sm font-bold text-white">Reversi Arena</span>
        <span className="text-xs text-gray-500">
          {turn==='B'?'Black':turn==='W'?'White':''}&apos;s turn · B:{blacks} W:{whites}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center p-2">
        <div className="grid grid-cols-8 gap-0.5 bg-white/[0.03] border border-white/10 rounded-xl p-1 max-w-[380px] w-full">
          {Array.from({length:64}).map((_,i) => {
            const [r,c] = rc(i);
            const isMove = validMoves.some(([mr,mc]) => mr===r && mc===c);
            return (
              <button key={i} onClick={() => move(r,c)}
                className={`aspect-square rounded-sm flex items-center justify-center text-lg font-black transition-all
                  ${isMove ? 'bg-kaspa-green/20 border border-kaspa-green/40 cursor-pointer' : 'bg-white/[0.02]'}`}>
                {board[i] && <span className={board[i]==='B'?'text-white':'text-gray-300'}>{board[i]==='B'?'●':'○'}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {result && (
        <div className="px-4 py-3 border-t border-white/5 space-y-2">
          <p className="text-center text-sm text-white">
            {result==='draw' ? 'Draw!' : `${result} wins! (B:${blacks} W:${whites})`}
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
