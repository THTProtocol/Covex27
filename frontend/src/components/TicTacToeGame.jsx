import React, { useState, useEffect, useCallback } from 'react';

const API = {
  async fetchGame(covenantId) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/game-state`);
    return r.json();
  },
  async saveMove(covenantId, moves, currentTurn) {
    await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/make-move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: '', moves: JSON.stringify(moves), current_turn: currentTurn }),
    });
  },
  async joinGame(covenantId, player2) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/join-game`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player2 }),
    });
    return r.json();
  },
  async resolveWinner(covenantId, winner, claimer) {
    await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/resolve-winner`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner, claimer }),
    });
  },
};

function checkWinner(board) {
  const lines = [
    [[0,0],[0,1],[0,2]], [[1,0],[1,1],[1,2]], [[2,0],[2,1],[2,2]],
    [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]],
    [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]],
  ];
  for (const [a,b,c] of lines) {
    if (board[a[0]][a[1]] && board[a[0]][a[1]] === board[b[0]][b[1]] && board[a[0]][a[1]] === board[c[0]][c[1]]) {
      return board[a[0]][a[1]];
    }
  }
  return null;
}

export default function TicTacToeGame({ covenantId, covenant, userAddress }) {
  const [board, setBoard] = useState([['','',''],['','',''],['','','']]);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState('X');

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try {
          const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves;
          if (m && m.board) setBoard(m.board);
          if (m && m.currentPlayer) setCurrentPlayer(m.currentPlayer);
        } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const handleClick = useCallback(async (r, c) => {
    if (!gameState || gameState.status !== 'active') { setMessage('Game not active'); return; }
    if (board[r][c] !== '') return;
    if (gameState.winner) return;

    const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
    const myTurn = currentPlayer === 'X' ? !isWhite : isWhite;
    if (!myTurn) { setMessage('Not your turn'); return; }

    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = currentPlayer;
    setBoard(newBoard);

    const winner = checkWinner(newBoard);
    const isDraw = !winner && newBoard.every(row => row.every(cell => cell !== ''));
    const nextPlayer = currentPlayer === 'X' ? 'O' : 'X';

    const state = { board: newBoard, currentPlayer: nextPlayer };
    API.saveMove(covenantId, state, nextPlayer === 'X' ? 'X' : 'O').catch(() => {});

    if (winner) {
      setMessage(`${winner} wins the pot!`);
      const winAddr = winner === 'X' ? gameState.player1 : gameState.player2;
      API.resolveWinner(covenantId, winAddr || winner, userAddress || '').catch(() => {});
      setGameState(prev => ({ ...prev, winner: winAddr }));
    } else if (isDraw) {
      setMessage('Draw! Pot is split.');
    } else {
      setCurrentPlayer(nextPlayer);
    }
  }, [board, currentPlayer, gameState, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading board...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No game data.</div>;

  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-6 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-3">⏳</div>
        <h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        {!isCreator && (
          <button onClick={async () => { const r = await API.joinGame(covenantId, userAddress); if (r.success) { setGameState(prev => ({ ...prev, status: 'active', player2: userAddress })); setMessage('Joined!'); } else setMessage(r.error); }}
            className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>
        )}
      </div>
    );
  }

  const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
  const myTurn = currentPlayer === 'X' ? !isWhite : isWhite;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${gameState.status === 'active' && !gameState.winner ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{gameState.status}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className={`grid grid-cols-3 gap-2 p-4 bg-zinc-900/80 rounded-2xl border ${myTurn && !gameState.winner ? 'border-[#49EACB]/30 shadow-[0_0_30px_rgba(73,234,203,0.15)]' : 'border-zinc-700/60'}`}>
        {board.map((row, r) => row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            onClick={() => handleClick(r, c)}
            disabled={!myTurn || !!gameState.winner || cell !== ''}
            className={`w-20 h-20 rounded-xl text-3xl font-black transition-all ${
              cell === 'X' ? 'bg-[#49EACB]/20 border-[#49EACB]/50 text-[#49EACB]' :
              cell === 'O' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' :
              'bg-zinc-800/50 border-zinc-700/40 text-transparent hover:border-[#49EACB]/30 hover:bg-zinc-800'
            } border-2 ${!myTurn || gameState.winner ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            {cell || '·'}
          </button>
        )))}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-[#49EACB]/20 border border-[#49EACB]/50 flex items-center justify-center text-xs text-[#49EACB] font-bold">X</span>
          <span className="text-gray-500 text-xs">{gameState.player1 ? gameState.player1.slice(0, 10) + '...' : '—'}</span>
          {currentPlayer === 'X' && !gameState.winner && <span className="text-[10px] text-[#49EACB] animate-pulse">TURN</span>}
        </div>
        <span className="text-gray-700">vs</span>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-xs text-purple-400 font-bold">O</span>
          <span className="text-gray-500 text-xs">{gameState.player2 ? gameState.player2.slice(0, 10) + '...' : 'Waiting...'}</span>
          {currentPlayer === 'O' && !gameState.winner && <span className="text-[10px] text-purple-400 animate-pulse">TURN</span>}
        </div>
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}

      {gameState.winner && (
        <div className="p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-xl text-center w-full max-w-xs">
          <p className="text-yellow-400 font-bold text-sm">Winner!</p>
          <code className="text-xs text-yellow-300">{gameState.winner.slice(0, 16)}...</code>
        </div>
      )}
    </div>
  );
}
