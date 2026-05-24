import React, { useState, useEffect, useCallback } from 'react';

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

const VARIANT_META = {
  blind:    { name: 'Blind Auction', icon: '🤐', desc: 'Sealed bids. Highest wins. All bids revealed after.' },
  dutch:    { name: 'Dutch Auction', icon: '⬇️', desc: 'Price drops until someone accepts.' },
  english:  { name: 'English Auction', icon: '🔨', desc: 'Ascending bids. Last bidder wins.' },
  vickrey:  { name: 'Vickrey Auction', icon: '🤫', desc: 'Second-price sealed bid. Winner pays runner-up price.' },
  penny:    { name: 'Penny Auction', icon: '💸', desc: 'Each bid raises price 1 cent. Last bidder wins.' },
  reverse:  { name: 'Reverse Auction', icon: '🔄', desc: 'Sellers compete. Lowest price wins.' },
  allpay:   { name: 'All-Pay Auction', icon: '💰', desc: 'Everyone pays. Highest bidder wins.' },
  japanese: { name: 'Japanese Auction', icon: '🏯', desc: 'Price climbs. Drop out when too high.' },
};

export default function GenericAuctionGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [auctionData, setAuctionData] = useState({ bids: {}, status: 'open' });
  const [bidAmount, setBidAmount] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState('player1');

  const variant = covenant?.config?.variant || 'english';
  const meta = VARIANT_META[variant] || { name: 'Auction', icon: '🔨', desc: 'Bid to win.' };

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try { const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves; if (m) { setAuctionData(m); if (m.currentPlayer) setCurrentPlayer(m.currentPlayer); } } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const submitBid = useCallback(async () => {
    if (!gameState || auctionData.status !== 'open' || gameState.winner) return;
    if (!userAddress) { setMessage('Connect wallet'); return; }
    const amount = parseFloat(bidAmount);
    if (!amount || amount <= 0) { setMessage('Enter valid bid'); return; }

    const newBids = { ...auctionData.bids, [userAddress]: amount };
    let winner = null;

    if (variant === 'dutch') {
      winner = userAddress;
    } else if (variant === 'english') {
      const highest = Math.max(...Object.values(newBids));
      const bidders = Object.entries(newBids).filter(([,b]) => b === highest);
      if (bidders.length === 1) winner = bidders[0][0];
    }

    const newData = { ...auctionData, bids: newBids, highestBid: Math.max(...Object.values(newBids)), currentPlayer: currentPlayer === 'player1' ? 'player2' : 'player1' };
    if (winner) newData.status = 'closed';

    setAuctionData(newData);
    setCurrentPlayer(newData.currentPlayer);
    setBidAmount('');

    API.saveMove(covenantId, newData, newData.currentPlayer).catch(() => {});

    if (winner) {
      API.resolveWinner(covenantId, winner, userAddress || '').catch(() => {});
      setGameState(prev => ({ ...prev, winner }));
    }
    setMessage('Bid placed!');
  }, [gameState, auctionData, bidAmount, variant, userAddress, currentPlayer, covenantId]);

  const getHighestBidder = () => {
    const bids = auctionData.bids;
    if (!bids || Object.keys(bids).length === 0) return null;
    return Object.entries(bids).reduce((a, b) => (b[1] > a[1] ? b : a));
  };

  if (loading) return <div className="text-center text-gray-400 py-8">Loading...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No data.</div>;

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">🔨</div>
        <p className="text-yellow-400 font-bold text-lg">Auction Closed — {meta.name}</p>
        <code className="text-xs text-yellow-300 mt-2 block">Winner: {gameState.winner.slice(0, 20)}</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
      </div>
    );
  }

  const highest = getHighestBidder();

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${auctionData.status === 'open' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{auctionData.status}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className="p-6 border border-[#49EACB]/20 bg-zinc-900/80 rounded-2xl max-w-md w-full shadow-[0_0_30px_rgba(73,234,203,0.1)]">
        <div className="text-4xl text-center mb-4">{meta.icon}</div>
        <h3 className="text-lg font-bold text-white text-center mb-2">{meta.name}</h3>
        <p className="text-gray-400 text-sm text-center mb-6">{meta.desc}</p>

        {highest && (
          <div className="p-4 rounded-xl bg-[#49EACB]/5 border border-[#49EACB]/20 mb-4">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Highest Bid</p>
            <p className="text-2xl font-bold text-[#49EACB]">{highest[1].toLocaleString()} KAS</p>
            <p className="text-xs text-gray-400">by {highest[0].slice(0, 14)}...</p>
          </div>
        )}

        {!highest && (
          <p className="text-gray-500 text-sm text-center mb-4">No bids yet. Be the first!</p>
        )}

        {auctionData.status === 'open' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} placeholder="Bid amount (KAS)" step="0.01" min="0"
                className="flex-1 px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700 text-white text-sm placeholder-gray-500 focus:border-[#49EACB] outline-none" />
              <button onClick={submitBid} disabled={!bidAmount}
                className="px-5 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] transition-all disabled:opacity-50">
                Bid
              </button>
            </div>

            {Object.keys(auctionData.bids || {}).length > 0 && (
              <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-[10px] text-gray-500 mb-1">All Bids:</p>
                {Object.entries(auctionData.bids || {}).sort((a,b) => b[1] - a[1]).map(([addr, amt]) => (
                  <div key={addr} className="flex justify-between text-xs text-gray-400 py-1 border-b border-zinc-800/50">
                    <code className="text-gray-500">{addr.slice(0, 10)}...</code>
                    <span className="text-[#49EACB] font-mono">{amt.toLocaleString()} KAS</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}
    </div>
  );
}
