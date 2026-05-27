import React, { useState, useCallback } from 'react';

const DICE_FACES = {
  1: [[0,0,0],[0,1,0],[0,0,0]],
  2: [[1,0,0],[0,0,0],[0,0,1]],
  3: [[1,0,0],[0,1,0],[0,0,1]],
  4: [[1,0,1],[0,0,0],[1,0,1]],
  5: [[1,0,1],[0,1,0],[1,0,1]],
  6: [[1,0,1],[1,0,1],[1,0,1]],
};

const DiceMini = ({ compact = false }) => {
  const [die1, setDie1] = useState(() => Math.floor(Math.random() * 6) + 1);
  const [die2, setDie2] = useState(() => Math.floor(Math.random() * 6) + 1);
  const [rolling, setRolling] = useState(false);
  const [bet, setBet] = useState('over7');
  const [result, setResult] = useState(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);

  const roll = useCallback((e) => {
    e.stopPropagation();
    if (rolling) return;
    setRolling(true);
    setResult(null);

    // Animate
    let count = 0;
    const interval = setInterval(() => {
      setDie1(Math.floor(Math.random() * 6) + 1);
      setDie2(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        clearInterval(interval);
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const sum = d1 + d2;
        setDie1(d1);
        setDie2(d2);
        setRolling(false);

        const won =
          (bet === 'over7' && sum > 7) ||
          (bet === 'under7' && sum < 7) ||
          (bet === 'exact7' && sum === 7);

        if (won) setWins(w => w + 1);
        else setLosses(l => l + 1);
        setResult({ sum, won });
      }
    }, 60);
  }, [bet, rolling]);

  const DiceFace = ({ value, size = 28 }) => {
    const grid = DICE_FACES[value];
    const dotSize = size * 0.16;
    return (
      <div
        className="inline-grid rounded-md bg-white/90 border border-white/30 shadow-md select-none"
        style={{
          gridTemplateColumns: `repeat(3, 1fr)`,
          width: `${size}px`,
          height: `${size}px`,
          padding: `${size * 0.12}px`,
          gap: `${size * 0.06}px`,
        }}
      >
        {grid.flat().map((dot, i) => (
          <div key={i} className="flex items-center justify-center">
            {dot === 1 && (
              <div
                className="rounded-full bg-gray-900"
                style={{ width: `${dotSize}px`, height: `${dotSize}px` }}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const diceSize = compact ? 26 : 36;

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">
      {/* Win/Loss counter */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[8px] text-green-400 font-mono">{wins}W</span>
        <div className="w-px h-3 bg-white/10" />
        <span className="text-[8px] text-red-400 font-mono">{losses}L</span>
      </div>

      {/* Dice */}
      <div className={`flex items-center gap-3 mb-2 ${rolling ? 'animate-pulse' : ''}`}>
        <DiceFace value={die1} size={diceSize} />
        <DiceFace value={die2} size={diceSize} />
      </div>

      {/* Result */}
      {result && (
        <div className="mb-2">
          <span className={`text-[10px] font-bold font-mono uppercase ${result.won ? 'text-green-400' : 'text-red-400'}`}>
            {result.won ? 'Win!' : 'Lose'} ({result.sum})
          </span>
        </div>
      )}

      {/* Bet selector */}
      <div className="flex items-center gap-1 mb-2">
        {[
          { id: 'under7', label: '&lt;7' },
          { id: 'exact7', label: '=7' },
          { id: 'over7', label: '&gt;7' },
        ].map((b) => (
          <button
            key={b.id}
            onClick={(e) => { e.stopPropagation(); setBet(b.id); }}
            className={`text-[7px] px-2 py-0.5 rounded font-mono transition-colors ${
              bet === b.id
                ? 'bg-[#49EACB]/15 border border-[#49EACB]/30 text-[#49EACB]'
                : 'bg-white/5 border border-white/[0.06] text-white/50 hover:text-white/70'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Roll button */}
      <button
        onClick={roll}
        disabled={rolling}
        className="text-[8px] px-3 py-1 rounded bg-[#49EACB]/10 border border-[#49EACB]/25 text-[#49EACB] font-mono uppercase hover:bg-[#49EACB]/20 transition-colors disabled:opacity-40"
      >
        {rolling ? 'Rolling...' : 'Roll Dice'}
      </button>
    </div>
  );
};

export default DiceMini;
