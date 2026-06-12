import { useState, useCallback, useEffect, useMemo } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';

// Professional full-screen Reversi / Othello (8x8): persistent two-wallet
// multiplayer over the covenant match record. Black moves first, so seats
// map player1 (server 'white') -> B pieces, player2 (server 'black') -> W.
// When a side has no legal flip it submits an explicit "pass" move; the
// board is replayed from the server move log ("B27", "W34", "pass", ...).

const SIZE = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function initBoard() {
  const b = Array(SIZE * SIZE).fill(null);
  b[3 * SIZE + 3] = 'W'; b[3 * SIZE + 4] = 'B';
  b[4 * SIZE + 3] = 'B'; b[4 * SIZE + 4] = 'W';
  return b;
}

function getFlipsForBoard(bd, i, pl) {
  if (bd[i]) return [];
  const fl = [];
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const op = pl === 'B' ? 'W' : 'B';
  for (const [dr, dc] of DIRS) {
    let rr = r + dr, cc = c + dc;
    const line = [];
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
      const j = rr * SIZE + cc;
      if (bd[j] === op) line.push(j);
      else if (bd[j] === pl) { if (line.length) fl.push(...line); break; }
      else break;
      rr += dr; cc += dc;
    }
  }
  return fl;
}

const sideHasMove = (bd, pl) => {
  for (let k = 0; k < SIZE * SIZE; k++) if (getFlipsForBoard(bd, k, pl).length > 0) return true;
  return false;
};

function replayBoard(moves) {
  const bd = initBoard();
  for (const m of moves) {
    const mt = typeof m === 'string' && m.match(/^([BW])([0-9]{1,2})$/);
    if (!mt) continue; // 'pass' and 'resign' leave the board unchanged
    const i = Number(mt[2]);
    if (i >= SIZE * SIZE) continue;
    const flips = getFlipsForBoard(bd, i, mt[1]);
    bd[i] = mt[1];
    flips.forEach((j) => { bd[j] = mt[1]; });
  }
  return bd;
}

export default function FullScreenReversi({ stake = 40, onClose, covenantId, feePercent = 2, potReturnPercent = 2 }) {
  const [board, setBoard] = useState(() => initBoard());
  const [localMethod, setLocalMethod] = useState(null);

  const [blackTime, setBlackTime] = useState(2.5 * 60 * 1000);
  const [whiteTime, setWhiteTime] = useState(2.5 * 60 * 1000);

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const onMoves = useCallback((moves) => { setBoard(replayBoard(moves)); }, []);
  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign } =
    useGameSync({ covenantId, gameType: 'reversi', stake, onMoves });

  // Black moves first: player1 (server 'white') plays B
  const myPiece = myColor === 'white' ? 'B' : myColor === 'black' ? 'W' : null;
  const turnPiece = game?.current_turn === 'black' ? 'W' : 'B';
  const pieceToServer = (piece) => (piece === 'B' ? 'white' : 'black');

  // outcome is in PIECE colors (black/white discs), mapped from the server winner
  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'white' ? 'black' : 'white';
    return { outcome, method: localMethod || 'result' };
  }, [status, game, localMethod]);

  const isLegal = (i) => status === 'active' && isMyTurn && myPiece && !board[i] && getFlipsForBoard(board, i, myPiece).length > 0;
  const mustPass = status === 'active' && isMyTurn && myPiece && !sideHasMove(board, myPiece);

  const countWinner = (bd) => {
    const bc = bd.filter((x) => x === 'B').length, wc = bd.filter((x) => x === 'W').length;
    return bc > wc ? 'white' : wc > bc ? 'black' : 'draw'; // server colors: B belongs to player1='white'
  };

  const place = (i) => {
    if (status !== 'active' || !myPiece || result || board[i]) return;
    if (!isMyTurn) { setError('Not your turn.'); return; }
    const flips = getFlipsForBoard(board, i, myPiece);
    if (!flips.length) return;
    const newB = [...board];
    newB[i] = myPiece;
    flips.forEach((j) => { newB[j] = myPiece; });
    setBoard(newB);
    setError(null);

    const opp = myPiece === 'B' ? 'W' : 'B';
    const finished = !sideHasMove(newB, opp) && !sideHasMove(newB, myPiece);
    if (finished) setLocalMethod('count');
    submitMove(`${myPiece}${i}`, { finished, winner: finished ? countWinner(newB) : null });
  };

  const pass = () => {
    if (!mustPass) return;
    const opp = myPiece === 'B' ? 'W' : 'B';
    const finished = !sideHasMove(board, opp); // neither side can move
    if (finished) setLocalMethod('count');
    submitMove('pass', { finished, winner: finished ? countWinner(board) : null });
  };

  // display clocks tick for the side to move (advisory; server enforces turns, not time)
  useEffect(() => {
    if (status !== 'active') return undefined;
    const iv = setInterval(() => {
      if (game?.current_turn === 'white') setBlackTime((t) => Math.max(0, t - 1000));
      else setWhiteTime((t) => Math.max(0, t - 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [status, game]);

  const format = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve.');
      return;
    }
    setOracleLoading(true); setOracleError(null);
    const om = { black: 0, white: 1, draw: 2 };
    const ov = om[result.outcome] ?? 0;
    try {
      const r = await fetch('/api/oracle/verify-and-sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'reversi_v1', proof: { g: 'reversi', o: result.outcome }, public_inputs: [result.outcome], requested_outcome: ov }) });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); }
      else { setOracleError(d.error || 'Oracle rejected the result.'); }
    } catch (e) { setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.'); }
    finally { setOracleLoading(false); }
  }, [result, covenantId]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { black: 0, white: 1, draw: 2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oracle_signature: oracleResult.signature || oracleSig || '', outcome: om[result?.outcome] ?? 0, total_stake_kas: totalPot, per_side_stake_kas: stake, oracle_message: `reversi:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now() / 1000) }) });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : { error: d.error });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewF = ((totalPot) * feePercent / 100).toFixed(1);
  const previewR = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const moves = Array.isArray(game?.moves) ? game.moves : [];
  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #0a120a 0%, #050505 70%)' }}>
      <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB]">REVERSI / OTHELLO • KASPA COVENANT</div>
        <div className="flex items-center gap-2"><div className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">{totalPot} KAS POT • {potReturnPercent}% RETURN</div><button onClick={onClose} className="px-3 py-1 rounded-xl border border-white/20 text-xs font-bold">EXIT</button></div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-3 p-2 overflow-auto">
        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400">BLACK{myPiece === 'B' && ' • YOU'}</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${blackTime < 30000 ? 'text-red-500' : 'text-white'}`}>{format(blackTime)}</div>
          <div className="mt-1 text-[10px] font-mono text-gray-500">{seat(game?.player1)}</div>
        </div>

        <div className="relative">
          <div className="lg:hidden flex justify-between max-w-[min(92vw,420px)] text-[10px] mb-1 font-mono"><span className={blackTime < 30000 ? 'text-red-500' : ''}>B {format(blackTime)}</span><span className="text-kaspa-green">{result ? 'OVER' : status === 'active' ? (turnPiece + ' TO PLAY') : status.toUpperCase()}</span><span className={whiteTime < 30000 ? 'text-red-500' : ''}>W {format(whiteTime)}</span></div>
          <div className="grid grid-cols-8 gap-0.5 p-1 bg-[#0e3320] rounded-2xl border border-white/10" style={{ width: 'min(92vw,420px)', aspectRatio: '1' }}>
            {board.map((v, i) => {
              const legal = !result && isLegal(i);
              return <div key={i} onClick={() => place(i)} className={`aspect-square flex items-center justify-center rounded ${legal ? 'ring-2 ring-yellow-300/80' : ''} ${v ? '' : 'hover:bg-white/5'} cursor-pointer`} style={{ background: '#1a7a44', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)' }}>
                {v && <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full shadow ${v === 'B' ? 'bg-gradient-to-br from-[#333] to-black shadow-[0_2px_4px_rgba(0,0,0,0.6)]' : 'bg-gradient-to-br from-white to-[#cfcfcf] shadow-[0_2px_4px_rgba(0,0,0,0.5)]'}`} />}
              </div>;
            })}
          </div>

          {status !== 'active' && !result && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <button onClick={join} disabled={joining}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2">
                  <Users size={16} /> {joining ? 'JOINING...' : status === 'none' ? 'CREATE MATCH (BLACK)' : 'JOIN AS WHITE'}
                </button>
              ) : (
                <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS WHITE...</div>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
            </div>
          )}

          <div className="text-center mt-1 text-xs font-mono text-kaspa-green tracking-wider">{result ? (result.outcome === 'draw' ? 'DRAW' : `${result.outcome.toUpperCase()} WINS`) : status === 'active' ? ((turnPiece === 'B' ? 'BLACK' : 'WHITE') + ' TO PLAY') : ''}</div>
          {mustPass && (
            <div className="text-center mt-1">
              <button onClick={pass} className="px-4 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold">PASS (NO LEGAL MOVES)</button>
            </div>
          )}
          {!myColor && status === 'active' && <div className="text-center text-[10px] text-gray-500 mt-0.5">You are spectating. Moves sync live.</div>}
          {error && status === 'active' && <div className="text-center text-[10px] text-red-300 mt-0.5">{error}</div>}
        </div>

        <div className="hidden lg:flex flex-col items-center w-40">
          <div className="text-xs text-gray-400">WHITE{myPiece === 'W' && ' • YOU'}</div>
          <div className={`font-mono text-5xl font-bold tabular-nums ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{format(whiteTime)}</div>
          <div className="mt-1 text-[10px] font-mono text-gray-500">{seat(game?.player2)}</div>
          <div className="mt-2 w-full text-[10px] font-mono bg-black/50 p-2 rounded border border-white/10 max-h-28 overflow-auto">{moves.slice(-5).join(' ')}</div>
          <div className="mt-2 flex flex-col gap-1 w-full text-xs">
            {!result && myColor && status === 'active' && <button onClick={resign} className="py-2 rounded-xl bg-red-600/90 text-white font-bold">RESIGN</button>}
            {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-2 rounded-2xl bg-[#49EACB] text-black font-bold">{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>}
            {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-2 rounded-2xl bg-emerald-500 text-black font-bold">{payoutLoading ? '...' : 'CLAIM PAYOUT'}</button>}
            <button onClick={onClose} className="py-2 rounded border border-white/20">CLOSE</button>
          </div>
          {oracleError && <div className="mt-2 text-[10px] text-amber-300 text-center">{oracleError}</div>}
        </div>
      </div>

      {/* mobile footer */}
      <div className="lg:hidden border-t border-white/10 bg-black/60 px-3 py-2">
        <div className="flex gap-2">
          {!result && myColor && status === 'active' && <button onClick={resign} className="flex-1 py-2 bg-red-600/90 rounded-xl text-xs text-white font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 bg-[#49EACB] text-black rounded-2xl text-sm font-bold" disabled={oracleLoading}>{oracleLoading ? '...' : 'SUBMIT'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 bg-emerald-500 text-black rounded-2xl text-sm font-bold" disabled={payoutLoading}>{payoutLoading ? '...' : 'CLAIM'}</button>}
          <button onClick={onClose} className="px-3 border border-white/20 rounded-xl text-xs">CLOSE</button>
        </div>
        {oracleError && <div className="mt-1 text-[10px] text-amber-300">{oracleError}</div>}
        {result && !payoutResult && <div className="grid grid-cols-3 gap-2 text-[10px] text-center mt-2"><div className="bg-black/40 border border-white/10 p-1 rounded">Win {previewW}</div><div className="bg-black/40 border border-white/10 p-1 rounded">Fee {previewF}</div><div className="bg-black/40 border border-white/10 p-1 rounded">Pot {previewR}</div></div>}
      </div>

      {payoutResult && !payoutResult.error && (
        <div className="hidden lg:block max-w-sm mx-auto mb-2 p-3 border border-emerald-500/30 bg-emerald-500/5 rounded-xl text-xs">
          <div className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> PAYOUT COMPUTED</div>
          <div className="grid grid-cols-3 mt-1"><div>W {payoutResult.winner_share_kas} KAS</div><div>P {payoutResult.platform_fee_kas} KAS</div><div>Pot {payoutResult.pot_return_kas} KAS</div></div>
        </div>
      )}

      <div className="h-8 border-t border-white/10 text-[10px] text-gray-500 text-center font-mono">REVERSI • LEGAL FLIPS ONLY • LIVE MULTIPLAYER • ORACLE • {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
