import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useWallet } from './WalletContext';

// Full-screen 10min Chess Arena
// Stake match gate → 5min join window or auto-return → 10min game (5min per side or total? using per player 10min total for simplicity)
// Resign, timeout, checkmate → oracle submit for resolution → payout winner (pot - 2% to creator_addr)
export default function FullScreenChess({ stake = 50, onClose, covenantId, creatorAddr, feePercent = 2 }) {
  const [game] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [turn, setTurn] = useState('w');
  const [whiteTime, setWhiteTime] = useState(10 * 60 * 1000); // 10 min per player
  const [blackTime, setBlackTime] = useState(10 * 60 * 1000);
  const [result, setResult] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(true); // simplistic; in real use player color
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [joinTimeLeft, setJoinTimeLeft] = useState(5 * 60 * 1000); // 5 min join window
  const [stakes, setStakes] = useState({ white: stake, black: 0 });
  const [submitting, setSubmitting] = useState(false);

  const { address, sendPayment } = useWallet();
  const totalPot = stake * 2;
  const fee = Math.floor(totalPot * (feePercent / 100));
  const winnerPot = totalPot - fee;

  // Join window timer
  useEffect(() => {
    if (opponentJoined || result) return;
    const t = setInterval(() => {
      setJoinTimeLeft(t => {
        const nt = Math.max(0, t - 1000);
        if (nt <= 0) {
          // timeout - return to staker (in real: call resolve return)
          setResult({ outcome: 'return', method: 'no-opponent' });
        }
        return nt;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [opponentJoined, result]);

  // Game timers (simplified: decrement active player)
  useEffect(() => {
    if (result || !opponentJoined) return;
    const t = setInterval(() => {
      if (turn === 'w') {
        setWhiteTime(t => {
          const nt = Math.max(0, t - 1000);
          if (nt <= 0) setResult({ outcome: 'b', method: 'timeout' });
          return nt;
        });
      } else {
        setBlackTime(t => {
          const nt = Math.max(0, t - 1000);
          if (nt <= 0) setResult({ outcome: 'w', method: 'timeout' });
          return nt;
        });
      }
    }, 1000);
    return () => clearInterval(t);
  }, [turn, result, opponentJoined]);

  // Simulate opponent join for demo (in prod: listen to second equal stake payment to covenant addr)
  const simulateMatch = () => {
    setOpponentJoined(true);
    setStakes({ white: stake, black: stake });
    // In real: the second player calls sendPayment to covenant with memo stake
  };

  const onDrop = (source, target) => {
    if (result || !isMyTurn || !opponentJoined) return false;
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return false;
    setFen(game.fen());
    setTurn(game.turn());
    setIsMyTurn(false);

    // In real: generate ZK proof for move (chess_v1), submit to oracle for verification
    // Here we stub and auto "opponent" reply for demo
    setTimeout(() => {
      // Simulate opponent move (random legal for demo)
      const moves = game.moves({ verbose: true });
      if (moves.length > 0 && !game.isGameOver()) {
        const oppMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(oppMove);
        setFen(game.fen());
        setTurn(game.turn());
        setIsMyTurn(true);
      }
      checkGameEnd();
    }, 1200);

    checkGameEnd();
    return true;
  };

  const checkGameEnd = () => {
    if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'b' : 'w';
      setResult({ outcome: winner, method: 'checkmate' });
    } else if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition()) {
      setResult({ outcome: 'draw', method: 'draw' });
    }
  };

  const resign = () => {
    if (!result) {
      const winner = turn === 'w' ? 'b' : 'w';
      setResult({ outcome: winner, method: 'resign' });
    }
  };

  // Submit result to oracle for attestation + resolution
  const submitToOracle = async () => {
    if (!result || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        covenant_id: covenantId,
        circuit_type: 'chess_v1',
        proof: { stub: true }, // in prod: real groth16 proof from move log
        public_inputs: [turn, result.outcome, result.method, Date.now()],
        requested_outcome: result.outcome === 'w' ? 1 : result.outcome === 'b' ? 0 : 2,
        total_pot: totalPot,
        fee: fee,
        creator_addr: creatorAddr,
        winner_addr: result.outcome === 'w' ? address : 'opponent', // real: determine from color
      };
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        // In real: use the sig to unlock the pot on-chain via the covenant script (timelock + oracle pubkey)
        // Here we just show success and "payout"
        alert(`Oracle attested! Winner gets ${winnerPot} KAS (2% ${fee} KAS to creator ${creatorAddr}). In prod this would trigger on-chain payout.`);
        onClose();
      } else {
        alert('Oracle failed to attest. Possible invalid play - lie detected!');
      }
    } catch (e) {
      alert('Oracle error: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!opponentJoined && joinTimeLeft > 0) {
    return (
      <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col items-center justify-center text-white" style={{ background: 'radial-gradient(circle at 50% 20%, #1a2a1a 0%, #050505 80%)' }}>
        <div className="text-6xl font-bold tracking-tighter mb-4">CHESS ARENA</div>
        <div className="text-2xl mb-8">10 MIN • WINNER TAKES ALL • 2% FEE TO CREATOR</div>

        <div className="text-8xl font-mono tabular-nums mb-4 text-emerald-400">{formatTime(joinTimeLeft)}</div>
        <div className="mb-8 text-lg text-gray-400">Waiting for opponent to match your {stake} KAS stake...</div>

        <div className="flex gap-4">
          <button onClick={simulateMatch} className="px-8 py-4 bg-emerald-500 text-black font-bold rounded-2xl text-lg">SIMULATE OPPONENT MATCH (DEMO)</button>
          <button onClick={onClose} className="px-8 py-4 border border-white/30 rounded-2xl">Cancel &amp; Return Stake</button>
        </div>

        <div className="mt-12 text-xs text-gray-500 max-w-md text-center">
          Full transparency: Stake is sent to the covenant address. If no match in 5 min, auto-return via covenant script + oracle. Creator (you) gets 2% of every resolved pot to sustain the arena for future games.
        </div>
      </div>
    );
  }

  if (result) {
    const isWin = result.outcome === 'w' && isMyTurn; // simplistic
    return (
      <div className="fixed inset-0 z-[999] bg-black flex flex-col items-center justify-center text-white">
        <div className="text-6xl mb-4">{result.method === 'timeout' ? '⏱ TIME' : result.method === 'resign' ? '🏳 RESIGN' : result.method === 'checkmate' ? '♟ CHECKMATE' : '🤝 DRAW'}</div>
        <div className="text-3xl mb-8">{result.outcome === 'draw' ? 'DRAW' : result.outcome === 'w' ? 'WHITE WINS' : 'BLACK WINS'}</div>

        <div className="text-2xl mb-2">POT: {totalPot} KAS</div>
        <div className="text-emerald-400 text-4xl font-bold mb-8">{winnerPot} KAS TO WINNER • {fee} KAS (2%) TO CREATOR {creatorAddr}</div>

        <button onClick={submitToOracle} disabled={submitting} className="px-10 py-4 bg-emerald-500 text-black font-bold rounded-2xl text-xl disabled:opacity-50">
          {submitting ? 'SUBMITTING TO ORACLE...' : 'SUBMIT RESULT TO ORACLE & CLAIM'}
        </button>
        <button onClick={onClose} className="mt-4 text-sm underline">Close Arena</button>

        <div className="mt-8 text-xs text-gray-500">All moves were (or will be) verified by chess_v1 ZK circuit + Covex oracle. Invalid play = lie detected, result rejected.</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 18%, #1a2a1a 0%, #050505 72%)' }}>
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/60">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold tracking-tighter">CHESS ARENA — 10 MIN</div>
          <div className="px-3 py-1 text-xs rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">{totalPot} KAS POT • 2% FEE TO CREATOR</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div>WHITE: <span className="font-mono text-emerald-400">{formatTime(whiteTime)}</span></div>
          <div>BLACK: <span className="font-mono text-emerald-400">{formatTime(blackTime)}</span></div>
          <button onClick={resign} className="px-3 py-1 border border-red-500/40 text-red-400 rounded text-xs">RESIGN</button>
          <button onClick={onClose} className="px-3 py-1 border border-white/20 rounded text-xs">EXIT ARENA</button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[720px]">
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardWidth={680}
            customDarkSquareStyle={{ backgroundColor: '#3a2f1f' }}
            customLightSquareStyle={{ backgroundColor: '#d4c5a9' }}
          />
        </div>
      </div>

      <div className="p-4 border-t border-white/10 bg-black/60 text-xs text-gray-400 flex justify-between items-center">
        <div>Stake matched • ZK-verified moves via chess_v1 • Oracle will attest result for on-chain payout to winner minus 2% fee to covenant creator.</div>
        <div className="font-mono text-kaspa-green">COVENANT: {covenantId?.slice(0,12)}...</div>
      </div>
    </div>
  );
}
