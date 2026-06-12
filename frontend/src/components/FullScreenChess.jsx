import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { X, Clock, Trophy, Flag, Users } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';

/**
 * Persistent multiplayer chess over the covenant's match record.
 * First wallet to open becomes white and waits; the second becomes black.
 * Moves are validated locally with chess.js; persistence, seats, turn state
 * and live sync live in useGameSync (shared by all arena games).
 * Stakes remain on-chain; the oracle signs the final outcome separately.
 */
export default function FullScreenChess({ stake = 50, onClose, covenantId, creatorAddr, feePercent = 2 }) {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);

  const onMoves = useCallback((moves) => {
    chess.reset();
    for (const m of moves) {
      try { chess.move(m); } catch { /* control tokens like 'resign' are not SAN */ }
    }
    setFen(chess.fen());
  }, [chess]);

  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign } =
    useGameSync({ covenantId, gameType: 'chess', stake, onMoves });

  // Clocks tick for the side to move while the match is active
  useEffect(() => {
    if (!game || game.status !== 'active') return undefined;
    const id = setInterval(() => {
      if (game.current_turn === 'white') setWhiteTime((t) => Math.max(0, t - 1));
      else setBlackTime((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [game]);

  const onPieceDrop = (source, target) => {
    if (!game || status !== 'active' || !myColor) return false;
    if (!isMyTurn) { setError('Not your turn.'); return false; }
    let mv = null;
    try { mv = chess.move({ from: source, to: target, promotion: 'q' }); } catch { mv = null; }
    if (!mv) return false;
    setFen(chess.fen());
    setError(null);
    const over = chess.isGameOver();
    const winner = chess.isCheckmate() ? myColor : over ? 'draw' : null;
    submitMove(mv.san, { finished: over, winner });
    return true;
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const seatTaken = (p) => p && p.length > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="text-white font-mono text-sm flex items-center gap-3">
          <span className="text-amber-400 font-bold">{stake} KAS</span> Chess Match
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${status === 'active' ? 'border-emerald-500/40 text-emerald-300' : status === 'finished' ? 'border-purple-500/40 text-purple-300' : 'border-amber-500/40 text-amber-300'}`}>
            {status === 'none' ? 'OPEN' : status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400">Fee: {feePercent}%</div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><X size={20} className="text-white" /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 p-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <div className={`px-4 py-2 rounded-xl w-full flex items-center justify-between gap-6 ${game?.current_turn === 'black' && status === 'active' ? 'bg-white/10 border-white/25' : 'bg-white/5 border-white/10'} border`}>
            <div>
              <div className="text-xs text-gray-400">Black {myColor === 'black' && '(you)'}</div>
              <div className="text-[10px] font-mono text-gray-500">{seatTaken(game?.player2) ? `${game.player2.slice(0, 14)}...` : 'seat open'}</div>
            </div>
            <div className={`font-mono text-2xl font-bold ${blackTime < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(blackTime)}</div>
          </div>
          <div className="rounded-xl overflow-hidden border-2 border-white/10">
            <Chessboard
              position={fen}
              onPieceDrop={onPieceDrop}
              boardOrientation={myColor === 'black' ? 'black' : 'white'}
              arePiecesDraggable={status === 'active' && !!myColor}
              boardWidth={Math.min(440, window.innerWidth - 48)}
              customDarkSquareStyle={{ backgroundColor: '#769656' }}
              customLightSquareStyle={{ backgroundColor: '#EEEED2' }}
              customBoardStyle={{ boxShadow: '0 12px 40px -12px rgba(0,0,0,0.8)' }}
            />
          </div>
          <div className={`px-4 py-2 rounded-xl w-full flex items-center justify-between gap-6 ${game?.current_turn === 'white' && status === 'active' ? 'bg-white/10 border-white/25' : 'bg-white/5 border-white/10'} border`}>
            <div>
              <div className="text-xs text-gray-400">White {myColor === 'white' && '(you)'}</div>
              <div className="text-[10px] font-mono text-gray-500">{seatTaken(game?.player1) ? `${game.player1.slice(0, 14)}...` : 'seat open'}</div>
            </div>
            <div className={`font-mono text-2xl font-bold ${whiteTime < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(whiteTime)}</div>
          </div>
        </div>

        <div className="space-y-4 text-center max-w-xs">
          {status === 'none' || (status === 'waiting' && !myColor) ? (
            <button onClick={join} disabled={joining}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-lg flex items-center gap-2 mx-auto">
              <Users size={20} /> {joining ? 'JOINING...' : status === 'none' ? 'CREATE MATCH (WHITE)' : 'JOIN AS BLACK'}
            </button>
          ) : status === 'waiting' ? (
            <div className="text-sm text-amber-300 animate-pulse">Waiting for an opponent to join as black...</div>
          ) : status === 'active' ? (
            <div className="text-sm text-amber-400">
              <div className="flex items-center gap-2 justify-center mb-2">
                <Clock size={16} /> {game.current_turn === 'white' ? 'White' : 'Black'} to move
                {isMyTurn && <span className="text-emerald-300 font-bold">(your move)</span>}
              </div>
              {myColor && (
                <button onClick={resign} className="mt-2 px-4 py-2 rounded-xl border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1.5 mx-auto hover:bg-red-500/10">
                  <Flag size={12} /> Resign
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-purple-300 flex items-center gap-2 justify-center">
              <Trophy size={18} className="text-amber-400" />
              {game?.winner === 'draw' ? 'Draw' : `${game?.winner === 'white' ? 'White' : 'Black'} wins`}
            </div>
          )}
          {!myColor && status !== 'none' && <div className="text-[11px] text-gray-500">You are spectating. Moves sync live.</div>}
          {error && <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{error}</div>}
          <div className="text-[10px] text-gray-600">
            Moves persist on the match record and sync in real time. The pot settles on-chain with oracle verification.
            <br />Creator: {creatorAddr?.slice(0, 16)}...
          </div>
        </div>
      </div>
    </div>
  );
}
