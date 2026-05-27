import React, { useState } from 'react';

const SUITS = { spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const VALUES = { A: 11, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 10, Q: 10, K: 10 };

const randomCard = () => {
  const suits = Object.values(SUITS);
  const suit = suits[Math.floor(Math.random() * 4)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { suit, rank, value: VALUES[rank], isRed: suit === SUITS.hearts || suit === SUITS.diamonds };
};

const handValue = (cards) => {
  let total = cards.reduce((s, c) => s + c.value, 0);
  let aces = cards.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};

const newGame = () => {
  const player = [randomCard(), randomCard()];
  const dealer = [randomCard(), randomCard()];
  const score = handValue(player);
  if (score === 21) return { player, dealer, status: 'blackjack', isWin: true };
  return { player, dealer, status: 'playing', isWin: false };
};

const BlackjackMini = ({ compact = false }) => {
  const [game, setGame] = useState(() => newGame());

  const hit = (e) => {
    e.stopPropagation();
    setGame(prev => {
      const player = [...prev.player, randomCard()];
      const val = handValue(player);
      if (val > 21) return { ...prev, player, status: 'bust', isWin: false };
      if (val === 21) return { ...prev, player, status: 'stand', isWin: false };
      return { ...prev, player, status: 'playing', isWin: false };
    });
  };

  const stand = (e) => {
    e.stopPropagation();
    setGame(prev => {
      // Dealer draws
      const dealer = [...prev.dealer];
      while (handValue(dealer) < 17) dealer.push(randomCard());
      const dVal = handValue(dealer);
      const pVal = handValue(prev.player);
      const isWin = dVal > 21 || pVal > dVal;
      const isPush = pVal === dVal && !isWin;
      return {
        ...prev,
        dealer,
        status: isPush ? 'push' : (isWin ? 'win' : 'dealer_win'),
        isWin: isPush ? null : isWin,
      };
    });
  };

  const reset = (e) => {
    e.stopPropagation();
    setGame(newGame());
  };

  const renderCard = (card, idx, faceDown = false) => {
    if (faceDown) {
      return (
        <div key={idx} className="flex items-center justify-center rounded-[3px] border border-white/10 bg-blue-900/80 select-none"
          style={{ width: compact ? '16px' : '22px', height: compact ? '22px' : '30px' }}>
          <div className="w-full h-full rounded-[2px] bg-gradient-to-br from-blue-800 to-blue-950 border border-blue-700/40"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)' }} />
        </div>
      );
    }
    return (
      <div key={idx} className={`flex flex-col items-center justify-center rounded-[3px] border border-white/10 px-0.5 pt-0.5 pb-0 bg-white text-black select-none`}
        style={{ width: compact ? '16px' : '22px', height: compact ? '22px' : '30px' }}>
        <span className={`text-[6px] font-bold leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {card.rank}
        </span>
        <span className={`text-[7px] leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {card.suit}
        </span>
      </div>
    );
  };

  const pVal = handValue(game.player);
  const dVal = game.status === 'playing' ? handValue([game.dealer[0]]) : handValue(game.dealer);

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">
      {/* Dealer */}
      <div className="flex flex-col items-center gap-1 mb-2">
        <span className="text-[7px] text-gray-200 font-mono uppercase tracking-wider">Dealer {dVal}</span>
        <div className="flex gap-0.5">
          {game.dealer.map((c, i) => renderCard(c, i, game.status === 'playing' && i === 1))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-12 h-px bg-white/5 mb-2" />

      {/* Player */}
      <div className="flex flex-col items-center gap-1 mb-2">
        <div className="flex gap-0.5">
          {game.player.map((c, i) => renderCard(c, i))}
        </div>
        <span className="text-[7px] text-[#49EACB] font-mono uppercase tracking-wider">Player {pVal}</span>
      </div>

      {/* Status / Actions */}
      <div className="flex items-center gap-2 mt-1">
        {game.status === 'playing' && (
          <>
            <button onClick={hit} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono uppercase hover:bg-[#49EACB]/20 transition-colors">
              Hit
            </button>
            <button onClick={stand} className="text-[7px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70 font-mono uppercase hover:bg-white/10 transition-colors">
              Stand
            </button>
          </>
        )}
        {game.status === 'blackjack' && (
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-[#49EACB] font-bold font-mono uppercase">Blackjack!</span>
            <button onClick={reset} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono hover:bg-[#49EACB]/20 transition-colors">New</button>
          </div>
        )}
        {game.status === 'bust' && (
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-red-400 font-bold font-mono uppercase">Bust!</span>
            <button onClick={reset} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono hover:bg-[#49EACB]/20 transition-colors">New</button>
          </div>
        )}
        {game.status === 'win' && (
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-green-400 font-bold font-mono uppercase">Win!</span>
            <button onClick={reset} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono hover:bg-[#49EACB]/20 transition-colors">New</button>
          </div>
        )}
        {game.status === 'dealer_win' && (
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-red-400 font-bold font-mono uppercase">Dealer Wins</span>
            <button onClick={reset} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono hover:bg-[#49EACB]/20 transition-colors">New</button>
          </div>
        )}
        {game.status === 'push' && (
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-gray-200 font-bold font-mono uppercase">Push</span>
            <button onClick={reset} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono hover:bg-[#49EACB]/20 transition-colors">New</button>
          </div>
        )}
        {game.status === 'stand' && (
          <button onClick={stand} className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono uppercase hover:bg-[#49EACB]/20 transition-colors">
            Stand (21)
          </button>
        )}
      </div>
    </div>
  );
};

export default BlackjackMini;
