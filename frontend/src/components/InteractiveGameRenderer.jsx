import React, { useState, useEffect } from 'react';
import ChessGameBoard from './ChessGameBoard';
import TicTacToeGame from './TicTacToeGame';
import Connect4Game from './Connect4Game';
import CheckersGame from './CheckersGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';
import BattleshipGame from './BattleshipGame';

const GAME_COMPONENTS = {
  chess: ChessGameBoard,
  tictactoe: TicTacToeGame,
  connect4: Connect4Game,
  checkers: CheckersGame,
  rps: RockPaperScissorsGame,
  battleship: BattleshipGame,
};

const GAME_META = {
  chess:       { name: 'Winner-Takes-All Chess',    icon: '♟️', desc: 'Full chess match. Winner claims the entire pot.', players: '2' },
  tictactoe:   { name: 'Tic-Tac-Toe Arena',         icon: '⭕', desc: 'Classic 3x3. First to align three wins.', players: '2' },
  connect4:    { name: 'Connect 4 Duel',             icon: '🔴', desc: 'Drop discs. Connect 4 to win the pot.', players: '2' },
  checkers:    { name: 'Checkers Showdown',          icon: '⚫', desc: 'Standard checkers. Capture all or block.', players: '2' },
  rps:         { name: 'Rock-Paper-Scissors Duel',   icon: '✊', desc: 'Best of 1. Instant resolution.', players: '2' },
  battleship:  { name: 'Battleship Strike',          icon: '🚢', desc: 'Sink the fleet. Simplified 5x5 grid.', players: '2' },
};

export default function InteractiveGameRenderer({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/covenants/${encodeURIComponent(covenantId)}/game-state`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setGameState(data);
          setSelectedGame(data.game_type || 'chess');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [covenantId]);

  const handleCreate = async (gameType) => {
    if (!userAddress) { setMessage('Connect wallet first'); return; }
    setCreating(true);
    setMessage('');
    try {
      const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/create-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_type: gameType,
          creator_addr: userAddress,
          pot_amount_kas: covenant?.amount_kaspa || 0,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setGameState({ status: 'waiting', player1: userAddress, pot_amount_kas: covenant?.amount_kaspa || 0, game_type: gameType });
        setSelectedGame(gameType);
        setMessage(`Game created! Waiting for opponent to join.`);
      } else {
        setMessage(d.error || 'Failed to create game');
      }
    } catch (e) { setMessage('Network error'); }
    setCreating(false);
  };

  if (loading) return <div className="text-center text-gray-400 py-16 animate-pulse">Loading game state...</div>;

  // No game created yet -- show game type selector
  if (!gameState) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-4">
          <h3 className="text-xl font-bold text-white mb-2">Select a Game</h3>
          <p className="text-gray-400 text-sm">
            Choose a skill game to create. Winner takes the entire covenant pot!
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(GAME_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => handleCreate(key)}
              disabled={creating}
              className="p-5 border border-zinc-700/60 bg-zinc-900/70 rounded-2xl text-left hover:border-[#49EACB]/40 hover:shadow-[0_0_20px_rgba(73,234,203,0.1)] transition-all group"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{meta.icon}</div>
              <h4 className="text-sm font-bold text-white mb-1">{meta.name}</h4>
              <p className="text-xs text-gray-500 mb-2">{meta.desc}</p>
              <span className="text-[10px] text-[#49EACB]/70 font-mono">{meta.players} players</span>
            </button>
          ))}
        </div>
        {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center">{message}</div>}
        {creating && <div className="text-center text-gray-400 py-4 animate-pulse">Creating game...</div>}
      </div>
    );
  }

  // Fallback render for unknown game types
  const meta = GAME_META[selectedGame] || { name: 'Unknown Game', icon: '🎮' };
  const GameComponent = GAME_COMPONENTS[selectedGame] || ChessGameBoard;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{gameState.game_type === 'chess' ? '♟️' : meta.icon}</span>
        <span className="text-xs font-bold text-[#49EACB] uppercase tracking-wider">{meta.name}</span>
      </div>
      <GameComponent covenantId={covenantId} covenant={covenant} userAddress={userAddress} />
    </div>
  );
}
