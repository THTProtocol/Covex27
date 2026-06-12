import { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { X, Play, Clock, Trophy } from 'lucide-react';

// Minimal FullScreenChess stub for pre-existing imports.
// Real chess gameplay is in CovenantInteractive's integrated view.

export default function FullScreenChess({ stake = 50, onClose, covenantId, creatorAddr, feePercent = 2 }) {
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [turn, setTurn] = useState('w');
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    if (!gameStarted) return;
    const timer = setInterval(() => {
      if (turn === 'w') {
        setWhiteTime(t => { if (t <= 1) { clearInterval(timer); return 0; } return t - 1; });
      } else {
        setBlackTime(t => { if (t <= 1) { clearInterval(timer); return 0; } return t - 1; });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [turn, gameStarted]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 light:bg-slate-100 flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 light:border-slate-200">
        <div className="text-white light:text-slate-800 font-mono text-sm">
          <span className="text-amber-400 font-bold">{stake} KAS</span> Chess Match
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400">Fee: {feePercent}%</div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <X size={20} className="text-white light:text-slate-700" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className={`px-4 py-2 rounded-xl ${turn === 'b' ? 'bg-white/10' : 'bg-white/5'} border ${turn === 'b' ? 'border-white/20' : 'border-white/10'}`}>
            <div className="text-xs text-gray-400">Black</div>
            <div className={`font-mono text-2xl font-bold ${blackTime < 60 ? 'text-red-400' : 'text-white light:text-slate-900'}`}>{formatTime(blackTime)}</div>
          </div>
          <div className="rounded-xl overflow-hidden border-2 border-white/10 light:border-slate-300">
            <Chessboard
              position="start"
              boardWidth={Math.min(400, window.innerWidth - 48)}
              customDarkSquareStyle={{ backgroundColor: '#769656' }}
              customLightSquareStyle={{ backgroundColor: '#EEEED2' }}
            />
          </div>
          <div className={`px-4 py-2 rounded-xl ${turn === 'w' ? 'bg-white/10' : 'bg-white/5'} border ${turn === 'w' ? 'border-white/20' : 'border-white/10'}`}>
            <div className="text-xs text-gray-400">White</div>
            <div className={`font-mono text-2xl font-bold ${whiteTime < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(whiteTime)}</div>
          </div>
        </div>
        <div className="space-y-4 text-center">
          {!gameStarted ? (
            <button
              onClick={() => setGameStarted(true)}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-2xl text-lg flex items-center gap-2"
            >
              <Play size={20} /> START GAME
            </button>
          ) : (
            <div className="text-sm text-amber-400">
              <div className="flex items-center gap-2 justify-center mb-2">
                <Clock size={16} /> {turn === 'w' ? 'White' : 'Black'}'s turn
              </div>
              <div className="text-xs text-gray-500">
                10 min clocks · Resign · Oracle verified
              </div>
            </div>
          )}
          <div className="text-[10px] text-gray-600">
            Creator: {creatorAddr?.slice(0, 16)}... · On-chain verification
          </div>
        </div>
      </div>
    </div>
  );
}
