import { useState, useCallback, useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import useGameSync from '../hooks/useGameSync';
import SeatButton, { TrustNote } from './SeatButton';
import InviteLink from './InviteLink';
import GamePotPanel from './GamePotPanel';
import { getCurrentNetwork } from './WalletContext';
import { resolveReversiBoard, resolveReversiDiscs } from '../lib/reversiTheme';

// Professional full-screen Reversi / Othello (8x8): persistent two-wallet
// multiplayer over the covenant match record. Black moves first, so seats
// map player1 (server 'white') -> B pieces, player2 (server 'black') -> W.
// When a side has no legal flip it submits an explicit "pass" move; the
// board is replayed from the server move log ("B27", "W34", "pass", ...).

const SIZE = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function initBoard() {
  const b = Array(SIZE * SIZE).fill(null);
  b[3 * SIZE + 3] = 'W'; b[3 * SIZE + 4] = 'B';
  b[4 * SIZE + 3] = 'B'; b[4 * SIZE + 4] = 'W';
  return b;
}

function getFlipsForBoard(bd, i, pl) {
  if (bd[i]) return [];
  const fl = [];
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const op = pl === 'B' ? 'W' : 'B';
  for (const [dr, dc] of DIRS) {
    let rr = r + dr, cc = c + dc;
    const line = [];
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
      const j = rr * SIZE + cc;
      if (bd[j] === op) line.push(j);
      else if (bd[j] === pl) { if (line.length) fl.push(...line); break; }
      else break;
      rr += dr; cc += dc;
    }
  }
  return fl;
}

const sideHasMove = (bd, pl) => {
  for (let k = 0; k < SIZE * SIZE; k++) if (getFlipsForBoard(bd, k, pl).length > 0) return true;
  return false;
};

function replayBoard(moves) {
  const bd = initBoard();
  for (const m of moves) {
    const mt = typeof m === 'string' && m.match(/^([BW])([0-9]{1,2})$/);
    if (!mt) continue; // 'pass' and 'resign' leave the board unchanged
    const i = Number(mt[2]);
    if (i >= SIZE * SIZE) continue;
    const flips = getFlipsForBoard(bd, i, mt[1]);
    bd[i] = mt[1];
    flips.forEach((j) => { bd[j] = mt[1]; });
  }
  return bd;
}

// Visual-only: replay the log to learn where the last disc was placed and which
// discs that move flipped, so we can stage the flip + scale-in animations. This
// reads the same move strings as replayBoard and never alters them or any logic.
function lastMoveInfo(moves) {
  const list = Array.isArray(moves) ? moves : [];
  const bd = initBoard();
  let placed = -1;
  let flipped = [];
  for (const m of list) {
    const mt = typeof m === 'string' && m.match(/^([BW])([0-9]{1,2})$/);
    if (!mt) { placed = -1; flipped = []; continue; } // pass/resign: clear hint
    const i = Number(mt[2]);
    if (i >= SIZE * SIZE) continue;
    const flips = getFlipsForBoard(bd, i, mt[1]);
    bd[i] = mt[1];
    flips.forEach((j) => { bd[j] = mt[1]; });
    placed = i;
    flipped = flips;
  }
  return { placed, flipped };
}

// Board file/rank coordinate labels (a..h, 1..8) for the premium frame.
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

// A single Othello disc rendered with real thickness: a 3D preserve-3d shell
// with two faces (black / white), a darker rim and a soft specular highlight.
// `flip` plays the rotateY capture animation; `pop` plays the place scale-in.
function Disc({ color, flip = false, pop = false, delay = 0, discLook }) {
  const isB = color === 'B';
  // discLook.a is the dark/B disc, .b is the light/W disc. Fall back to the
  // classic black/white gradients when no creator look is supplied.
  const aBack = discLook?.aBack || 'radial-gradient(circle at 34% 28%, #3a3a44 0%, #1a1a1a 46%, #000 100%)';
  const bBack = discLook?.bBack || 'radial-gradient(circle at 34% 28%, #ffffff 0%, #ededed 48%, #dcdcdc 100%)';
  const aSpec = discLook?.aSpec || 'radial-gradient(circle at 36% 26%, rgba(120,150,255,0.28) 0%, rgba(120,150,255,0) 42%)';
  const bSpec = discLook?.bSpec || 'radial-gradient(circle at 36% 26%, rgba(255,244,225,0.85) 0%, rgba(255,244,225,0) 46%)';
  const aRim = discLook?.aRim || '#000';
  const bRim = discLook?.bRim || '#bdbdbd';
  const faceBack = isB ? aBack : bBack;
  const specular = isB ? aSpec : bSpec;
  const rim = isB ? aRim : bRim;
  // When flipping we present BOTH faces and rotate the shell; otherwise one face.
  const flipColor = isB ? 'B' : 'W';
  const otherIsB = flipColor !== 'B'; // the face shown at the start of a flip is the opponent's
  const startBack = otherIsB ? aBack : bBack;
  return (
    <div
      className={pop ? 'anim-pop' : undefined}
      style={{ width: '82%', height: '82%', perspective: '220px', animationDelay: pop ? `${delay}ms` : undefined }}
    >
      <div
        className={flip ? 'anim-flip' : undefined}
        style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          animationDelay: flip ? `${delay}ms` : undefined,
        }}
      >
        {/* settled / front face (the disc's current color) */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', backfaceVisibility: 'hidden',
          background: faceBack,
          boxShadow: `inset 0 -2px 3px ${rim}, inset 0 2px 2px rgba(255,255,255,0.18), 0 3px 5px rgba(0,0,0,0.55), 0 1px 0 ${rim}`,
        }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: specular, pointerEvents: 'none' }} />
        </div>
        {/* back face shown only during a flip (the side it was before capture) */}
        {flip && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)', background: startBack,
            boxShadow: `inset 0 -2px 3px ${otherIsB ? aRim : bRim}, inset 0 2px 2px rgba(255,255,255,0.18), 0 3px 5px rgba(0,0,0,0.55)`,
          }} />
        )}
      </div>
    </div>
  );
}

// Big disc-count chip used in the live scoreboard beside the board.
function ScoreChip({ color, count, leading, discLook }) {
  const isB = color === 'B';
  const aBack = discLook?.aBack || 'radial-gradient(circle at 36% 28%, #3a3a44 0%, #1a1a1a 48%, #000 100%)';
  const bBack = discLook?.bBack || 'radial-gradient(circle at 36% 28%, #ffffff 0%, #ededed 48%, #dcdcdc 100%)';
  const aRim = discLook?.aRim || '#000';
  const bRim = discLook?.bRim || '#bdbdbd';
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: 48, height: 48,
          background: isB ? aBack : bBack,
          boxShadow: leading
            ? `0 0 0 2px #49EACB, 0 0 14px rgba(73,234,203,0.5), inset 0 -2px 3px ${isB ? aRim : bRim}`
            : `inset 0 -2px 3px ${isB ? aRim : bRim}, 0 2px 5px rgba(0,0,0,0.5)`,
        }}
      />
      <span className="font-mono text-2xl font-bold tabular-nums text-white light:text-slate-900">{count}</span>
    </div>
  );
}

export default function FullScreenReversi({ stake = 40, onClose, covenantId, feePercent = 2, potReturnPercent = 2, look }) {
  // Creator-chosen appearance (board color + the two disc colors). Falls back to
  // the classic green board with black/white discs so an arena opened without a
  // look renders exactly as before.
  const boardLook = look?.board || resolveReversiBoard();
  const discLook = look?.discs || resolveReversiDiscs();
  const [board, setBoard] = useState(() => initBoard());
  const [localMethod, setLocalMethod] = useState(null);
  // Visual-only: which cell was just placed and which discs it flipped, so we can
  // stage the place scale-in and capture flip animations. No game logic here.
  const [lastMove, setLastMove] = useState({ placed: -1, flipped: [] });

  const [oracleSubmitted, setOracleSubmitted] = useState(false);
  const [oracleSig, setOracleSig] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState(null);
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const totalPot = stake * 2;

  const onMoves = useCallback((moves) => {
    setBoard(replayBoard(moves));
    setLastMove(lastMoveInfo(moves)); // visual hint only
  }, []);
  const { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, clocks, walletConnected, getSeatToken, refresh } =
    useGameSync({ covenantId, gameType: 'reversi', stake, onMoves });

  // Black moves first: player1 (server 'white') plays B
  const myPiece = myColor === 'white' ? 'B' : myColor === 'black' ? 'W' : null;
  const turnPiece = game?.current_turn === 'black' ? 'W' : 'B';

  // outcome is in PIECE colors (black/white discs), mapped from the server winner
  const result = useMemo(() => {
    if (status !== 'finished') return null;
    const w = game?.winner;
    const outcome = w === 'draw' ? 'draw' : w === 'white' ? 'black' : 'white';
    return { outcome, method: localMethod || 'result' };
  }, [status, game, localMethod]);

  const isLegal = (i) => status === 'active' && isMyTurn && myPiece && !board[i] && getFlipsForBoard(board, i, myPiece).length > 0;
  const mustPass = status === 'active' && isMyTurn && myPiece && !sideHasMove(board, myPiece);

  const countWinner = (bd) => {
    const bc = bd.filter((x) => x === 'B').length, wc = bd.filter((x) => x === 'W').length;
    return bc > wc ? 'white' : wc > bc ? 'black' : 'draw'; // server colors: B belongs to player1='white'
  };

  const place = (i) => {
    if (status !== 'active' || !myPiece || result || board[i]) return;
    if (!isMyTurn) { setError('Not your turn.'); return; }
    const flips = getFlipsForBoard(board, i, myPiece);
    if (!flips.length) return;
    const newB = [...board];
    newB[i] = myPiece;
    flips.forEach((j) => { newB[j] = myPiece; });
    setBoard(newB);
    setLastMove({ placed: i, flipped: flips }); // visual hint only
    setError(null);

    const opp = myPiece === 'B' ? 'W' : 'B';
    const finished = !sideHasMove(newB, opp) && !sideHasMove(newB, myPiece);
    if (finished) setLocalMethod('count');
    submitMove(`${myPiece}${i}`, { finished, winner: finished ? countWinner(newB) : null });
  };

  const pass = () => {
    if (!mustPass) return;
    const opp = myPiece === 'B' ? 'W' : 'B';
    const finished = !sideHasMove(board, opp); // neither side can move
    if (finished) setLocalMethod('count');
    submitMove('pass', { finished, winner: finished ? countWinner(board) : null });
  };

  // Live clocks come straight from the hook (server-authoritative, ticked between
  // syncs). Black discs are player1 = server 'white' (clocks.whiteMs); White discs
  // are player2 = server 'black' (clocks.blackMs). No local clock state is kept.
  const blackTime = clocks?.whiteMs ?? 0;
  const whiteTime = clocks?.blackMs ?? 0;

  const format = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  // Live disc counts for the scoreboard.
  const blackCount = board.filter((x) => x === 'B').length;
  const whiteCount = board.filter((x) => x === 'W').length;
  // Which side is on the clock (B discs = current_turn 'white', W discs = 'black').
  const blackToMove = status === 'active' && game?.current_turn === 'white';
  const whiteToMove = status === 'active' && game?.current_turn === 'black';

  const submitToOracle = useCallback(async () => {
    if (!result) return;
    if (!covenantId) {
      setOracleError('This match is not attached to an on-chain covenant, so there is nothing to resolve.');
      return;
    }
    setOracleLoading(true); setOracleError(null);
    const om = { black: 0, white: 1, draw: 2 };
    const ov = om[result.outcome] ?? 0;
    try {
      const r = await fetch('/api/oracle/verify-and-sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ covenant_id: covenantId, circuit_type: 'reversi_v1', proof: { g: 'reversi', o: result.outcome }, public_inputs: [result.outcome], requested_outcome: ov }) });
      const d = await r.json();
      if (d.success) { setOracleSig(d.signature); setOracleSubmitted(true); setOracleResult(d); }
      else { setOracleError(d.error || 'Oracle rejected the result.'); }
    } catch (e) { setOracleError(e?.message || 'Oracle request failed. Check your connection and try again.'); }
    finally { setOracleLoading(false); }
  }, [result, covenantId]);

  const claimPayout = useCallback(async () => {
    if (!covenantId || !oracleResult) return;
    setPayoutLoading(true);
    const om = { black: 0, white: 1, draw: 2 };
    try {
      const r = await fetch(`/api/covenant/${covenantId}/compute-payout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oracle_signature: oracleResult.signature || oracleSig || '', outcome: om[result?.outcome] ?? 0, total_stake_kas: totalPot, per_side_stake_kas: stake, oracle_message: `reversi:${result?.outcome}`, oracle_timestamp: oracleResult.timestamp || Math.floor(Date.now() / 1000) }) });
      const d = await r.json();
      setPayoutResult(d.success ? d.payout : { error: d.error });
    } catch (e) { setPayoutResult({ error: e.message }); } finally { setPayoutLoading(false); }
  }, [covenantId, oracleResult, oracleSig, result, totalPot, stake]);

  const previewW = ((totalPot) * (100 - feePercent - potReturnPercent) / 100).toFixed(1);
  const previewF = ((totalPot) * feePercent / 100).toFixed(1);
  const previewR = ((totalPot) * potReturnPercent / 100).toFixed(1);

  const moves = Array.isArray(game?.moves) ? game.moves : [];
  const seat = (p) => (p && p.length ? `${p.slice(0, 10)}...` : 'open');

  return (
    <div className="game-fullscreen-bg fixed inset-0 z-[999] flex flex-col">
      <div className="h-12 sm:h-14 border-b border-white/10 light:border-slate-300/70 flex items-center justify-between gap-2 px-3 sm:px-4 text-xs sm:text-sm bg-black/60 light:bg-white/80 backdrop-blur shrink-0">
        <div className="font-bold tracking-wider text-[#49EACB] light:text-[#0d9488] truncate text-[11px] sm:text-sm">
          <span className="sm:hidden">REVERSI</span>
          <span className="hidden sm:inline">REVERSI / OTHELLO · KASPA COVENANT</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block px-2 py-0.5 rounded bg-white/5 light:bg-slate-900/5 text-[10px] font-mono border border-white/10 light:border-slate-300 whitespace-nowrap">{totalPot} KAS POT · {potReturnPercent}% RETURN</div>
          <button
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 rounded-xl border border-white/20 light:border-slate-400 hover:bg-white/5 light:hover:bg-slate-900/5 text-xs font-bold"
            aria-label="Exit reversi arena"
          >EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-3 p-2 overflow-auto">
        <div className="hidden lg:flex flex-col items-center w-44 gap-3">
          <div className="flex flex-col items-center">
            <div className="text-xs text-gray-400 light:text-slate-600 tracking-wider">BLACK{myPiece === 'B' && ' • YOU'}</div>
            <div className={`mt-1 px-3 py-1 ${blackToMove ? 'clock-active' : ''}`}>
              <div className={`font-mono text-5xl font-bold tabular-nums ${blackTime < 30000 ? 'text-red-500' : 'text-white light:text-slate-900'}`}>{format(blackTime)}</div>
            </div>
            <div className="mt-1 text-[10px] font-mono text-gray-500 light:text-slate-500">{seat(game?.player1)}</div>
          </div>
          <ScoreChip color="B" count={blackCount} leading={blackCount > whiteCount} discLook={discLook} />
          <div className="text-[10px] font-mono tracking-wider text-center text-[#49EACB] light:text-[#0d9488]">
            {blackCount === whiteCount ? 'LEVEL' : blackCount > whiteCount ? `BLACK +${blackCount - whiteCount}` : `WHITE +${whiteCount - blackCount}`}
          </div>
        </div>

        <div className="relative">
          {/* mobile scoreboard strip */}
          <div className="lg:hidden flex items-center justify-between max-w-[min(92vw,420px)] mb-1 font-mono">
            <span className={`text-[11px] ${blackToMove ? 'text-kaspa-green' : 'text-gray-300 light:text-slate-600'}`}>B {blackCount} · {format(blackTime)}</span>
            <span className="text-[10px] text-kaspa-green tracking-wider">{result ? 'OVER' : status === 'active' ? ((turnPiece === 'B' ? 'BLACK' : 'WHITE') + ' TO PLAY') : status.toUpperCase()}</span>
            <span className={`text-[11px] ${whiteToMove ? 'text-kaspa-green' : 'text-gray-300 light:text-slate-600'}`}>W {whiteCount} · {format(whiteTime)}</span>
          </div>

          {/* wood-framed felt board with file/rank coordinates */}
          <div className="board-bezel-wood" style={{ width: 'min(92vw,420px)' }}>
            <div className="relative">
              <div
                className="felt-noise grid grid-cols-8 overflow-hidden"
                style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: boardLook.surface, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 0 22px rgba(0,0,0,0.45)' }}
              >
                {board.map((v, i) => {
                  const legal = !result && isLegal(i);
                  const isPlaced = lastMove.placed === i;
                  const isFlipped = lastMove.flipped.includes(i);
                  const flipIdx = isFlipped ? lastMove.flipped.indexOf(i) : 0;
                  return (
                    <div
                      key={i}
                      onClick={() => place(i)}
                      className={`relative flex items-center justify-center cursor-pointer ${isPlaced ? 'last-move' : ''}`}
                      style={{
                        aspectRatio: '1',
                        // embossed grid lines: faint light top/left, dark bottom/right
                        boxShadow: 'inset -1px -1px 0 rgba(0,0,0,0.28), inset 1px 1px 0 rgba(255,255,255,0.06)',
                      }}
                    >
                      {v && (
                        <Disc
                          color={v}
                          flip={isFlipped}
                          pop={isPlaced}
                          delay={isFlipped ? flipIdx * 55 : 0}
                          discLook={discLook}
                        />
                      )}
                      {legal && (
                        <span
                          className="absolute rounded-full pointer-events-none"
                          style={{
                            width: '30%', height: '30%',
                            background: myPiece === 'B' ? discLook.aBack : discLook.bBack,
                            opacity: 0.55,
                            boxShadow: '0 0 6px rgba(73,234,203,0.5), 0 0 0 1px rgba(73,234,203,0.6)',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* file coordinates (a..h) bottom, rank coordinates (1..8) left */}
              <div className="absolute left-0 right-0 -bottom-[14px] grid grid-cols-8 text-[9px] font-mono text-amber-200/60 select-none pointer-events-none">
                {FILES.map((f) => <span key={f} className="text-center">{f}</span>)}
              </div>
              <div className="absolute top-0 bottom-0 -left-[12px] grid grid-rows-8 text-[9px] font-mono text-amber-200/60 select-none pointer-events-none">
                {RANKS.map((rk) => <span key={rk} className="flex items-center">{rk}</span>)}
              </div>
            </div>
          </div>

          {status !== 'active' && !result && (
            <div className="game-join-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-sm rounded-2xl px-4">
              {(status === 'none' || (status === 'waiting' && !myColor)) ? (
                <>
                  <SeatButton status={status} joining={joining} walletConnected={walletConnected} onJoin={join} stake={stake} seatHint="You take black, which moves first. Your opponent joins as white." />
                  <TrustNote />
                </>
              ) : (
                <>
                  <div className="text-xs text-amber-300 animate-pulse font-mono">WAITING FOR AN OPPONENT TO JOIN AS WHITE...</div>
                  <InviteLink stake={stake} />
                </>
              )}
              {error && <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] max-w-[260px] text-center">{error}</div>}
            </div>
          )}

          <div className="text-center mt-1 text-xs font-mono text-kaspa-green tracking-wider">{result ? (result.outcome === 'draw' ? 'DRAW' : `${result.outcome.toUpperCase()} WINS`) : status === 'active' ? ((turnPiece === 'B' ? 'BLACK' : 'WHITE') + ' TO PLAY') : ''}</div>
          {mustPass && (
            <div className="text-center mt-1">
              <button onClick={pass} className="px-4 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold">PASS (NO LEGAL MOVES)</button>
            </div>
          )}
          {!myColor && status === 'active' && <div className="text-center text-[10px] text-gray-500 light:text-slate-500 mt-0.5">You are spectating. Moves sync live.</div>}
          {error && status === 'active' && <div className="text-center text-[10px] text-red-300 mt-0.5">{error}</div>}
        </div>

        <div className="hidden lg:flex flex-col items-center w-44">
          <div className="text-xs text-gray-400 light:text-slate-600 tracking-wider">WHITE{myPiece === 'W' && ' • YOU'}</div>
          <div className={`mt-1 px-3 py-1 ${whiteToMove ? 'clock-active' : ''}`}>
            <div className={`font-mono text-5xl font-bold tabular-nums ${whiteTime < 30000 ? 'text-red-500' : 'text-white light:text-slate-900'}`}>{format(whiteTime)}</div>
          </div>
          <div className="mt-1 text-[10px] font-mono text-gray-500 light:text-slate-500">{seat(game?.player2)}</div>
          <div className="mt-3"><ScoreChip color="W" count={whiteCount} leading={whiteCount > blackCount} discLook={discLook} /></div>
          {/* Real, non-custodial winner-takes-all pot. Renders only when actionable. */}
          <div className="mt-3 w-full"><GamePotPanel covenantId={covenantId} gameType="reversi" game={game} seatToken={getSeatToken ? getSeatToken() : ''} network={getCurrentNetwork()} onChange={refresh} /></div>
          <div className="mt-3 w-full text-[10px] font-mono bg-black/50 light:bg-white light:text-slate-600 p-2 rounded border border-white/10 light:border-slate-200 light:shadow-sm max-h-28 overflow-auto">{moves.slice(-5).join(' ')}</div>
          <div className="mt-2 flex flex-col gap-1 w-full text-xs">
            {!result && myColor && status === 'active' && <button onClick={resign} className="py-2 rounded-xl bg-red-600/90 text-white font-bold">RESIGN</button>}
            {result && !oracleSubmitted && <button onClick={submitToOracle} disabled={oracleLoading} className="py-2 rounded-2xl bg-[#49EACB] text-black font-bold">{oracleLoading ? '...' : 'SUBMIT TO ORACLE'}</button>}
            {oracleSubmitted && !payoutResult && <button onClick={claimPayout} disabled={payoutLoading} className="py-2 rounded-2xl bg-emerald-500 text-black font-bold">{payoutLoading ? '...' : 'CLAIM PAYOUT'}</button>}
            <button onClick={onClose} className="py-2 rounded border border-white/20 light:border-slate-400 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-900/5">CLOSE</button>
          </div>
          {oracleError && <div className="mt-2 text-[10px] text-amber-300 light:text-amber-600 text-center">{oracleError}</div>}
        </div>
      </div>

      {/* mobile footer */}
      <div className="lg:hidden border-t border-white/10 light:border-slate-300/70 bg-black/60 light:bg-white/80 px-3 py-2">
        <div className="flex gap-2">
          {!result && myColor && status === 'active' && <button onClick={resign} className="flex-1 py-2 bg-red-600/90 rounded-xl text-xs text-white font-bold">RESIGN</button>}
          {result && !oracleSubmitted && <button onClick={submitToOracle} className="flex-1 py-2 bg-[#49EACB] text-black rounded-2xl text-sm font-bold" disabled={oracleLoading}>{oracleLoading ? '...' : 'SUBMIT'}</button>}
          {oracleSubmitted && !payoutResult && <button onClick={claimPayout} className="flex-1 py-2 bg-emerald-500 text-black rounded-2xl text-sm font-bold" disabled={payoutLoading}>{payoutLoading ? '...' : 'CLAIM'}</button>}
          <button onClick={onClose} className="px-3 min-h-[44px] sm:min-h-0 border border-white/20 light:border-slate-400 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-900/5 rounded-xl text-xs">CLOSE</button>
        </div>
        {oracleError && <div className="mt-1 text-[10px] text-amber-300 light:text-amber-600">{oracleError}</div>}
        {result && !payoutResult && <div className="grid grid-cols-3 gap-2 text-[10px] text-center mt-2"><div className="bg-black/40 light:bg-white border border-white/10 light:border-slate-200 light:shadow-sm light:text-slate-600 p-1 rounded">Win {previewW}</div><div className="bg-black/40 light:bg-white border border-white/10 light:border-slate-200 light:shadow-sm light:text-slate-600 p-1 rounded">Fee {previewF}</div><div className="bg-black/40 light:bg-white border border-white/10 light:border-slate-200 light:shadow-sm light:text-slate-600 p-1 rounded">Pot {previewR}</div></div>}
      </div>

      {payoutResult && !payoutResult.error && (
        <div className="hidden lg:block max-w-sm mx-auto mb-2 p-3 border border-emerald-500/30 light:border-emerald-600/40 bg-emerald-500/5 light:bg-emerald-50 rounded-xl text-xs light:text-slate-700 light:shadow-sm">
          <div className="text-emerald-400 light:text-emerald-700 flex items-center gap-1"><CheckCircle2 size={12} /> PAYOUT COMPUTED</div>
          <div className="grid grid-cols-3 mt-1"><div>W {payoutResult.winner_share_kas} KAS</div><div>P {payoutResult.platform_fee_kas} KAS</div><div>Pot {payoutResult.pot_return_kas} KAS</div></div>
        </div>
      )}

      <div className="h-auto min-h-[2rem] border-t border-white/10 light:border-slate-300/70 text-[9px] sm:text-[10px] text-gray-500 light:text-slate-600 flex items-center justify-center text-center font-mono px-3 py-1.5 shrink-0">LEGAL FLIPS ONLY · DETERMINISTIC MOVE-LOG REPLAY · CO-SIGNED RELEASE · {potReturnPercent}% POT RETURN</div>
    </div>
  );
}
