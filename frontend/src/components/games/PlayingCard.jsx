import { memo } from 'react';

/**
 * Premium playing-card renderer shared by Covex card games (blackjack, poker).
 *
 * Pure CSS + inline SVG, zero dependencies. This component renders ONLY visuals;
 * it carries no game logic and never touches move encodings. Callers pass the
 * rank/suit they already decoded and decide what to show.
 *
 * Props:
 *   rank      one of '2'..'10','J','Q','K','A'
 *   suit      'S' | 'H' | 'D' | 'C'  (spade / heart / diamond / club)
 *   faceDown  render the branded Kaspa back instead of the face (default false)
 *   width     card width in px; height follows a 5:7 aspect ratio (default 64)
 *   flipping  play a ~300ms rotateY flip from back to face (default false)
 *   highlight add a kaspa-green winning-card ring (default false)
 */

const RED = '#d4233a';
const BLACK = '#1a1a22';
const KASPA_GREEN = '#49EACB';
const KASPA_GOLD = '#E8AF34';

const isRed = (suit) => suit === 'H' || suit === 'D';
const suitColor = (suit) => (isRed(suit) ? RED : BLACK);

// ── Inline SVG suit glyphs (no OS emoji) ─────────────────────────────
// Each glyph draws inside a 0..100 viewBox so it scales cleanly at any size.
function SuitGlyph({ suit, color, size, style }) {
  const common = { width: size, height: size, viewBox: '0 0 100 100', style, 'aria-hidden': true };
  switch (suit) {
    case 'H':
      return (
        <svg {...common}>
          <path fill={color} d="M50 88 C20 64 8 48 8 32 C8 18 18 10 30 10 C40 10 47 16 50 24 C53 16 60 10 70 10 C82 10 92 18 92 32 C92 48 80 64 50 88 Z" />
        </svg>
      );
    case 'D':
      return (
        <svg {...common}>
          <path fill={color} d="M50 6 L86 50 L50 94 L14 50 Z" />
        </svg>
      );
    case 'S':
      return (
        <svg {...common}>
          <path fill={color} d="M50 8 C50 8 14 38 14 58 C14 72 24 80 35 80 C41 80 46 77 49 73 C47 82 43 88 36 92 L64 92 C57 88 53 82 51 73 C54 77 59 80 65 80 C76 80 86 72 86 58 C86 38 50 8 50 8 Z" />
        </svg>
      );
    case 'C':
    default:
      return (
        <svg {...common}>
          <path fill={color} d="M50 10 A16 16 0 0 1 63 36 A16 16 0 1 1 66 64 C60 62 55 60 52 56 C54 70 58 80 66 88 L34 88 C42 80 46 70 48 56 C45 60 40 62 34 64 A16 16 0 1 1 37 36 A16 16 0 0 1 50 10 Z" />
        </svg>
      );
  }
}

// ── Corner index (rank + small suit), used top-left and rotated bottom-right ──
function CornerIndex({ rank, suit, color, w }) {
  const display = rank === '10' ? '10' : rank;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        color,
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 800,
          fontSize: w * (display.length > 1 ? 0.2 : 0.24),
          letterSpacing: '-0.04em',
        }}
      >
        {display}
      </span>
      <SuitGlyph suit={suit} color={color} size={w * 0.16} style={{ marginTop: w * 0.01 }} />
    </div>
  );
}

// ── Canonical pip layouts for ranks 2..10 ────────────────────────────
// Coordinates are fractions of the inner pip area (0..1, top-left origin).
// Pips in the bottom half are drawn rotated 180deg, matching real cards.
const PIP_LAYOUTS = {
  '2': [[0.5, 0.08], [0.5, 0.92]],
  '3': [[0.5, 0.08], [0.5, 0.5], [0.5, 0.92]],
  '4': [[0.25, 0.08], [0.75, 0.08], [0.25, 0.92], [0.75, 0.92]],
  '5': [[0.25, 0.08], [0.75, 0.08], [0.5, 0.5], [0.25, 0.92], [0.75, 0.92]],
  '6': [[0.25, 0.08], [0.75, 0.08], [0.25, 0.5], [0.75, 0.5], [0.25, 0.92], [0.75, 0.92]],
  '7': [[0.25, 0.08], [0.75, 0.08], [0.5, 0.29], [0.25, 0.5], [0.75, 0.5], [0.25, 0.92], [0.75, 0.92]],
  '8': [[0.25, 0.08], [0.75, 0.08], [0.5, 0.29], [0.25, 0.5], [0.75, 0.5], [0.5, 0.71], [0.25, 0.92], [0.75, 0.92]],
  '9': [[0.25, 0.08], [0.75, 0.08], [0.25, 0.36], [0.75, 0.36], [0.5, 0.5], [0.25, 0.64], [0.75, 0.64], [0.25, 0.92], [0.75, 0.92]],
  '10': [[0.25, 0.08], [0.75, 0.08], [0.5, 0.22], [0.25, 0.36], [0.75, 0.36], [0.25, 0.64], [0.75, 0.64], [0.5, 0.78], [0.25, 0.92], [0.75, 0.92]],
};

function PipField({ rank, suit, color, w }) {
  const layout = PIP_LAYOUTS[rank] || [];
  const pip = w * 0.2;
  return (
    <div style={{ position: 'absolute', inset: `${w * 0.26}px ${w * 0.16}px`, pointerEvents: 'none' }}>
      {layout.map(([x, y], idx) => (
        <div
          key={idx}
          style={{
            position: 'absolute',
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            transform: `translate(-50%, -50%) rotate(${y > 0.5 ? 180 : 0}deg)`,
          }}
        >
          <SuitGlyph suit={suit} color={color} size={pip} />
        </div>
      ))}
    </div>
  );
}

// ── Ace: one large centered glyph ────────────────────────────────────
function AceField({ suit, color, w }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <SuitGlyph suit={suit} color={color} size={w * 0.52} />
    </div>
  );
}

// ── Simple crown / figure SVGs for the court panel ───────────────────
function CourtFigure({ rank, color, size }) {
  if (rank === 'K') {
    // King: tall crown
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <path fill={color} d="M20 70 L18 36 L34 50 L50 28 L66 50 L82 36 L80 70 Z" />
        <rect x="20" y="70" width="60" height="9" rx="2" fill={color} />
        <circle cx="18" cy="32" r="5" fill={color} />
        <circle cx="50" cy="22" r="5" fill={color} />
        <circle cx="82" cy="32" r="5" fill={color} />
      </svg>
    );
  }
  if (rank === 'Q') {
    // Queen: rounded tiara
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <path fill={color} d="M22 72 C20 50 26 42 32 50 C38 58 44 40 50 40 C56 40 62 58 68 50 C74 42 80 50 78 72 Z" />
        <rect x="24" y="72" width="52" height="8" rx="3" fill={color} />
        <circle cx="32" cy="44" r="4" fill={color} />
        <circle cx="50" cy="34" r="4" fill={color} />
        <circle cx="68" cy="44" r="4" fill={color} />
      </svg>
    );
  }
  // Jack: simple helm / cap
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path fill={color} d="M24 70 C24 44 38 32 50 32 C62 32 76 44 76 70 Z" />
      <rect x="22" y="70" width="56" height="9" rx="3" fill={color} />
      <rect x="46" y="20" width="8" height="16" rx="2" fill={color} />
      <circle cx="50" cy="18" r="6" fill={color} />
    </svg>
  );
}

function CourtPanel({ rank, suit, color, w }) {
  // A framed colored ground with a large letter and a figure.
  const ground = isRed(suit) ? 'rgba(212,35,58,0.08)' : 'rgba(26,26,34,0.07)';
  return (
    <div
      style={{
        position: 'absolute',
        inset: `${w * 0.24}px ${w * 0.13}px`,
        borderRadius: w * 0.05,
        background: `linear-gradient(160deg, ${ground}, rgba(232,175,52,0.06))`,
        border: `1.5px solid ${color}`,
        boxShadow: `inset 0 0 0 ${Math.max(1, w * 0.015)}px ${KASPA_GOLD}55`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: w * 0.02,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 800,
          fontSize: w * 0.42,
          color,
          lineHeight: 0.9,
        }}
      >
        {rank}
      </span>
      <CourtFigure rank={rank} color={color} size={w * 0.34} />
    </div>
  );
}

// ── Card faces ───────────────────────────────────────────────────────
function CardFace({ rank, suit, w, h }) {
  const color = suitColor(suit);
  const isCourt = rank === 'J' || rank === 'Q' || rank === 'K';
  const isAce = rank === 'A';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: w,
        height: h,
        borderRadius: w * 0.1,
        background: 'linear-gradient(160deg, #ffffff 0%, #f4f4f7 100%)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.06)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        overflow: 'hidden',
      }}
    >
      {/* top-left index */}
      <div style={{ position: 'absolute', top: w * 0.06, left: w * 0.07 }}>
        <CornerIndex rank={rank} suit={suit} color={color} w={w} />
      </div>
      {/* bottom-right index, rotated 180 */}
      <div style={{ position: 'absolute', bottom: w * 0.06, right: w * 0.07, transform: 'rotate(180deg)' }}>
        <CornerIndex rank={rank} suit={suit} color={color} w={w} />
      </div>

      {/* center */}
      {isCourt ? (
        <CourtPanel rank={rank} suit={suit} color={color} w={w} />
      ) : isAce ? (
        <AceField suit={suit} color={color} w={w} />
      ) : (
        <PipField rank={rank} suit={suit} color={color} w={w} />
      )}
    </div>
  );
}

function CardBack({ w, h }) {
  // Branded kaspa-green geometric back with a subtle DAG motif (overlapping
  // diagonal gradients) and a thin gold inner border. No plain stripes.
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: w,
        height: h,
        borderRadius: w * 0.1,
        background: `
          radial-gradient(circle at 30% 22%, rgba(73,234,203,0.35), transparent 42%),
          radial-gradient(circle at 72% 78%, rgba(73,234,203,0.22), transparent 46%),
          repeating-linear-gradient(45deg, rgba(73,234,203,0.10) 0 6px, transparent 6px 13px),
          repeating-linear-gradient(-45deg, rgba(73,234,203,0.06) 0 6px, transparent 6px 13px),
          linear-gradient(155deg, #0b2a26 0%, #06151a 100%)`,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        overflow: 'hidden',
      }}
    >
      {/* thin gold border frame */}
      <div
        style={{
          position: 'absolute',
          inset: w * 0.07,
          borderRadius: w * 0.06,
          border: `1.5px solid ${KASPA_GOLD}99`,
          boxShadow: `inset 0 0 0 1px ${KASPA_GREEN}33`,
        }}
      />
      {/* center DAG diamond mark */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width={w * 0.42} height={w * 0.42} viewBox="0 0 100 100" aria-hidden>
          <g fill="none" stroke={KASPA_GREEN} strokeWidth="3" opacity="0.85">
            <path d="M50 14 L86 50 L50 86 L14 50 Z" />
            <circle cx="50" cy="14" r="5" fill={KASPA_GREEN} stroke="none" />
            <circle cx="86" cy="50" r="5" fill={KASPA_GREEN} stroke="none" />
            <circle cx="50" cy="86" r="5" fill={KASPA_GREEN} stroke="none" />
            <circle cx="14" cy="50" r="5" fill={KASPA_GREEN} stroke="none" />
            <path d="M50 14 L50 86 M14 50 L86 50" opacity="0.5" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function PlayingCardImpl({ rank, suit, faceDown = false, width = 64, flipping = false, highlight = false }) {
  const w = width;
  const h = Math.round(width * 1.4); // 5:7 aspect ratio

  // Highlight ring (winning-card emphasis)
  const ringStyle = highlight
    ? { boxShadow: `0 0 0 2px ${KASPA_GREEN}, 0 0 12px ${KASPA_GREEN}88`, borderRadius: w * 0.1 }
    : null;

  // When flipping, render both faces in a 3D-preserved container that rotates
  // from the back (180deg) to the face (0deg) over ~300ms.
  if (flipping) {
    return (
      <div style={{ width: w, height: h, perspective: 600, ...(ringStyle || {}) }}>
        <div
          className="pc-flip"
          style={{
            position: 'relative',
            width: w,
            height: h,
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            animation: 'pc-flip-anim 300ms ease-out forwards',
          }}
        >
          {/* back: starts facing viewer, rotates away */}
          <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(0deg)' }}>
            <CardBack w={w} h={h} />
          </div>
          {/* face: pre-rotated so it lands facing viewer at the end */}
          <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(180deg)' }}>
            <CardFace rank={rank} suit={suit} w={w} h={h} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: w, height: h, ...(ringStyle || {}) }}>
      {faceDown ? <CardBack w={w} h={h} /> : <CardFace rank={rank} suit={suit} w={w} h={h} />}
      {/* keyframes for the flip live here so the component is self-contained */}
      <style>{`
        @keyframes pc-flip-anim {
          from { transform: rotateY(180deg); }
          to   { transform: rotateY(360deg); }
        }
      `}</style>
    </div>
  );
}

const PlayingCard = memo(PlayingCardImpl);
export default PlayingCard;
