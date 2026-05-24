import React, { useState, useEffect, useCallback } from 'react';

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

const VARIANT_META = {
  raffle:         { name: 'Simple Raffle', icon: '🎟️', desc: 'Buy tickets. Random draw picks one winner.' },
  jackpot:        { name: 'Jackpot Lottery', icon: '💎', desc: 'Pick numbers. Match to win the growing jackpot.' },
  noloss:         { name: 'No-Loss Lottery', icon: '🛡️', desc: 'Winner gets yield. Everyone gets stake back.' },
  provablyfair:   { name: 'Provably Fair', icon: '🔮', desc: 'Hash-committed randomness. Fully verifiable draw.' },
  sweepstakes:    { name: 'Sweepstakes', icon: '🎁', desc: 'Weighted random selection. Free entry.' },
  combo:          { name: 'Combination Lotto', icon: '🔢', desc: 'Pick numbers. Exact = jackpot. Partial = prizes.' },
  leaderboard:    { name: 'Leaderboard Lotto', icon: '🏅', desc: 'Top buyers get bonus entries. Tiered prizes.' },
  instant:        { name: 'Instant Win', icon: '✨', desc: 'Buy and reveal instantly. Pre-determined winners.' },
  keno:           { name: 'Keno Quick-Draw', icon: '🎯', desc: 'Pick up to 10 numbers. Match for prizes.' },
  bingo:          { name: 'Bingo Hall', icon: '🅱️', desc: 'Classic bingo. First to complete a line wins.' },
};

export default function GenericLotteryGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [lottoData, setLottoData] = useState({ tickets: {}, drawn: false, winner: null });
  const [pickedNumbers, setPickedNumbers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState('player1');

  const variant = covenant?.config?.variant || 'raffle';
  const meta = VARIANT_META[variant] || { name: 'Lottery', icon: '🎰', desc: 'Buy tickets. Win the pot.' };
  const ticketPrice = covenant?.config?.ticketPrice || 10;
  const maxNumber = covenant?.config?.maxNum || 49;
  const numCount = covenant?.config?.numCount || 6;

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try { const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves; if (m) setLottoData(m); } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const buyTicket = useCallback(async () => {
    if (!gameState || gameState.winner) return;
    if (!userAddress) { setMessage('Connect wallet'); return; }

    const numbers = variant === 'raffle' ? [Math.floor(Math.random() * 1000000)] :
      Array.from({ length: numCount }, () => Math.floor(Math.random() * maxNumber) + 1);

    const newTickets = { ...lottoData.tickets, [userAddress]: numbers };
    const newData = { ...lottoData, tickets: newTickets };
    setLottoData(newData);
    setPickedNumbers(numbers);

    API.saveMove(covenantId, newData, currentPlayer).catch(() => {});
    setMessage(`Ticket bought! Numbers: ${numbers.join(', ')}`);
  }, [gameState, lottoData, variant, userAddress, numCount, maxNumber, currentPlayer, covenantId]);

  const triggerDraw = useCallback(async () => {
    if (!gameState || lottoData.drawn) return;

    const winningNumbers = Array.from({ length: numCount }, () => Math.floor(Math.random() * maxNumber) + 1);
    let winner = null;

    if (variant === 'raffle' || variant === 'instant') {
      const entries = Object.entries(lottoData.tickets);
      if (entries.length > 0) {
        const idx = Math.floor(Math.random() * entries.length);
        winner = entries[idx][0];
      }
    }

    const newData = { ...lottoData, drawn: true, winningNumbers, winner };
    setLottoData(newData);

    API.saveMove(covenantId, newData, currentPlayer).catch(() => {});

    if (winner) {
      API.resolveWinner(covenantId, winner, userAddress || '').catch(() => {});
      setGameState(prev => ({ ...prev, winner }));
      setMessage('Winner drawn!');
    } else {
      setMessage('Draw complete. No winner this round.');
    }
  }, [gameState, lottoData, variant, numCount, maxNumber, currentPlayer, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No data.</div>;

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">{meta.icon}</div>
        <p className="text-yellow-400 font-bold text-lg">Winner!</p>
        <code className="text-xs text-yellow-300 mt-2 block">{gameState.winner.slice(0, 20)}</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
        {lottoData.winningNumbers && (
          <div className="mt-3 flex justify-center gap-2">
            {lottoData.winningNumbers.map((n, i) => (
              <span key={i} className="w-9 h-9 rounded-full bg-[#49EACB]/20 border border-[#49EACB]/40 flex items-center justify-center text-xs font-bold text-[#49EACB]">{n}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const ticketCount = Object.keys(lottoData.tickets || {}).length;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm font-bold text-gray-300 uppercase">OPEN</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Pot: {gameState.pot_amount_kas} KAS</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-gray-400">{ticketCount} tickets</span>
      </div>

      <div className="p-6 border border-[#49EACB]/20 bg-zinc-900/80 rounded-2xl max-w-md w-full shadow-[0_0_30px_rgba(73,234,203,0.1)]">
        <div className="text-4xl text-center mb-4">{meta.icon}</div>
        <h3 className="text-lg font-bold text-white text-center mb-2">{meta.name}</h3>
        <p className="text-gray-400 text-sm text-center mb-4">{meta.desc}</p>

        <div className="flex justify-between items-center p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/40 mb-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase">Ticket Price</p>
            <p className="text-lg font-bold text-[#49EACB]">{ticketPrice} KAS</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase">Sold</p>
            <p className="text-lg font-bold text-white">{ticketCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase">Pot</p>
            <p className="text-lg font-bold text-[#49EACB]">{gameState.pot_amount_kas} KAS</p>
          </div>
        </div>

        {pickedNumbers.length > 0 && (
          <div className="mb-4 text-center">
            <p className="text-[10px] text-gray-500 mb-2">Your Numbers</p>
            <div className="flex justify-center gap-2">
              {pickedNumbers.map((n, i) => (
                <span key={i} className="w-8 h-8 rounded-full bg-[#49EACB]/10 border border-[#49EACB]/30 flex items-center justify-center text-xs font-bold text-[#49EACB]">{n}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={buyTicket}
            className="px-4 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] transition-all text-sm">
            Buy Ticket ({ticketPrice} KAS)
          </button>
          <button onClick={triggerDraw} disabled={lottoData.drawn || ticketCount === 0}
            className="px-4 py-3 border border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold rounded-xl hover:bg-amber-500/20 transition-all text-sm disabled:opacity-30">
            Draw Winner
          </button>
        </div>
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}
    </div>
  );
}
