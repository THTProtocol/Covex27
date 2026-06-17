import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Zap, Gamepad2, X, Play } from 'lucide-react';
import ChessMini from './chess/ChessMini';
// Note: PokerMini, BlackjackMini, DiceMini etc. are intentionally not used here.
// Covex main pages (Explorer) must remain neutral - no gambling visuals.
// Only chess has a native React preview. All other ZK circuits show a generic badge.

// Detect game type from covenant data
const detectGameType = (covenant) => {
  const name = (covenant.name || covenant.covenant_type || '').toLowerCase();
  const desc = (covenant.description || '').toLowerCase();
  const category = (covenant.category || '').toLowerCase();
  const combined = `${name} ${desc} ${category}`;

  // Try config game_type first
  try {
    const cfg = typeof covenant.custom_ui_config === 'string'
      ? JSON.parse(covenant.custom_ui_config)
      : covenant.custom_ui_config;
    if (cfg?.game_type) {
      const gt = cfg.game_type.toLowerCase();
      if (gt.includes('chess')) return 'chess';
      // New ZK circuit types (non-game) return null - no game preview
      if (gt.includes('merkle') || gt.includes('range_proof') || gt.includes('age_verify') || gt.includes('verifiable')) return null;
    }
  } catch (_) {}

  // Fallback name-based detection - chess only
  if (combined.includes('chess') || combined.includes('chess_v1')) return 'chess';

  return null;
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
  switch (gameType) {
    case 'chess':
      // Chess is the only game with a full ZK-native interactive preview
      return <ChessMini compact={compact} />;
    default:
      // Non-game ZK circuit types (merkle, range, age, verifiable) use a generic circuit badge
      return <CircuitBadge compact={compact} />;
  }
};

const CircuitBadge = ({ compact }) => {
  return (
    <div className="flex items-center justify-center bg-black/30 rounded-lg"
      style={{ height: compact ? '140px' : '220px' }}>
      <div className="text-center">
        <div className="text-4xl mb-2"><Zap size={40} className="mx-auto text-gray-400" /></div>
        <p className="text-xs text-gray-200 font-mono uppercase tracking-wider">
          ZK Circuit
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
        } catch (_) {}
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

  // Choose preview strategy: native React for chess, iframe for custom UI
  const useNative = gameType === 'chess';

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
        <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-b from-transparent 50% to-black/20" />

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
                      {gameType ? `${gameType} game` : 'Custom interactive UI'}
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
