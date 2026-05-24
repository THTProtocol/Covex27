import React, { useState, useEffect, useCallback } from 'react';

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const CARD_VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildDeck() {
  const d = [];
  for (const s of CARD_SUITS) for (const v of CARD_VALUES) d.push({ suit: s, value: v });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

const VARIANT_META = {
  blackjack: { name: 'Blackjack', icon: '🃏', desc: 'Get closer to 21 than opponent without busting.' },
  poker:     { name: 'Texas Hold\'em', icon: '♠️', desc: 'Two-card hands + community cards. Best hand wins.' },
  hilo:      { name: 'Higher or Lower', icon: '🔺', desc: 'Guess if next card is higher. Build your streak.' },
  coinflip:  { name: 'Coin Flip', icon: '🪙', desc: 'Heads or tails. Pure 50/50 wager.' },
  war:       { name: 'Card War', icon: '⚔️', desc: 'Each player reveals a card. Highest wins the round.' },
  roulette:  { name: 'Roulette', icon: '🎡', desc: 'Place bets. Wheel decides the winner.' },
  dice:      { name: 'Dice Duel', icon: '🎲', desc: 'Both roll. Higher total wins.' },
  baccarat:  { name: 'Baccarat', icon: '9️⃣', desc: 'Closest to 9 wins. Simplified rules.' },
  craps:     { name: 'Craps', icon: '🎲', desc: 'Pass line. First roll 7/11 wins.' },
};

export default function GenericCardGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [deck, setDeck] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState('player1');
  const [gameData, setGameData] = useState({});
  const [picked, setPicked] = useState(null);

  const variant = covenant?.config?.variant || 'blackjack';
  const meta = VARIANT_META[variant] || { name: 'Card Game', icon: '🃏', desc: 'Casino-style card game.' };

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try {
          const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves;
          if (m) { setGameData(m); if (m.deck) setDeck(m.deck); if (m.currentPlayer) setCurrentPlayer(m.currentPlayer); }
        } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const deal = useCallback(() => {
    const d = buildDeck();
    setDeck(d);
    setPicked(null);
    const newData = { ...gameData, deck: d, stage: 'ready', currentPlayer: 'player1' };
    setGameData(newData);
    API.saveMove(covenantId, newData, 'player1').catch(() => {});
  }, [gameData, covenantId]);

  const handleAction = useCallback(async (action, value) => {
    if (!gameState || gameState.status !== 'active' || gameState.winner) return;
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    const isPlayer2 = userAddress && gameState.player2 && userAddress.toLowerCase() === gameState.player2.toLowerCase();
    if (!isCreator && !isPlayer2) { setMessage('Not a player'); return; }
    const myRole = isCreator ? 'player1' : 'player2';
    if (currentPlayer !== myRole) { setMessage('Not your turn'); return; }

    setPicked(value);
    const newData = { ...gameData, [action + '_' + myRole]: value, currentPlayer: currentPlayer === 'player1' ? 'player2' : 'player1' };
    if (action === 'pick' && value) newData.picked = value;
    setGameData(newData);
    setCurrentPlayer(newData.currentPlayer);

    API.saveMove(covenantId, newData, newData.currentPlayer).catch(() => {});

    if (action === 'winner') {
      const winAddr = value === 'player1' ? gameState.player1 : gameState.player2;
      API.resolveWinner(covenantId, winAddr, userAddress || '').catch(() => {});
      setGameState(prev => ({ ...prev, winner: winAddr }));
    }
  }, [gameState, gameData, currentPlayer, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No game data.</div>;

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">{meta.icon}</div>
        <p className="text-yellow-400 font-bold text-lg">{meta.name} — Game Over!</p>
        <code className="text-xs text-yellow-300 mt-2 block">{gameState.winner.slice(0, 20)}</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
      </div>
    );
  }

  if (gameState.status === 'waiting') {
    const isCreator = userAddress && gameState.player1.toLowerCase() === userAddress.toLowerCase();
    return (
      <div className="p-6 border border-amber-500/30 bg-zinc-900/70 rounded-2xl text-center">
        <div className="text-5xl mb-3">⏳</div>
        <h3 className="text-lg font-bold text-amber-400 mb-2">Waiting for Opponent</h3>
        <p className="text-gray-400 text-sm mb-2">Game: <span className="text-white">{meta.name}</span></p>
        <p className="text-gray-400 text-sm mb-2">Pot: <span className="text-[#49EACB] font-bold">{gameState.pot_amount_kas} KAS</span></p>
        {!isCreator && <button onClick={() => { API.joinGame(covenantId, userAddress).then(r => { if(r.success){ setGameState(prev => ({ ...prev, status: 'active', player2: userAddress })); } }); }} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">Join Game</button>}
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

      <div className="p-6 border border-[#49EACB]/20 bg-zinc-900/80 rounded-2xl max-w-md w-full shadow-[0_0_30px_rgba(73,234,203,0.1)]">
        <div className="text-4xl text-center mb-4">{meta.icon}</div>
        <h3 className="text-lg font-bold text-white text-center mb-2">{meta.name}</h3>
        <p className="text-gray-400 text-sm text-center mb-6">{meta.desc}</p>

        {/* Card display */}
        <div className="flex justify-center gap-4 mb-6">
          {deck.slice(0, 3).map((card, i) => (
            <div key={i} className="w-16 h-24 rounded-xl border-2 border-[#49EACB]/30 bg-[#0A0A0D] flex flex-col items-center justify-center shadow-[0_0_15px_rgba(73,234,203,0.15)]">
              <span className={`text-xl ${card.suit === '♥' || card.suit === '♦' ? 'text-red-400' : 'text-white'}`}>{card.suit}</span>
              <span className="text-sm font-bold text-gray-300">{card.value}</span>
            </div>
          ))}
          {deck.length === 0 && (
            <p className="text-gray-600 text-sm">Deal to begin</p>
          )}
        </div>

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

        {deck.length === 0 && myTurn && (
          <button onClick={deal} className="w-full px-5 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] transition-all">
            Deal Cards
          </button>
        )}

        {myTurn && deck.length > 0 && !picked && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 text-center">Choose your action:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleAction('pick', 'play')} className="px-4 py-2 bg-[#49EACB] hover:bg-[#3cd8b6] text-black text-sm font-bold rounded-xl transition-all">
                Play / Hit
              </button>
              <button onClick={() => handleAction('pick', 'stand')} className="px-4 py-2 border border-zinc-600 text-gray-400 text-sm font-bold rounded-xl hover:border-zinc-400 transition-all">
                Stand / Pass
              </button>
            </div>
            <button onClick={() => handleAction('winner', myRole === 'player1' ? 'player2' : 'player1')}
              className="w-full px-4 py-2 border border-red-500/30 bg-red-500/5 text-red-400 text-xs rounded-xl hover:bg-red-500/10 transition-colors">
              Fold / Forfeit
            </button>
          </div>
        )}

        {!myTurn && deck.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400 text-center">
            Waiting for opponent...
          </div>
        )}
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}
    </div>
  );
}
