import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { X, Clock, Trophy, Flag } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';
import SeatButton, { TrustNote } from './SeatButton';
import InviteLink from './InviteLink';

/**
 * Persistent multiplayer chess over the covenant's match record.
 * First wallet to open becomes white and waits; the second becomes black.
 * Moves are validated locally with chess.js; persistence, seats, turn state
 * and live sync live in useGameSync (shared by all arena games).
 * Stakes remain on-chain; the oracle signs the final outcome separately.
 */

// Standard material weights for the captured-material advantage strip.
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
// Unicode glyphs for the captured-material strip (display only, never logic).
const PIECE_GLYPH = {
  white: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
  black: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' },
};

export default function FullScreenChess({ stake = 50, onClose, covenantId, creatorAddr, feePercent = 2 }) {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  // SAN history drives the move list, last-move highlight and captured material.
  // It mirrors chess.history() and carries no authority over game state.
  const [sanHistory, setSanHistory] = useState([]);
  // Square the player is currently dragging from, for legal-move hints.
  const [dragFrom, setDragFrom] = useState(null);
  const moveListRef = useRef(null);

  const onMoves = useCallback((moves) => {
    chess.reset();
    for (const m of moves) {
      try { chess.move(m); } catch { /* control tokens like 'resign' are not SAN */ }
    }
    setFen(chess.fen());
    setSanHistory(chess.history());
  }, [chess]);

  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, clocks, walletConnected } =
    useGameSync({ covenantId, gameType: 'chess', stake, onMoves });

  // Autoscroll the move list so the latest ply stays visible.
  useEffect(() => {
    if (moveListRef.current) moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
  }, [sanHistory.length]);

  const onPieceDrop = ({ sourceSquare, targetSquare }) => {
    if (!targetSquare) return false;
    if (!game || status !== 'active' || !myColor) return false;
    if (!isMyTurn) { setError('Not your turn.'); return false; }
    let mv;
    try { mv = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' }); } catch { return false; }
    if (!mv) return false;
    setFen(chess.fen());
    setSanHistory(chess.history());
    setDragFrom(null);
    setError(null);
    const over = chess.isGameOver();
    const winner = chess.isCheckmate() ? myColor : over ? 'draw' : null;
    submitMove(mv.san, { finished: over, winner });
    return true;
  };

  // Show legal-move hints when a piece is picked up.
  const onPieceDrag = ({ square }) => {
    if (status !== 'active' || !isMyTurn) return;
    setDragFrom(square || null);
  };

  // Locate the from/to squares of the last move by replaying history into a
  // fresh board (read-only; never feeds back into the authoritative `chess`).
  const lastMoveSquares = useMemo(() => {
    if (sanHistory.length === 0) return null;
    try {
      const probe = new Chess();
      let last = null;
      for (const san of sanHistory) { last = probe.move(san); }
      return last ? { from: last.from, to: last.to } : null;
    } catch { return null; }
  }, [sanHistory]);

  // Square the checked king stands on, for the red in-check tint.
  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn(); // side to move is the one in check
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) return cell.square;
      }
    }
    return null;
    // `fen` is the change signal for the mutable `chess` object's board state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, fen]);

  // squareStyles object handed to react-chessboard v5. This is presentation
  // only: highlights, legal-move dots and the check tint. No game logic here.
  const squareStyles = useMemo(() => {
    const styles = {};
    if (lastMoveSquares) {
      const lm = { backgroundColor: 'rgba(232, 175, 52, 0.45)' };
      styles[lastMoveSquares.from] = { ...lm };
      styles[lastMoveSquares.to] = { ...lm };
    }
    if (dragFrom) {
      let legal;
      try { legal = chess.moves({ square: dragFrom, verbose: true }); } catch { legal = []; }
      for (const m of legal) {
        const isCapture = m.flags.includes('c') || m.flags.includes('e');
        styles[m.to] = isCapture
          ? {
            ...styles[m.to],
            background: 'radial-gradient(circle, transparent 56%, rgba(73, 234, 203, 0.55) 57%, rgba(73, 234, 203, 0.55) 70%, transparent 71%)',
          }
          : {
            ...styles[m.to],
            background: 'radial-gradient(circle, rgba(73, 234, 203, 0.55) 22%, transparent 23%)',
          };
      }
      styles[dragFrom] = { ...styles[dragFrom], background: 'rgba(73, 234, 203, 0.28)' };
    }
    if (checkSquare) {
      styles[checkSquare] = {
        ...styles[checkSquare],
        background: 'radial-gradient(circle, rgba(212, 35, 58, 0.85) 0%, rgba(212, 35, 58, 0.35) 70%, transparent 72%)',
      };
    }
    return styles;
  }, [lastMoveSquares, dragFrom, checkSquare, chess]);

  // Captured material + numeric advantage, derived from the live board by
  // counting what is missing from a full starting set. Display only.
  const captured = useMemo(() => {
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const live = { white: { p: 0, n: 0, b: 0, r: 0, q: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type !== 'k') {
          live[cell.color === 'w' ? 'white' : 'black'][cell.type] += 1;
        }
      }
    }
    const build = (color) => {
      const list = [];
      let pts = 0;
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const gone = start[t] - live[color][t];
        for (let i = 0; i < gone; i += 1) { list.push(t); pts += PIECE_VALUE[t]; }
      }
      return { list, pts };
    };
    // White's captured pieces are black pieces, and vice versa.
    const whiteTook = build('black');
    const blackTook = build('white');
    return {
      white: { glyphs: whiteTook.list.map((t) => PIECE_GLYPH.black[t]), pts: whiteTook.pts },
      black: { glyphs: blackTook.list.map((t) => PIECE_GLYPH.white[t]), pts: blackTook.pts },
      adv: whiteTook.pts - blackTook.pts,
    };
    // `fen` is the change signal for the mutable `chess` object's board state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, fen]);

  // Pair the flat SAN list into numbered move rows for the two-column list.
  const moveRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < sanHistory.length; i += 2) {
      rows.push({ no: i / 2 + 1, white: sanHistory[i], black: sanHistory[i + 1] || null, wi: i, bi: i + 1 });
    }
    return rows;
  }, [sanHistory]);

  const boardWidth = Math.min(460, (typeof window !== 'undefined' ? window.innerWidth : 480) - 56);
  const formatMs = (ms) => {
    const total = Math.max(0, Math.ceil((ms || 0) / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
  const seatTaken = (p) => p && p.length > 0;
  const lowTime = (ms) => (ms || 0) < 60000;

  const orientedBlackTop = myColor !== 'black';

  // Render helpers (plain functions, not components) for the clock + seat
  // panel and the captured-material strip. `active` lights the green glow ring.
  const renderClock = (side) => {
    const ms = side === 'white' ? clocks?.whiteMs : clocks?.blackMs;
    const seat = side === 'white' ? game?.player1 : game?.player2;
    const active = game?.current_turn === side && status === 'active';
    const isMe = myColor === side;
    return (
      <div className={`px-4 py-2.5 rounded-xl w-full flex items-center justify-between gap-6 border transition-colors ${active ? 'bg-white/10 border-emerald-400/30 light:bg-white light:border-emerald-500/40 light:shadow-sm clock-active' : 'bg-white/5 border-white/10 light:bg-white/80 light:border-slate-200 light:shadow-sm'}`}>
        <div className="flex items-center gap-2.5">
          <span className={`inline-block w-3 h-3 rounded-full border ${side === 'white' ? 'bg-gray-100 border-gray-300 light:bg-white light:border-slate-400' : 'bg-gray-900 border-gray-600 light:bg-slate-800 light:border-slate-700'}`} />
          <div>
            <div className="text-xs text-gray-300 light:text-slate-700 font-medium">
              {side === 'white' ? 'White' : 'Black'}{isMe && <span className="text-emerald-300 light:text-emerald-800"> (you)</span>}
            </div>
            <div className="text-[10px] font-mono text-gray-500 light:text-slate-500">{seatTaken(seat) ? `${seat.slice(0, 14)}...` : 'seat open'}</div>
          </div>
        </div>
        <div className={`font-mono text-2xl font-bold tabular-nums ${lowTime(ms) ? 'text-red-400 light:text-red-600' : active ? 'text-emerald-300 light:text-emerald-800' : 'text-white light:text-slate-800'}`}>
          {formatMs(ms)}
        </div>
      </div>
    );
  };

  const renderCaptured = (side) => {
    const c = captured[side];
    const lead = side === 'white' ? captured.adv : -captured.adv;
    return (
      <div className="flex items-center gap-1.5 min-h-[20px] px-1">
        <span className="font-mono text-lg leading-none text-gray-300 light:text-slate-600 tracking-tight">{c.glyphs.join('')}</span>
        {lead > 0 && <span className="text-[11px] font-mono font-bold text-emerald-400 light:text-emerald-700">+{lead}</span>}
      </div>
    );
  };

  return (
    <div className="game-fullscreen-bg fixed inset-0 z-[100] flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 light:border-slate-300/70 bg-gradient-to-b from-white/[0.04] to-transparent light:from-white/70 light:to-transparent">
        <div className="text-white light:text-slate-800 font-mono text-sm flex items-center gap-3">
          <span className="text-[#E8AF34] light:text-amber-600 font-bold">{stake} KAS</span> Chess Match
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${status === 'active' ? 'border-emerald-500/40 text-emerald-300 light:text-emerald-800' : status === 'finished' ? 'border-purple-500/40 text-purple-300 light:text-purple-700' : 'border-amber-500/40 text-amber-300 light:text-amber-600'}`}>
            {status === 'none' ? 'OPEN' : status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400 light:text-slate-600">Fee: {feePercent}%</div>
          <button onClick={onClose} className="min-h-[44px] sm:min-h-0 p-2 rounded-full hover:bg-white/10 light:hover:bg-slate-900/5 transition-colors" aria-label="Exit chess arena"><X size={20} className="text-white light:text-slate-700" /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 lg:gap-8 p-4 overflow-y-auto">
        {/* Board column with clocks and captured-material strips */}
        <div className="flex flex-col items-stretch gap-2.5" style={{ width: boardWidth }}>
          {orientedBlackTop ? renderClock('black') : renderClock('white')}
          {renderCaptured(orientedBlackTop ? 'white' : 'black')}
          <div className="board-bezel-wood shadow-2xl">
            <div className="rounded-lg overflow-hidden">
              <Chessboard
                options={{
                  position: fen,
                  onPieceDrop,
                  onPieceDrag,
                  allowDragging: status === 'active' && !!myColor,
                  boardOrientation: myColor === 'black' ? 'black' : 'white',
                  darkSquareStyle: { backgroundColor: '#769656' },
                  lightSquareStyle: { backgroundColor: '#EBECD0' },
                  showNotation: true,
                  squareStyles,
                  id: 'covex-chess',
                }}
              />
            </div>
          </div>
          {renderCaptured(orientedBlackTop ? 'black' : 'white')}
          {orientedBlackTop ? renderClock('white') : renderClock('black')}
        </div>

        {/* Side rail: status / move list / actions */}
        <div className="w-full max-w-xs flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] light:bg-white light:border-slate-200 light:shadow-sm p-4 text-center">
            {status === 'none' || (status === 'waiting' && !myColor) ? (
              <div className="flex flex-col items-center gap-3">
                <SeatButton status={status} joining={joining} walletConnected={walletConnected} onJoin={join} stake={stake} seatHint="You take white. Your opponent joins as black." />
                <TrustNote />
              </div>
            ) : status === 'waiting' ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="text-sm text-amber-300 light:text-amber-600 animate-pulse">Waiting for an opponent to join as black...</div>
                <InviteLink stake={stake} />
              </div>
            ) : status === 'active' ? (
              <div className="text-sm text-amber-400 light:text-amber-600">
                <div className="flex items-center gap-2 justify-center mb-2">
                  <Clock size={16} /> {game.current_turn === 'white' ? 'White' : 'Black'} to move
                  {isMyTurn && <span className="text-emerald-300 light:text-emerald-800 font-bold">(your move)</span>}
                </div>
                {myColor && (
                  <button onClick={resign} className="min-h-[44px] sm:min-h-0 mt-1 px-4 py-2 rounded-xl border border-red-500/40 text-red-300 light:text-red-600 text-xs font-bold flex items-center gap-1.5 mx-auto hover:bg-red-500/10 light:hover:bg-red-500/10 transition-colors">
                    <Flag size={12} /> Resign
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-purple-300 light:text-purple-700 flex items-center gap-2 justify-center py-2">
                <Trophy size={18} className="text-[#E8AF34] light:text-amber-600" />
                {game?.winner === 'draw' ? 'Draw' : `${game?.winner === 'white' ? 'White' : 'Black'} wins`}
              </div>
            )}
            {!myColor && status !== 'none' && <div className="text-[11px] text-gray-500 light:text-slate-500 mt-2">You are spectating. Moves sync live.</div>}
            {error && <div className="mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 light:text-red-600 text-xs">{error}</div>}
          </div>

          {/* Two-column SAN move list with current-move highlight + autoscroll */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] light:bg-white light:border-slate-200 light:shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 light:border-slate-200 text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-600 font-semibold flex items-center justify-between">
              <span>Moves</span>
              <span className="font-mono text-gray-500 light:text-slate-500">{sanHistory.length} ply</span>
            </div>
            <div ref={moveListRef} className="max-h-56 overflow-y-auto px-2 py-2 font-mono text-[13px]">
              {moveRows.length === 0 ? (
                <div className="text-gray-600 light:text-slate-500 text-xs text-center py-4">No moves yet</div>
              ) : (
                moveRows.map((r) => {
                  const last = sanHistory.length - 1;
                  return (
                    <div key={r.no} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-1 px-1 py-0.5 rounded hover:bg-white/[0.03] light:hover:bg-slate-900/5">
                      <span className="text-gray-600 light:text-slate-500 text-[11px]">{r.no}.</span>
                      <span className={`px-1.5 py-0.5 rounded ${r.wi === last ? 'bg-[#49EACB]/20 text-[#49EACB] light:text-[#0d9488] font-bold' : 'text-gray-200 light:text-slate-700'}`}>{r.white}</span>
                      <span className={`px-1.5 py-0.5 rounded ${r.bi === last ? 'bg-[#49EACB]/20 text-[#49EACB] light:text-[#0d9488] font-bold' : 'text-gray-200 light:text-slate-700'}`}>{r.black || ''}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="text-[10px] text-gray-600 light:text-slate-500 px-1">
            Moves persist on the match record and sync in real time. The pot settles on-chain with oracle verification.
            <br />Creator: {creatorAddr?.slice(0, 16)}...
          </div>
        </div>
      </div>
    </div>
  );
}
