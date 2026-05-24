import React, { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

const STORAGE_KEY = 'covex_chess_';

const API = {
  async fetchGame(covenantId) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/game-state`);
    return r.json();
  },
  async createGame(covenantId, creatorAddr, potAmount, player2) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/create-game`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator_addr: creatorAddr, pot_amount_kas: potAmount, player2: player2 || null }),
    });
    return r.json();
  },
  async joinGame(covenantId, player2) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/join-game`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player2 }),
    });
    return r.json();
  },
  async saveMove(covenantId, moves, currentTurn) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/make-move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: '', moves: JSON.stringify(moves), current_turn: currentTurn }),
    });
    return r.json();
  },
  async resolveWinner(covenantId, winner, claimer) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/resolve-winner`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner, claimer }),
    });
    return r.json();
  },
};

export default function ChessGameBoard({ covenantId, covenant, userAddress }) {
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moveHistory, setMoveHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  // Load game from backend
  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        const g = new Chess();
        try {
          const moves = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves;
          if (Array.isArray(moves)) {
            for (const m of moves) {
              try { g.move(m); } catch (_) {}
            }
          }
        } catch (_) {}
        setGame(g);
        setMoveHistory(g.history());
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const onDrop = useCallback((source, target) => {
    if (!gameState || gameState.status !== 'active') {
      setMessage('Game not active');
      return false;
    }
    try {
      const move = game.move({ from: source, to: target, promotion: 'q' });
      if (move) {
        const newGame = new Chess(game.fen());
        setGame(newGame);
        const history = newGame.history();
        setMoveHistory(history);
        API.saveMove(covenantId, history, newGame.turn() === 'w' ? 'white' : 'black').catch(() => {});
        setMessage('');
        if (newGame.isCheckmate()) {
          const winner = newGame.turn() === 'w' ? 'black' : 'white';
          setMessage(`Checkmate! ${winner.toUpperCase()} wins the pot!`);
          API.resolveWinner(covenantId, winner, userAddress || '').catch(() => {});
        } else if (newGame.isDraw()) {
          setMessage('Game ended in a draw!');
        }
        return true;
      }
    } catch (_) {}
    return false;
  }, [game, gameState, covenantId, userAddress]);

  const handleCreate = async () => {
    if (!userAddress) { setMessage('Connect wallet first'); return; }
    setCreating(true);
    const r = await API.createGame(covenantId, userAddress, covenant?.amount_kaspa || 0);
    if (r.success) {
      setGameState({ ...gameState, status: 'waiting', player1: userAddress, pot_amount_kas: covenant?.amount_kaspa || 0 });
      setMessage('Game created! Waiting for opponent to join.');
    } else {
      setMessage(r.error || 'Failed to create game');
    }
    setCreating(false);
  };

  const handleJoin = async () => {
    if (!userAddress) { setMessage('Connect wallet first'); return; }
    const r = await API.joinGame(covenantId, userAddress);
    if (r.success) {
      setGameState(prev => ({ ...prev, status: 'active', player2: userAddress }));
      setMessage('You joined! Game is active.');
    } else {
      setMessage(r.error || 'Failed to join');
    }
  };

  const handleResign = async () => {
    if (!userAddress) return;
    const winner = gameState?.player1 === userAddress ? gameState?.player2 : gameState?.player1;
    await API.resolveWinner(covenantId, winner || 'opponent', userAddress);
    setMessage('Resigned. Opponent wins the pot.');
  };

  if (loading) return <div className="text-center text-gray-400 py-16">Loading chess game...</div>;

  // Game not yet created
  if (!gameState) {
    return (
      <div className="p-8 border border-zinc-700/60 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-6xl mb-4">♟️</div>
        <h3 className="text-xl font-bold text-white mb-2">Winner-Takes-All Chess</h3>
        <p className="text-gray-400 mb-6">
          Pot: {covenant?.amount_kaspa || 0} KAS — Winner takes everything!
        </p>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-6 py-3 bg-gradient-to-r from-[#49EACB] to-[#00D2FF] text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(73,234,203,0.4)] transition-all"
        >
          {creating ? 'Creating...' : 'Create Game'}
        </button>
      </div>
    );
  }

  // Waiting for player 2
  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-8 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h3 className="text-xl font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        <p className="text-gray-500 text-sm mb-4">Player 1: <code className="text-gray-400">{gameState.player1}</code></p>
        {!isCreator && (
          <button onClick={handleJoin} className="px-6 py-3 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">
            Join Game
          </button>
        )}
        {isCreator && <p className="text-gray-500 text-sm">Share this covenant link to invite an opponent.</p>}
      </div>
    );
  }

  // Active game
  const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
  const isPlayerTurn = (gameState.current_turn === 'white') ? !isWhite : isWhite;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Board */}
      <div className="flex-1 max-w-[500px]">
        <Chessboard
          position={game.fen()}
          onPieceDrop={onDrop}
          boardWidth={500}
          customBoardStyle={{ borderRadius: '12px', boxShadow: '0 0 30px rgba(73,234,203,0.2)' }}
          customDarkSquareStyle={{ backgroundColor: '#1a1a2e' }}
          customLightSquareStyle={{ backgroundColor: '#0d1b2a' }}
          customPieces={undefined}
        />
        {message && (
          <div className="mt-4 p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center">
            {message}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-64 space-y-4">
        {/* Status */}
        <div className="p-4 border border-zinc-700/60 bg-zinc-900/70 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-3 h-3 rounded-full ${gameState.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-sm font-bold text-gray-300 uppercase">{gameState.status}</span>
          </div>
          <p className="text-sm text-gray-400">
            Turn: <span className="text-white font-bold">{gameState.current_turn}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span>
          </p>
        </div>

        {/* Players */}
        <div className="p-4 border border-zinc-700/60 bg-zinc-900/70 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">White</span>
            <code className="text-xs text-gray-400">{gameState.player1 ? gameState.player1.slice(0, 12) + '...' : '—'}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Black</span>
            <code className="text-xs text-gray-400">{gameState.player2 ? gameState.player2.slice(0, 12) + '...' : 'Waiting...'}</code>
          </div>
        </div>

        {/* Winner info */}
        {gameState.winner && (
          <div className="p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-xl text-center">
            <p className="text-yellow-400 font-bold text-sm">Winner!</p>
            <code className="text-xs text-yellow-300">{gameState.winner.slice(0, 16)}...</code>
          </div>
        )}

        {/* Resign */}
        {gameState.status === 'active' && userAddress && (
          <button
            onClick={handleResign}
            className="w-full py-2 border border-red-500/30 bg-red-500/5 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/10 transition-colors"
          >
            Resign
          </button>
        )}

        {/* Move history */}
        <div className="p-4 border border-zinc-700/60 bg-zinc-900/70 rounded-xl max-h-[300px] overflow-y-auto">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Moves</h4>
          {moveHistory.length === 0 ? (
            <p className="text-xs text-gray-600">No moves yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs font-mono text-gray-400">
              {moveHistory.map((m, i) => (
                <span key={i} className={i % 2 === 0 ? 'text-left' : 'text-right'}>
                  {Math.floor(i / 2) + 1}. {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
