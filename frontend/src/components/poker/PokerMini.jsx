import React, { useState } from 'react';

const SUITS = { spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663' };
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Random card deal for demo
const randomCard = () => {
  const suit = Object.values(SUITS)[Math.floor(Math.random() * 4)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { suit, rank, isRed: suit === SUITS.hearts || suit === SUITS.diamonds };
};

const PokerMini = ({ compact = false }) => {
  const [holeCards, setHoleCards] = useState(() => [randomCard(), randomCard()]);
  const [communityCards, setCommunityCards] = useState(() => [randomCard(), randomCard(), randomCard()]);
  const [potSize, setPotSize] = useState(() => Math.floor(Math.random() * 50) * 100 + 1000);

  const dealNew = (e) => {
    e.stopPropagation();
    setHoleCards([randomCard(), randomCard()]);
    const flop = [randomCard(), randomCard(), randomCard()];
    const turn = randomCard();
    const river = randomCard();
    setCommunityCards(Math.random() > 0.5
      ? [...flop, turn, river]
      : Math.random() > 0.5 ? [...flop, turn] : flop
    );
    setPotSize(Math.floor(Math.random() * 50) * 100 + 1000);
  };

  const renderCard = (card, idx) => (
    <div
      key={idx}
      className={`flex flex-col items-center justify-center rounded-[3px] border border-white/10 px-0.5 pt-0.5 pb-0 bg-white text-black select-none`}
      style={{ width: compact ? '18px' : '24px', height: compact ? '26px' : '34px' }}
    >
      <span className={`text-[7px] font-bold leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}
        style={{ fontSize: compact ? '5px' : '7px' }}>
        {card.rank}
      </span>
      <span className={`text-[8px] leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}
        style={{ fontSize: compact ? '6px' : '8px' }}>
        {card.suit}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full p-2 select-none">
      {/* Table felt */}
      <div className="relative w-full h-full bg-gradient-to-br from-green-800/40 via-green-700/30 to-green-900/50 rounded-[24px] border border-green-600/20 flex flex-col items-center justify-center gap-2 overflow-hidden">
        {/* Felt texture overlay */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
        />

        {/* Pot size */}
        <div className="absolute top-2 right-3 z-10">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/30 border border-[#49EACB]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#49EACB]" />
            <span className="text-[9px] font-bold text-[#49EACB] font-mono">
              {potSize.toLocaleString()} KAS
            </span>
          </div>
        </div>

        {/* Community cards */}
        <div className="flex gap-1 mt-2">
          {communityCards.map((c, i) => (
            <div key={i} className="opacity-90">
              {renderCard(c, i)}
            </div>
          ))}
          {communityCards.length < 5 && (
            <div className="flex items-center justify-center rounded-[3px] border border-dashed border-white/10 bg-white/5"
              style={{ width: compact ? '18px' : '24px', height: compact ? '26px' : '34px' }}>
              <span className="text-[6px] text-white/30">?</span>
            </div>
          )}
        </div>

        {/* Dealer chip */}
        <div className="w-3 h-3 rounded-full bg-white/20 border border-white/30" />

        {/* Hole cards */}
        <div className="flex gap-1">
          {holeCards.map((c, i) => (
            <div key={i} className="relative">
              {renderCard(c, i)}
              {i === 0 && (
                <div className="absolute -top-0.5 -left-0.5 w-1.5 h-1.5 rounded-full bg-[#49EACB]" />
              )}
            </div>
          ))}
        </div>

        {/* Player label */}
        <div className="flex items-center gap-1 mt-0.5 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#49EACB]" />
          <span className="text-[7px] font-mono text-white/70">YOU</span>
        </div>

        {/* Deal button - bottom right */}
        <button
          onClick={dealNew}
          className="absolute bottom-2 right-2 text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono uppercase hover:bg-[#49EACB]/20 transition-colors z-10"
        >
          Deal
        </button>
      </div>
    </div>
  );
};

export default PokerMini;
