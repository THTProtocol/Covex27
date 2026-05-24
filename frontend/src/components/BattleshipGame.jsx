import React, { useState, useEffect, useCallback } from 'react';

const GRID = 5;
const SHIPS = [{ name: 'Carrier', size: 3 }];

function emptyGrid() { return Array(GRID).fill(null).map(() => Array(GRID).fill(null)); }
function randomShips() {
  const g = emptyGrid();
  for (const ship of SHIPS) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() > 0.5;
      const r = Math.floor(Math.random() * GRID);
      const c = Math.floor(Math.random() * (GRID - ship.size + 1));
      if (horizontal && c + ship.size <= GRID) {
        let clear = true;
        for (let i = 0; i < ship.size; i++) { if (g[r][c + i]) { clear = false; break; } }
        if (clear) { for (let i = 0; i < ship.size; i++) g[r][c + i] = 'S'; placed = true; }
      } else if (!horizontal && r + ship.size <= GRID) {
        let clear = true;
        for (let i = 0; i < ship.size; i++) { if (g[r + i][c]) { clear = false; break; } }
        if (clear) { for (let i = 0; i < ship.size; i++) g[r + i][c] = 'S'; placed = true; }
      }
    }
  }
  return g;
}

function allSunk(grid) { return grid.every(row => row.every(cell => cell !== 'S')); }

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

export default function BattleshipGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [myShips, setMyShips] = useState(null);
  const [opponentShips, setOpponentShips] = useState(null);
  const [myHits, setMyHits] = useState(emptyGrid());
  const [opponentHits, setOpponentHits] = useState(emptyGrid());
  const [currentPlayer, setCurrentPlayer] = useState('player1');
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try {
          const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves;
          if (m) {
            if (m.myShips) setMyShips(m.myShips);
            if (m.opponentShips) setOpponentShips(m.opponentShips);
            if (m.myHits) setMyHits(m.myHits);
            if (m.opponentHits) setOpponentHits(m.opponentHits);
            if (m.currentPlayer) setCurrentPlayer(m.currentPlayer);
            if (m.myShips && m.opponentShips) setSetupDone(true);
          }
        } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const setupShips = useCallback(() => {
    const ships = randomShips();
    setMyShips(ships);
  }, []);

  const finalizeSetup = useCallback(async () => {
    if (!myShips) { setMessage('Place your ships first'); return; }
    if (!gameState) return;

    if (!opponentShips) {
      const moves = { myShips, opponentShips: null, myHits, opponentHits, currentPlayer: 'player1' };
      API.saveMove(covenantId, moves, 'player1').catch(() => {});
      setSetupDone(true);
      setMessage('Waiting for opponent to finish setup...');
      return;
    }

    setSetupDone(true);
    setMessage('Game on! Click opponent grid to fire.');
  }, [myShips, opponentShips, myHits, opponentHits, gameState, covenantId]);

  const fire = useCallback(async (r, c) => {
    if (!gameState || gameState.status !== 'active' || gameState.winner) return;
    if (!setupDone) return;
    if (opponentHits[r][c] !== null) { setMessage('Already fired there!'); return; }

    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    const myRole = isCreator ? 'player1' : 'player2';
    if (currentPlayer !== myRole) { setMessage('Not your turn'); return; }

    const newOppHits = opponentHits.map(row => [...row]);
    const hit = opponentShips[r][c] === 'S';
    newOppHits[r][c] = hit ? 'hit' : 'miss';
    setOpponentHits(newOppHits);

    const nextPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';
    const moves = { myShips, opponentShips, myHits: opponentHits, opponentHits: newOppHits, currentPlayer: nextPlayer };
    API.saveMove(covenantId, moves, nextPlayer).catch(() => {});
    setCurrentPlayer(nextPlayer);

    if (hit && allSunk(opponentShips.map((row, rr) => row.map((cell, cc) => {
      if (rr === r && cc === c) return null;
      return cell;
    })))) {
      setMessage('All ships sunk! You win the pot!');
      API.resolveWinner(covenantId, userAddress || '', userAddress || '').catch(() => {});
      setGameState(prev => ({ ...prev, winner: userAddress }));
    }
  }, [gameState, setupDone, opponentHits, opponentShips, myShips, currentPlayer, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No game data.</div>;

  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-6 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-3">⏳</div>
        <h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        {!isCreator && <button onClick={() => { API.joinGame(covenantId, userAddress).then(r => { if(r.success){ setGameState(prev => ({ ...prev, status: 'active', player2: userAddress })); } }); }} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>}
      </div>
    );
  }

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">🏆</div>
        <p className="text-yellow-400 font-bold text-lg">Victory!</p>
        <code className="text-xs text-yellow-300 mt-2 block">{gameState.winner.slice(0, 20)}</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
      </div>
    );
  }

  if (!setupDone && !opponentShips) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-bold text-gray-300 uppercase">SETUP PHASE</span>
        </div>

        {!myShips ? (
          <button onClick={setupShips} className="px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] transition-all">
            Randomize Ships
          </button>
        ) : (
          <div>
            <p className="text-gray-400 text-xs text-center mb-3">Your fleet (3x Carrier)</p>
            <div className="p-2 bg-zinc-900/80 rounded-xl border border-[#49EACB]/20">
              {myShips.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => (
                    <div key={c} className={`w-10 h-10 border border-zinc-800/50 flex items-center justify-center text-xs ${cell === 'S' ? 'bg-[#49EACB]/20 text-[#49EACB]' : 'bg-zinc-800/30 text-gray-700'}`}>
                      {cell === 'S' ? '■' : '·'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3 justify-center">
              <button onClick={setupShips} className="px-4 py-1.5 text-xs border border-zinc-600 rounded-lg text-gray-400 hover:text-white transition-colors">Randomize</button>
              <button onClick={finalizeSetup} className="px-4 py-1.5 text-xs bg-[#49EACB] text-black font-bold rounded-lg hover:shadow-[0_0_15px_rgba(73,234,203,0.4)] transition-all">Lock In</button>
            </div>
          </div>
        )}
        {message && <div className="text-sm text-[#49EACB]">{message}</div>}
      </div>
    );
  }

  const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
  const myRole = isCreator ? 'player1' : 'player2';
  const myTurn = currentPlayer === myRole && !!opponentShips;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${myTurn ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{myTurn ? 'YOUR TURN' : 'OPPONENT TURN'}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] text-gray-500 uppercase mb-2 text-center">Your Fleet</p>
          <div className="p-2 bg-zinc-900/80 rounded-xl border border-red-500/20">
            {myShips && myShips.map((row, r) => (
              <div key={r} className="flex">
                {row.map((cell, c) => {
                  const hit = myHits?.[r]?.[c];
                  return (
                    <div key={c} className={`w-9 h-9 border border-zinc-800/50 flex items-center justify-center text-xs ${
                      hit === 'hit' ? 'bg-red-500/30 text-red-400' :
                      hit === 'miss' ? 'bg-zinc-800/30 text-gray-700' :
                      cell === 'S' ? 'bg-[#49EACB]/20 text-[#49EACB]' : 'bg-zinc-800/30 text-gray-700'
                    }`}>
                      {hit === 'hit' ? '✕' : hit === 'miss' ? '○' : cell === 'S' ? '■' : '·'}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] text-gray-500 uppercase mb-2 text-center">Enemy Waters</p>
          <div className="p-2 bg-zinc-900/80 rounded-xl border border-[#49EACB]/20">
            {opponentHits.map((row, r) => (
              <div key={r} className="flex">
                {row.map((cell, c) => (
                  <button key={c} onClick={() => fire(r, c)}
                    disabled={!myTurn || cell !== null}
                    className={`w-9 h-9 border border-zinc-800/50 flex items-center justify-center text-xs transition-all ${
                      cell === 'hit' ? 'bg-red-500/30 text-red-400' :
                      cell === 'miss' ? 'bg-zinc-800/30 text-gray-600' :
                      myTurn ? 'bg-zinc-800/50 hover:bg-[#49EACB]/10 hover:border-[#49EACB]/30 cursor-crosshair' :
                      'bg-zinc-800/30 cursor-not-allowed'
                    }`}>
                    {cell === 'hit' ? '✕' : cell === 'miss' ? '○' : ''}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-sm">{message}</div>}
    </div>
  );
}
