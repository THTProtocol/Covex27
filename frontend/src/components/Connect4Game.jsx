import React, { useState, useEffect, useCallback } from 'react';

const ROWS = 6, COLS = 7;

function checkConnect4Winner(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (c + 3 < COLS && p === board[r][c+1] && p === board[r][c+2] && p === board[r][c+3]) return p;
      if (r + 3 < ROWS && p === board[r+1][c] && p === board[r+2][c] && p === board[r+3][c]) return p;
      if (r + 3 < ROWS && c + 3 < COLS && p === board[r+1][c+1] && p === board[r+2][c+2] && p === board[r+3][c+3]) return p;
      if (r + 3 < ROWS && c - 3 >= 0 && p === board[r+1][c-1] && p === board[r+2][c-2] && p === board[r+3][c-3]) return p;
    }
  }
  return null;
}

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

export default function Connect4Game({ covenantId, covenant, userAddress }) {
  const [board, setBoard] = useState(Array(ROWS).fill(null).map(() => Array(COLS).fill(null)));
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState('R');
  const [hoverCol, setHoverCol] = useState(null);

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try { const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves; if (m && m.board) setBoard(m.board); if (m && m.currentPlayer) setCurrentPlayer(m.currentPlayer); } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const dropDisc = useCallback(async (col) => {
    if (!gameState || gameState.status !== 'active') { setMessage('Game not active'); return; }
    if (gameState.winner) return;
    const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
    const myTurn = currentPlayer === 'R' ? !isWhite : isWhite;
    if (!myTurn) { setMessage('Not your turn'); return; }

    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) { if (!board[r][col]) { row = r; break; } }
    if (row === -1) return;

    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = currentPlayer;
    setBoard(newBoard);
    setHoverCol(null);

    const winner = checkConnect4Winner(newBoard);
    const isDraw = !winner && newBoard[0].every(c => c !== null);
    const nextPlayer = currentPlayer === 'R' ? 'Y' : 'R';

    API.saveMove(covenantId, { board: newBoard, currentPlayer: nextPlayer }, nextPlayer === 'R' ? 'R' : 'Y').catch(()=>{});

    if (winner) {
      setMessage(`${winner === 'R' ? 'RED' : 'YELLOW'} wins the pot!`);
      API.resolveWinner(covenantId, winner === 'R' ? gameState.player1 : gameState.player2, userAddress||'').catch(()=>{});
      setGameState(prev => ({ ...prev, winner: winner === 'R' ? gameState.player1 : gameState.player2 }));
    } else if (isDraw) {
      setMessage('Draw! Board is full.');
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
        <div className="text-5xl mb-3">⏳</div><h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        {!isCreator && <button onClick={async ()=>{const r=await API.joinGame(covenantId, userAddress);if(r.success){setGameState(prev=>({...prev,status:'active',player2:userAddress}));setMessage('Joined!');}else setMessage(r.error);}} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>}
      </div>
    );
  }

  const isWhite = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
  const myTurn = currentPlayer === 'R' ? !isWhite : isWhite;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${gameState.status === 'active' && !gameState.winner ? 'bg-green-400 animate-pulse':'bg-gray-500'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{gameState.status}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className={`p-3 bg-zinc-900/80 rounded-2xl border ${myTurn && !gameState.winner ? 'border-[#49EACB]/30 shadow-[0_0_30px_rgba(73,234,203,0.15)]':'border-zinc-700/60'}`}>
        <div className="flex gap-1 mb-1">
          {Array(COLS).fill(null).map((_, c) => (
            <button key={c} onClick={() => dropDisc(c)} onMouseEnter={() => setHoverCol(c)} onMouseLeave={() => setHoverCol(null)}
              disabled={!myTurn || !!gameState.winner || board[0][c] !== null}
              className={`w-11 h-8 rounded-full transition-all ${hoverCol === c && myTurn && !gameState.winner ? 'bg-[#49EACB]/30 scale-110':'bg-transparent'}`}>
              <span className="text-[16px]">{hoverCol === c && myTurn && !gameState.winner ? '⬇' : ''}</span>
            </button>
          ))}
        </div>
        {board.map((row, r) => (
          <div key={r} className="flex gap-1 mb-1">
            {row.map((cell, c) => (
              <div key={c} className={`w-11 h-11 rounded-full border-2 transition-all ${
                cell === 'R' ? 'bg-red-500 border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                cell === 'Y' ? 'bg-yellow-400 border-yellow-500 shadow-[0_0_10px_rgba(250,204,21,0.5)]' :
                'bg-zinc-800 border-zinc-700/50'
              }`} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          <span className="text-gray-500 text-xs">{gameState.player1 ? gameState.player1.slice(0,10)+'...':'—'}</span>
          {currentPlayer==='R' && !gameState.winner && <span className="text-[10px] text-red-400 animate-pulse">TURN</span>}
        </div>
        <span className="text-gray-700">vs</span>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
          <span className="text-gray-500 text-xs">{gameState.player2 ? gameState.player2.slice(0,10)+'...':'Waiting...'}</span>
          {currentPlayer==='Y' && !gameState.winner && <span className="text-[10px] text-yellow-400 animate-pulse">TURN</span>}
        </div>
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-sm">{message}</div>}
      {gameState.winner && <div className="p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-xl text-center w-full max-w-sm"><p className="text-yellow-400 font-bold text-sm">Winner!</p><code className="text-xs text-yellow-300">{gameState.winner.slice(0,16)}...</code></div>}
    </div>
  );
}
