import React, { useState, useEffect, useCallback } from 'react';

// Generic turn-based game renderer for templates without bespoke components
// Uses the shared skill_games backend but with a generic board + turn indicator

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

const VARIANT_META = {
  memory:   { name: 'Memory Match', icon: '🧠', desc: 'Flip two cards per turn. Match pairs to score points.' },
  reversi:  { name: 'Reversi', icon: '⚪', desc: 'Place discs to capture opponent pieces.' },
  go:       { name: 'Go', icon: '♟️', desc: 'Territory capture. Surround to claim.' },
  mancala:  { name: 'Mancala', icon: '🕳️', desc: 'Sow seeds. Capture from opponent.' },
  dots:     { name: 'Dots & Boxes', icon: '📦', desc: 'Connect dots. Claim boxes.' },
  nim:      { name: 'Nim', icon: '📊', desc: 'Remove counters strategically.' },
  wordle:   { name: 'Wordle Duel', icon: '📝', desc: 'Guess the hidden word.' },
  hangman:  { name: 'Hangman', icon: '🪢', desc: 'Guess letters before the man hangs.' },
  sudoku:   { name: 'Sudoku Race', icon: '🔢', desc: 'Fill the grid. Fastest wins.' },
};

export default function GenericTurnBasedGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState('player1');
  const [gameData, setGameData] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const variant = covenant?.config?.variant || 'generic';
  const meta = VARIANT_META[variant] || { name: 'Turn-Based Game', icon: '🎮', desc: 'Player versus player turn-based game.' };

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try { const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves; if (m) { setGameData(m); if (m.currentPlayer) setCurrentPlayer(m.currentPlayer); } } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const handleSubmitAction = useCallback(async (action, value) => {
    if (!gameState || gameState.status !== 'active' || gameState.winner) return;
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    const isPlayer2 = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
    if (!isCreator && !isPlayer2) { setMessage('Not a player'); return; }
    const myRole = isCreator ? 'player1' : 'player2';
    if (currentPlayer !== myRole) { setMessage('Not your turn'); return; }

    const newData = { ...gameData, [action]: value, currentPlayer: currentPlayer === 'player1' ? 'player2' : 'player1' };
    setGameData(newData);
    setCurrentPlayer(newData.currentPlayer);
    setSubmitted(true);

    API.saveMove(covenantId, newData, newData.currentPlayer).catch(() => {});

    if (action === 'winner') {
      API.resolveWinner(covenantId, value === 'player1' ? gameState.player1 : gameState.player2, userAddress||'').catch(()=>{});
      setGameState(prev => ({ ...prev, winner: value === 'player1' ? gameState.player1 : gameState.player2 }));
    }
  }, [gameState, gameData, currentPlayer, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading game...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No game data.</div>;

  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-6 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-3">⏳</div>
        <h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Game: <span className="text-white">{meta.name}</span></p>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        <p className="text-gray-500 text-xs mb-4">{meta.desc}</p>
        {!isCreator && <button onClick={() => { API.joinGame(covenantId, userAddress).then(r => { if(r.success){ setGameState(prev => ({ ...prev, status: 'active', player2: userAddress })); } }); }} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>}
      </div>
    );
  }

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">🏆</div>
        <p className="text-yellow-400 font-bold text-lg">Game Over — {meta.name}</p>
        <code className="text-xs text-yellow-300 mt-2 block">{gameState.winner.slice(0, 20)} claims the pot</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
      </div>
    );
  }

  const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
  const myRole = isCreator ? 'player1' : 'player2';
  const myTurn = currentPlayer === myRole;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${myTurn ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{myTurn ? 'YOUR TURN' : 'OPPONENT TURN'}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className="p-6 border border-zinc-700/60 bg-zinc-900/70 rounded-2xl text-center max-w-md w-full">
        <div className="text-5xl mb-4">{meta.icon}</div>
        <h3 className="text-lg font-bold text-white mb-2">{meta.name}</h3>
        <p className="text-gray-400 text-sm mb-6">{meta.desc}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/40">
            <p className="text-[10px] text-gray-500 mb-1">Player 1</p>
            <code className="text-xs text-[#49EACB]">{gameState.player1.slice(0, 12)}...</code>
            {currentPlayer === 'player1' && <div className="mt-1 text-[10px] text-green-400 animate-pulse">TURN</div>}
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/40">
            <p className="text-[10px] text-gray-500 mb-1">Player 2</p>
            <code className="text-xs text-purple-400">{gameState.player2 ? gameState.player2.slice(0, 12) + '...' : 'Waiting...'}</code>
            {currentPlayer === 'player2' && <div className="mt-1 text-[10px] text-purple-400 animate-pulse">TURN</div>}
          </div>
        </div>

        {myTurn && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Take your action:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleSubmitAction('move', 'played')} disabled={submitted}
                className="px-4 py-2 bg-[#49EACB] hover:bg-[#3cd8b6] text-black text-sm font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(73,234,203,0.3)]">
                Make Move
              </button>
              <button onClick={() => handleSubmitAction('pass', true)} disabled={submitted}
                className="px-4 py-2 border border-zinc-600 text-gray-400 text-sm font-bold rounded-xl hover:border-zinc-400 hover:text-white transition-all">
                Pass
              </button>
            </div>
            <button onClick={() => handleSubmitAction('winner', myRole === 'player1' ? 'player2' : 'player1')}
              className="w-full px-4 py-2 border border-red-500/30 bg-red-500/5 text-red-400 text-xs rounded-xl hover:bg-red-500/10 transition-colors">
              Forfeit / Resign
            </button>
          </div>
        )}

        {!myTurn && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
            Waiting for opponent's move...
          </div>
        )}
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}
    </div>
  );
}
