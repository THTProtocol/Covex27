import React, { useState, useEffect, useCallback } from 'react';

const SIZE = 8;

function initCheckersBoard() {
  const b = Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) b[r][c] = 'b';
    }
  }
  for (let r = SIZE - 3; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) b[r][c] = 'r';
    }
  }
  return b;
}

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

function getValidMoves(board, r, c, player) {
  const dir = player === 'r' ? -1 : 1;
  const moves = [];
  const king = board[r][c] === (player === 'r' ? 'R' : 'B');
  const directions = king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[dir,-1],[dir,1]];

  for (const [dr, dc] of directions) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !board[nr][nc]) {
      moves.push([nr, nc]);
    }
    const cr = r + 2*dr, cc = c + 2*dc;
    const jr = r + dr, jc = c + dc;
    if (cr >= 0 && cr < SIZE && cc >= 0 && cc < SIZE && !board[cr][cc] && board[jr][jc] && board[jr][jc][0].toLowerCase() !== player) {
      moves.push([cr, cc]);
    }
  }
  return moves;
}

function hasAnyMoves(board, player) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] && board[r][c][0].toLowerCase() === player) {
        if (getValidMoves(board, r, c, player).length > 0) return true;
      }
    }
  }
  return false;
}

export default function CheckersGame({ covenantId, covenant, userAddress }) {
  const [board, setBoard] = useState(initCheckersBoard());
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState('r');

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try { const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves; if (m && m.board) setBoard(m.board); if (m && m.currentPlayer) setCurrentPlayer(m.currentPlayer); } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const handleClick = useCallback(async (r, c) => {
    if (!gameState || gameState.status !== 'active') { setMessage('Game not active'); return; }
    if (gameState.winner) return;
    const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
    const myTurn = currentPlayer === 'r' ? !isWhite : isWhite;
    if (!myTurn) { setMessage('Not your turn'); return; }

    const piece = board[r][c];

    if (piece && piece[0].toLowerCase() === currentPlayer && !selected) {
      const moves = getValidMoves(board, r, c, currentPlayer);
      if (moves.length === 0) return;
      setSelected([r, c]);
      setValidMoves(moves);
      return;
    }

    if (selected) {
      const isMove = validMoves.some(([mr, mc]) => mr === r && mc === c);
      if (!isMove) { setSelected(null); setValidMoves([]); return; }

      const newBoard = board.map(row => [...row]);
      const [sr, sc] = selected;
      const piece = newBoard[sr][sc];

      if (Math.abs(r - sr) === 2) {
        const jr = (r + sr) / 2, jc = (c + sc) / 2;
        newBoard[jr][jc] = null;
      }

      newBoard[r][c] = piece;
      newBoard[sr][sc] = null;

      if (piece === 'r' && r === 0) newBoard[r][c] = 'R';
      if (piece === 'b' && r === SIZE - 1) newBoard[r][c] = 'B';

      setBoard(newBoard);
      setSelected(null);
      setValidMoves([]);

      const nextPlayer = currentPlayer === 'r' ? 'b' : 'r';
      if (!hasAnyMoves(newBoard, nextPlayer)) {
        const winner = nextPlayer === 'r' ? 'b' : 'r';
        setMessage(`${winner === 'r' ? 'RED' : 'BLACK'} wins!`);
        API.resolveWinner(covenantId, winner === 'r' ? gameState.player1 : gameState.player2, userAddress||'').catch(()=>{});
        setGameState(prev => ({ ...prev, winner: winner === 'r' ? gameState.player1 : gameState.player2 }));
        return;
      }

      API.saveMove(covenantId, { board: newBoard, currentPlayer: nextPlayer }, nextPlayer).catch(()=>{});
      setCurrentPlayer(nextPlayer);
    }
  }, [board, currentPlayer, gameState, selected, validMoves, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading board...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No game data.</div>;

  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-6 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-3">⏳</div><h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        {!isCreator && <button onClick={async ()=>{const r=await API.joinGame(covenantId, userAddress);if(r.success){setGameState(prev=>({...prev,status:'active',player2:userAddress}));setMessage('Joined!');}else setMessage(r.error);}} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>}
      </div>
    );
  }

  const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
  const myTurn = currentPlayer === 'r' ? !isWhite : isWhite;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${gameState.status === 'active' && !gameState.winner ? 'bg-green-400 animate-pulse':'bg-gray-500'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{gameState.status}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className={`p-2 bg-zinc-900/80 rounded-2xl border ${myTurn && !gameState.winner ? 'border-[#49EACB]/30 shadow-[0_0_30px_rgba(73,234,203,0.15)]':'border-zinc-700/60'}`}>
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => {
              const isDark = (r + c) % 2 === 1;
              const isSelected = selected && selected[0] === r && selected[1] === c;
              const isValidMove = validMoves.some(([mr, mc]) => mr === r && mc === c);
              const isKing = cell === 'R' || cell === 'B';

              return (
                <button key={c} onClick={() => handleClick(r, c)}
                  className={`w-11 h-11 flex items-center justify-center transition-all ${
                    isDark ? 'bg-[#1a1a2e]' : 'bg-[#0d1b2a]'
                  } ${isSelected ? 'ring-2 ring-[#49EACB] ring-inset' : ''} ${isValidMove ? 'ring-2 ring-yellow-400/50 ring-inset' : ''}`}>
                  {cell && (
                    <div className={`w-8 h-8 rounded-full border-2 transition-all ${
                      isSelected ? 'scale-110' : ''
                    } ${
                      cell[0].toLowerCase() === 'r'
                        ? 'bg-red-500 border-red-600 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                        : 'bg-gray-900 border-gray-700 shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                    } flex items-center justify-center`}>
                      {isKing && <span className="text-[10px] text-yellow-400 font-bold">♛</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-red-500" /><span className="text-gray-500 text-xs">{gameState.player1 ? gameState.player1.slice(0,10)+'...':'—'}</span>
          {currentPlayer==='r' && <span className="text-[10px] text-red-400 animate-pulse">TURN</span>}
        </div>
        <span className="text-gray-700">vs</span>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-gray-900 border border-gray-600" /><span className="text-gray-500 text-xs">{gameState.player2 ? gameState.player2.slice(0,10)+'...':'Waiting...'}</span>
          {currentPlayer==='b' && <span className="text-[10px] text-gray-300 animate-pulse">TURN</span>}
        </div>
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-sm">{message}</div>}
      {gameState.winner && <div className="p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-xl text-center w-full max-w-sm"><p className="text-yellow-400 font-bold text-sm">Winner!</p><code className="text-xs text-yellow-300">{gameState.winner.slice(0,16)}...</code></div>}
    </div>
  );
}
