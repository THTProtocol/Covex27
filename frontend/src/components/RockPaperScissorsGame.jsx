import React, { useState, useEffect, useCallback } from 'react';

const CHOICES = [
  { id: 'rock', icon: '✊', label: 'Rock', beats: 'scissors' },
  { id: 'paper', icon: '✋', label: 'Paper', beats: 'rock' },
  { id: 'scissors', icon: '✌️', label: 'Scissors', beats: 'paper' },
];

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, move) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(move), current_turn: move.player1 && move.player2 ? 'done' : 'r'}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

export default function RockPaperScissorsGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState(null);
  const [p1Choice, setP1Choice] = useState(null);
  const [p2Choice, setP2Choice] = useState(null);
  const [resolvedDone, setResolvedDone] = useState(false);

  const resolveFromMoves = useCallback((movesData) => {
    try {
      const m = typeof movesData === 'string' ? JSON.parse(movesData) : movesData;
      if (!m) return null;
      if (m.result) return { p1: m.player1, p2: m.player2, result: m.result };
      if (m.player1 && m.player2) {
        const p1Obj = CHOICES.find(c => c.id === m.player1);
        const cObj = CHOICES.find(c => c.id === m.player2);
        if (p1Obj && cObj) {
          if (m.player1 === m.player2) return { p1: m.player1, p2: m.player2, result: 'draw' };
          if (p1Obj.beats === m.player2) return { p1: m.player1, p2: m.player2, result: 'player1' };
          return { p1: m.player1, p2: m.player2, result: 'player2' };
        }
      }
      if (m.player1) return { p1: m.player1, p2: null, result: null };
    } catch(_){}
    return null;
  }, []);

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        const resolved = resolveFromMoves(data.moves);
        if (resolved) {
          setP1Choice(resolved.p1);
          setP2Choice(resolved.p2);
          setResult(resolved.result);
          if (resolved.result && resolved.result !== 'draw' && !data.winner && !resolvedDone) {
            const winner = resolved.result === 'player1' ? data.player1 : data.player2;
            API.resolveWinner(covenantId, winner, userAddress || '').catch(()=>{});
            setGameState(prev => ({ ...prev, winner }));
            setResolvedDone(true);
          }
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId, resolveFromMoves, userAddress, resolvedDone]);

  const handlePick = useCallback(async (choice) => {
    if (!gameState || picking || gameState.winner || result) return;
    
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    const isPlayer2 = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
    
    if (!isCreator && !isPlayer2) { setMessage('Not a player in this game'); return; }

    setPicking(true);
    setMessage('');

    if (isCreator && !p1Choice) {
      const move = { player1: choice };
      await API.saveMove(covenantId, move);
      setP1Choice(choice);
    } else if (isPlayer2 && !p2Choice) {
      const move = { player1: p1Choice, player2: choice };
      await API.saveMove(covenantId, move);
      setP2Choice(choice);

      const resolved = resolveFromMoves(move);
      if (resolved) {
        setResult(resolved.result);
        if (resolved.result && resolved.result !== 'draw') {
          const winner = resolved.result === 'player1' ? gameState.player1 : gameState.player2;
          API.resolveWinner(covenantId, winner, userAddress||'').catch(()=>{});
          setGameState(prev => ({ ...prev, winner }));
        }
      }
    }

    setPicking(false);
  }, [gameState, picking, p1Choice, p2Choice, result, userAddress, covenantId, resolveFromMoves]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No game data.</div>;

  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-6 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-3">⏳</div>
        <h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        {!isCreator && <button onClick={async ()=>{const r=await API.joinGame(covenantId, userAddress);if(r.success){setGameState(prev=>({...prev,status:'active',player2:userAddress}));}else setMessage(r.error);}} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>}
      </div>
    );
  }

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">🏆</div>
        <p className="text-yellow-400 font-bold text-lg">Game Over!</p>
        <code className="text-xs text-yellow-300 mt-2 block">{gameState.winner.slice(0, 20)} claims the pot</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
        {result && (
          <div className="flex justify-center gap-8 mt-4">
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Player 1</p>
              <span className="text-4xl">{CHOICES.find(c => c.id === p1Choice)?.icon || '?'}</span>
              <p className="text-[10px] text-gray-600 mt-1">{CHOICES.find(c => c.id === p1Choice)?.label || '?'}</p>
            </div>
            <div className="flex items-center text-gray-600 font-bold text-lg">VS</div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Player 2</p>
              <span className="text-4xl">{CHOICES.find(c => c.id === p2Choice)?.icon || '?'}</span>
              <p className="text-[10px] text-gray-600 mt-1">{CHOICES.find(c => c.id === p2Choice)?.label || '?'}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
  const isPlayer2 = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
  const needsMyPick = (isCreator && !p1Choice) || (isPlayer2 && !p2Choice);
  const waitingForOpponent = (isCreator && p1Choice && !p2Choice) || (isPlayer2 && p2Choice && !p1Choice);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm font-bold text-gray-300 uppercase">active</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      {waitingForOpponent && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400 text-center">Your choice is locked. Waiting for opponent...</div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {CHOICES.map(choice => {
          const isChosen = (p1Choice === choice.id) || (p2Choice === choice.id);
          return (
            <button
              key={choice.id}
              onClick={() => handlePick(choice.id)}
              disabled={!needsMyPick || picking}
              className={`p-5 rounded-2xl border-2 transition-all text-center ${
                isChosen
                  ? 'border-[#49EACB]/60 bg-[#49EACB]/10 shadow-[0_0_20px_rgba(73,234,203,0.25)] ring-1 ring-[#49EACB]/30'
                  : needsMyPick
                    ? 'border-zinc-700/60 bg-zinc-900/70 hover:border-[#49EACB]/50 hover:shadow-[0_0_25px_rgba(73,234,203,0.2)] hover:-translate-y-1 cursor-pointer'
                    : 'border-zinc-800/60 bg-zinc-900/50 opacity-40 cursor-not-allowed'
              }`}
            >
              <div className="text-5xl mb-2">{choice.icon}</div>
              <div className="text-sm font-bold text-white">{choice.label}</div>
              <div className="text-[10px] text-gray-500 mt-1">Beats {CHOICES.find(c => c.id === choice.beats)?.label}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">{gameState.player1.slice(0, 10)}...</span>
          {p1Choice ? <span className="text-2xl">{CHOICES.find(c => c.id === p1Choice)?.icon}</span> : <span className="text-[10px] text-gray-600 animate-pulse">picking...</span>}
        </div>
        <span className="text-gray-700 font-bold">vs</span>
        <div className="flex items-center gap-2">
          {p2Choice ? <span className="text-2xl">{CHOICES.find(c => c.id === p2Choice)?.icon}</span> : <span className="text-[10px] text-gray-600 animate-pulse">picking...</span>}
          <span className="text-gray-500 text-xs">{gameState.player2 ? gameState.player2.slice(0, 10) + '...' : 'Waiting...'}</span>
        </div>
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}
    </div>
  );
}
