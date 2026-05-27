import React, { useState, useCallback } from 'react';

// Chess piece Unicode characters
const PIECES = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

const INITIAL_BOARD = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

// Opening sample moves for each piece
const SAMPLE_OPENINGS = [
  { from: [6, 4], to: [4, 4] }, // e4
  { from: [1, 4], to: [3, 4] }, // e5
  { from: [7, 6], to: [5, 5] }, // Nf3
  { from: [0, 1], to: [2, 2] }, // Nc6
  { from: [7, 5], to: [6, 1] }, // Bc4 (Italian)
  { from: [0, 5], to: [1, 2] }, // Bc5
];

const ChessMini = ({ compact = false }) => {
  const [board, setBoard] = useState(INITIAL_BOARD.map(r => [...r]));
  const [selected, setSelected] = useState(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [isWhite, setIsWhite] = useState(true);

  const applyMove = useCallback((move) => {
    const { from, to } = move;
    setBoard(prev => {
      const b = prev.map(r => [...r]);
      b[to[0]][to[1]] = b[from[0]][from[1]];
      b[from[0]][from[1]] = '';
      return b;
    });
    setIsWhite(prev => !prev);
  }, []);

  const resetBoard = () => {
    setBoard(INITIAL_BOARD.map(r => [...r]));
    setMoveIndex(0);
    setIsWhite(true);
    setSelected(null);
  };

  const makeDemoMove = () => {
    if (moveIndex < SAMPLE_OPENINGS.length) {
      applyMove(SAMPLE_OPENINGS[moveIndex]);
      setMoveIndex(prev => prev + 1);
    } else {
      // Reset after all demo moves
      resetBoard();
    }
  };

  const handleCellClick = (row, col) => {
    // Play a random-looking but deterministic move from openings
    if (moveIndex < SAMPLE_OPENINGS.length) {
      const move = SAMPLE_OPENINGS[moveIndex];
      // Only allow clicking of pieces that can move next
      if (board[row][col] && row === move.from[0] && col === move.from[1]) {
        setSelected([row, col]);
        setTimeout(() => {
          applyMove(move);
          setMoveIndex(prev => prev + 1);
          setSelected(null);
        }, 150);
      }
    } else {
      resetBoard();
    }
  };

  const cellSize = compact ? '18px' : '26px';

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-1 select-none"
    >
      {/* Turn indicator */}
      <div className="flex items-center justify-between w-full px-1 mb-1">
        <span className={`text-[8px] font-mono uppercase tracking-wider ${isWhite ? 'text-white' : 'text-gray-200'}`}>
          {isWhite ? 'White' : 'Black'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); makeDemoMove(); }}
          className="text-[7px] px-2 py-0.5 rounded bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] font-mono uppercase hover:bg-[#49EACB]/20 transition-colors"
        >
          Demo
        </button>
      </div>

      {/* Board */}
      <div
        className="inline-grid rounded-sm overflow-hidden border border-white/[0.08]"
        style={{ gridTemplateColumns: `repeat(8, ${cellSize})` }}
      >
        {board.map((row, ri) =>
          row.map((piece, ci) => {
            const isDark = (ri + ci) % 2 === 1;
            const isPiece = piece !== '';
            const isBlackPiece = isPiece && piece === piece.toLowerCase();
            const s = [ri, ci];
            const isSel = selected && selected[0] === ri && selected[1] === ci;

            return (
              <div
                key={`${ri}-${ci}`}
                className={`flex items-center justify-center cursor-pointer transition-all duration-75 ${
                  isDark ? 'bg-[#4a4e6b]/60' : 'bg-[#e8e9f3]/80'
                } ${isSel ? 'ring-1 ring-[#49EACB]/70 bg-[#49EACB]/20' : ''}`}
                style={{ width: cellSize, height: cellSize }}
                onClick={(e) => { e.stopPropagation(); handleCellClick(ri, ci); }}
              >
                {piece && (
                  <span
                    className={`select-none leading-none transition-transform ${
                      isBlackPiece ? 'text-[#1a1a2e]' : 'text-[#f0f0ff]'
                    }`}
                    style={{
                      fontSize: compact ? '13px' : '18px',
                      textShadow: isBlackPiece
                        ? '0 1px 1px rgba(0,0,0,0.2)'
                        : '0 1px 1px rgba(0,0,0,0.5)',
                    }}
                  >
                    {PIECES[piece]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* File labels */}
      <div className="flex justify-between w-full px-[2px] mt-0.5" style={{ maxWidth: `calc(8 * ${cellSize})` }}>
        {['a','b','c','d','e','f','g','h'].map(f => (
          <span key={f} className="text-[6px] text-gray-200 font-mono" style={{ width: cellSize, textAlign: 'center' }}>
            {f}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ChessMini;
