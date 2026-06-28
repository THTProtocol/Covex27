/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
import { useEffect, useRef, useState } from 'react';
import { Zap, Gamepad2, X, Play } from 'lucide-react';
import ChessMini from './chess/ChessMini';
import { VERIFIED_FULL_ZK } from '../lib/zk/circuits';
import { PLAYABLE_GAME_KEYS } from '../lib/playableGames';
// Note: PokerMini, BlackjackMini, DiceMini etc. are intentionally not used here.
// Covex main pages (Explorer) must remain neutral - no gambling visuals (no
// cards, chips, or dice rendered). Non-chess board games get a NEUTRAL
// board-style mini-thumb plus the honest game name, never a "ZK Circuit" label
// that would be factually wrong for an oracle-attested game.

// Games we can render a small neutral preview for. Chess has its own native
// interactive mini; everything else falls through to the board-thumb tile.
// Sourced from the shared playable set so it stays in lockstep with the arena
// registry + the catalog's headline games (lib/playableGames.js).
const KNOWN_GAMES = new Set(PLAYABLE_GAME_KEYS);

// Normalize varied game_type / name spellings into our canonical KNOWN_GAMES key.
const normalizeGameKey = (raw) => {
  if (!raw) return null;
  const g = String(raw).toLowerCase();
  if (g.includes('chess')) return 'chess';
  if (g.includes('poker')) return 'poker';
  if (g.includes('blackjack') || g === 'bj' || g === '21') return 'blackjack';
  if (g.includes('checker') || g.includes('draught')) return 'checkers';
  if (g.includes('connect4') || g.includes('connect_4') || g.includes('connect-four')) return 'connect4';
  if (g.includes('reversi') || g.includes('othello')) return 'reversi';
  if (g === 'rps' || g.includes('rock_paper') || g.includes('rock-paper') || g.includes('rockpaper')) return 'rps';
  if (g.includes('tictactoe') || g.includes('tic_tac_toe') || g.includes('tic-tac-toe') || g === 'ttt') return 'tictactoe';
  return null;
};

// Detect game type from covenant data. Returns a KNOWN_GAMES key, or null when
// the covenant is not a recognized game (it may still be a ZK circuit).
const detectGameType = (covenant) => {
  // Try config game_type first - this is the authoritative declaration.
  try {
    const cfg = typeof covenant.custom_ui_config === 'string'
      ? JSON.parse(covenant.custom_ui_config)
      : covenant.custom_ui_config;
    const fromCfg = normalizeGameKey(cfg?.game_type);
    if (fromCfg) return fromCfg;
  } catch { /* best-effort; failure is non-fatal here */ }

  // Fallback: name / description / category sniffing.
  const name = (covenant.name || covenant.covenant_type || '').toLowerCase();
  const desc = (covenant.description || '').toLowerCase();
  const category = (covenant.category || '').toLowerCase();
  const combined = `${name} ${desc} ${category}`;
  return normalizeGameKey(combined);
};

// True only when the covenant is actually a ZK circuit (declared zk_circuit /
// circuit_type that resolves to a real verified circuit, OR enforcement_reality
// is in the ZK family). Used to gate the "ZK Circuit" label so we never slap it
// on an oracle-attested game covenant.
const isZkCircuitCovenant = (covenant) => {
  const reality = String(covenant.enforcement_reality || '').toLowerCase();
  if (reality === 'full-zk' || reality === 'hybrid') return true;
  try {
    const cfg = typeof covenant.custom_ui_config === 'string'
      ? JSON.parse(covenant.custom_ui_config)
      : covenant.custom_ui_config;
    const id = String(cfg?.zk_circuit || cfg?.circuit_type || '').toLowerCase();
    if (id && VERIFIED_FULL_ZK.has(id)) return true;
  } catch { /* best-effort; failure is non-fatal here */ }
  return false;
};

// Has actual custom UI HTML (from Covenant Studio / custom paste)
const hasCustomUI = (covenant) => {
  // List endpoints send a lightweight has_custom_ui flag; detail responses still
  // include the full custom_ui_html payload.
  if (covenant.has_custom_ui !== undefined) return !!covenant.has_custom_ui;
  return covenant.custom_ui_html && covenant.custom_ui_html.length > 50;
};

// ── Native React game previews (fast, no iframe) ──────────────────────────

const NativePreview = ({ gameType, covenant, compact }) => {
  if (gameType === 'chess') {
    // Chess is the only game with a full interactive native preview.
    return <ChessMini compact={compact} />;
  }
  if (gameType && KNOWN_GAMES.has(gameType)) {
    // Honest neutral tile for the other known games: board-style mini-thumb
    // plus the game name. No cards / chips / dice (Explorer stays neutral).
    return <GameThumbTile gameType={gameType} compact={compact} />;
  }
  // Not a recognized game. Only call it a ZK Circuit if the covenant actually
  // IS a ZK circuit; otherwise show a neutral covenant tile.
  return <GenericPreviewTile compact={compact} isZk={isZkCircuitCovenant(covenant)} />;
};

// Display name for a known game key, used in the neutral thumb tile + modal copy.
const GAME_LABEL = {
  chess: 'Chess',
  poker: 'Poker',
  blackjack: 'Blackjack',
  checkers: 'Checkers',
  connect4: 'Connect Four',
  reversi: 'Reversi',
  rps: 'Rock Paper Scissors',
  tictactoe: 'Tic Tac Toe',
};

// Neutral board-style mini-thumb for non-chess games. Pure geometry, no
// gambling iconography. Each game picks a grid that hints at its real board.
const GameThumbTile = ({ gameType, compact }) => {
  const label = GAME_LABEL[gameType] || gameType;
  // Grid shape per game. Stays abstract: just a grid + a couple of marker dots.
  const grid = (() => {
    switch (gameType) {
      case 'checkers':  return { cols: 8, rows: 8 };
      case 'reversi':   return { cols: 8, rows: 8 };
      case 'connect4':  return { cols: 7, rows: 6 };
      case 'tictactoe': return { cols: 3, rows: 3 };
      case 'poker':     return { cols: 5, rows: 1 };
      case 'blackjack': return { cols: 4, rows: 1 };
      case 'rps':       return { cols: 3, rows: 1 };
      default:          return { cols: 4, rows: 4 };
    }
  })();
  const cells = grid.cols * grid.rows;
  return (
    <div
      className="flex flex-col items-center justify-center bg-black/30 light:bg-black/[0.04] rounded-lg gap-2 px-3"
      style={{ height: compact ? '140px' : '220px' }}
      aria-label={`${label} covenant preview`}
    >
      <div
        className="grid gap-[2px] opacity-60"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          width: compact ? 72 : 104,
        }}
      >
        {Array.from({ length: cells }).map((_, i) => {
          const r = Math.floor(i / grid.cols);
          const dark = (r + i) % 2 === 0;
          return (
            <div
              key={i}
              className={dark ? 'bg-[#49EACB]/25' : 'bg-white/10 light:bg-black/10'}
              style={{ aspectRatio: '1 / 1', borderRadius: 1 }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-gray-200 light:text-gray-700 font-mono uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
};

// Fallback tile when the covenant is not a recognized game. Only says "ZK
// Circuit" when the covenant actually is one; otherwise a neutral covenant tile.
const GenericPreviewTile = ({ compact, isZk }) => {
  return (
    <div className="flex items-center justify-center bg-black/30 light:bg-black/[0.04] rounded-lg"
      style={{ height: compact ? '140px' : '220px' }}>
      <div className="text-center">
        <div className="text-4xl mb-2"><Zap size={40} className="mx-auto text-gray-400 light:text-slate-500" /></div>
        <p className="text-xs text-gray-200 light:text-gray-700 font-mono uppercase tracking-wider">
          {isZk ? 'ZK Circuit' : 'Covenant'}
        </p>
      </div>
    </div>
  );
};

// ── Iframe-based custom UI preview (lazy loaded) ─────────────────────────

const IframePreview = ({ covenant, visible, large = false }) => {
  const iframeRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const height = large ? '480px' : '140px';
  const scale = large ? '0.55' : '0.35';

  useEffect(() => {
    if (!visible || !covenant.custom_ui_html || loaded) return;
    const tm = setTimeout(() => {
      if (iframeRef.current) {
        try {
          const blob = new Blob(
            [`<html><head><style>body{margin:0;overflow:hidden;transform:scale(${scale});transform-origin:0 0;width:calc(100% / ${scale});height:calc(100% / ${scale});}</style></head><body>${covenant.custom_ui_html}</body></html>`],
            { type: 'text/html' }
          );
          iframeRef.current.src = URL.createObjectURL(blob);
          setLoaded(true);
        } catch { /* best-effort; failure is non-fatal here */ }
      }
    }, 100);
    return () => clearTimeout(tm);
  }, [visible, covenant.custom_ui_html, loaded, scale]);

  if (!visible) {
    return (
      <div className="bg-black/20 rounded-lg flex items-center justify-center text-gray-200 text-xs font-mono"
        style={{ height }}>
        <div className="text-center">
          <svg className="w-5 h-5 mx-auto mb-1 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          Scroll to preview
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-black/30" style={{ height }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-5 h-5 border-2 border-kaspa-green/30 border-t-kaspa-green rounded-full animate-spin" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        title="Covenant UI Preview"
        className="w-full h-full border-0 pointer-events-none"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
};

// ── Main GamePreview Component ───────────────────────────────────────────

const GamePreview = ({ covenant, compact = false, large = false }) => {
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const gameType = detectGameType(covenant);
  const customUI = hasCustomUI(covenant);

  // If no game type detected and no custom UI - no preview
  if (!gameType && !customUI) return null;

  // Choose preview strategy: native React for any recognized game (chess gets
  // the interactive mini, the rest get a neutral board-thumb tile). Custom UI
  // covenants without a recognized game_type fall through to the iframe path.
  const useNative = !!gameType && KNOWN_GAMES.has(gameType);

  // Premium covenants with custom UI get a large preview (350px), others compact (140px) or normal (200px)
  const previewHeight = large ? 350 : compact ? 140 : 200;

  return (
    <div ref={containerRef} className="relative group/preview">
      {/* Preview area */}
      <div
        className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 mb-3 cursor-pointer transition-all duration-300 hover:border-kaspa-green/30 hover:shadow-[0_0_15px_rgba(73,234,203,0.15)]"
        style={{ height: `${previewHeight}px` }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setExpanded(true);
        }}
        title="Click to preview game"
      >
        {/* Subtle scanline overlay */}
        <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-b from-transparent 50% to-black/20 light:to-slate-900/[0.06]" />

        {/* Decorative corner accents */}
        <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-kaspa-green/20 rounded-tl pointer-events-none z-10" />
        <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-kaspa-green/20 rounded-tr pointer-events-none z-10" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-kaspa-green/20 rounded-bl pointer-events-none z-10" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-kaspa-green/20 rounded-br pointer-events-none z-10" />

        {/* Preview content */}
        {useNative ? (
          <NativePreview gameType={gameType} covenant={covenant} compact={compact} />
        ) : (
          <IframePreview covenant={covenant} visible={visible} />
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 opacity-0 group-hover/preview:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="flex items-center gap-2 bg-[#49EACB] text-black px-4 py-2 rounded-xl font-bold text-xs shadow-[0_0_20px_rgba(73,234,203,0.4)]">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {useNative ? 'Play Game' : 'Preview UI'}
          </div>
        </div>

        {/* Game badge */}
        {gameType && (
          <div className="absolute top-2 right-2 z-20 px-2 py-0.5 text-[9px] font-bold rounded-full bg-[#49EACB]/10 border border-[#49EACB]/25 text-[#49EACB] uppercase tracking-wider pointer-events-none">
            {gameType}
          </div>
        )}
      </div>

      {/* Expanded Modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setExpanded(false)}
        >
          <div
            className="glass-panel detail-hero-enhanced relative w-full max-w-3xl max-h-[90vh] mx-4 border border-kaspa-green/30 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(73,234,203,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient aurora behind the modal header (no intrinsic size: width/height + centering set inline) */}
            <div className="covex-aurora" aria-hidden="true" style={{ top: -30, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 360, height: 190, maxWidth: '90vw', opacity: 0.5 }} />

            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30 flex items-center justify-center">
                    <Gamepad2 className="w-4 h-4 text-kaspa-green" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {covenant.name || covenant.covenant_type || 'Covenant'} Preview
                    </h3>
                    <p className="text-[10px] text-gray-200 font-mono">
                      {gameType ? `${GAME_LABEL[gameType] || gameType} game` : 'Custom interactive UI'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-200 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preview content - larger */}
              <div className="p-4" style={{ height: '480px' }}>
                {useNative ? (
                  <NativePreview gameType={gameType} covenant={covenant} compact={false} />
                ) : (
                  <IframePreview covenant={covenant} visible={true} large />
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t border-white/5">
                <p className="text-[10px] text-gray-200">
                  Full interactive experience available on the covenant page
                </p>
                <a
                  href={`/covenant/${encodeURIComponent(covenant.tx_id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setExpanded(false);
                    window.location.href = `/covenant/${encodeURIComponent(covenant.tx_id)}`;
                  }}
                  className="btn-shimmer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold text-xs transition-all shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.5)]"
                >
                  <Play className="w-3.5 h-3.5" /> Open Full Game
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamePreview;
export { detectGameType, hasCustomUI };
