import { memo } from 'react';

/**
 * Casino chip graphics shared by Covex card games (blackjack, poker pots/bets).
 *
 * Pure CSS + inline SVG, zero dependencies. Visual only: chips carry no money
 * logic and never touch stakes, payouts, or move encodings. Callers pass the
 * numeric amount they already computed.
 */

// Standard casino denomination colors.
//  1 = gray, 5 = red, 25 = green, 100 = black, 500 = purple
const DENOMS = [
  { value: 500, base: '#7b3fa0', ring: '#b07cd0', text: '#ffffff' },
  { value: 100, base: '#1a1a22', ring: '#5a5a66', text: '#ffffff' },
  { value: 25, base: '#1f8a4c', ring: '#49EACB', text: '#ffffff' },
  { value: 5, base: '#c0303a', ring: '#f08a92', text: '#ffffff' },
  { value: 1, base: '#8a909c', ring: '#d4d8e0', text: '#10131a' },
];

const denomFor = (value) =>
  DENOMS.find((d) => d.value === value) || DENOMS.find((d) => d.value === 1);

/**
 * Single casino chip rendered as layered ellipses with an edge dash ring.
 * Props: value (denomination, default 25), size (px diameter, default 44).
 */
function ChipImpl({ value = 25, size = 44 }) {
  const d = denomFor(value);
  // 8 edge dashes evenly spaced around the rim.
  const dashes = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  const r = 50;
  const dashLen = 13; // angular-ish marker length in viewBox units

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
      aria-hidden
    >
      {/* outer rim */}
      <circle cx="50" cy="50" r={r - 2} fill={d.ring} />
      {/* edge dash markers: light wedges on the rim */}
      {dashes.map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = 50 + Math.cos(a) * (r - 7);
        const y = 50 + Math.sin(a) * (r - 7);
        return (
          <rect
            key={deg}
            x={x - dashLen / 2}
            y={y - 3}
            width={dashLen}
            height={6}
            rx={2}
            fill="#ffffff"
            opacity="0.85"
            transform={`rotate(${deg} ${x} ${y})`}
          />
        );
      })}
      {/* body */}
      <circle cx="50" cy="50" r={r - 11} fill={d.base} />
      {/* inner ring accent */}
      <circle cx="50" cy="50" r={r - 19} fill="none" stroke={d.ring} strokeWidth="2.5" opacity="0.9" />
      {/* subtle top highlight for depth */}
      <ellipse cx="50" cy="40" rx={r - 20} ry={r - 28} fill="#ffffff" opacity="0.08" />
      {/* denomination value */}
      <text
        x="50"
        y="50"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="800"
        fontSize={value >= 100 ? 26 : 30}
        fill={d.text}
      >
        {value}
      </text>
    </svg>
  );
}

export const Chip = memo(ChipImpl);

/**
 * Greedily break `amount` into standard denominations and render them as a
 * vertically offset stack, with the total labeled beneath.
 * Props: amount (total to represent), size (px chip diameter, default 40).
 */
function ChipStackImpl({ amount, size = 40 }) {
  const total = Math.max(0, Math.round(Number(amount) || 0));

  // Greedy denomination breakdown (largest first).
  const pieces = [];
  let rem = total;
  for (const d of DENOMS) {
    while (rem >= d.value && pieces.length < 24) {
      pieces.push(d.value);
      rem -= d.value;
    }
  }
  // If amount is below the smallest denomination but non-zero, still show one chip.
  if (pieces.length === 0 && total > 0) pieces.push(1);

  const overlap = size * 0.22; // vertical offset between stacked chips
  const stackHeight = pieces.length > 0 ? size + (pieces.length - 1) * overlap : size;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.12 }}>
      <div style={{ position: 'relative', width: size, height: stackHeight }}>
        {pieces.map((v, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              // bottom-up stacking: first (largest) chip sits at the bottom
              bottom: i * overlap,
              zIndex: i,
            }}
          >
            <Chip value={v} size={size} />
          </div>
        ))}
        {pieces.length === 0 && (
          <div style={{ width: size, height: size, opacity: 0.3 }}>
            <Chip value={1} size={size} />
          </div>
        )}
      </div>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: Math.max(10, size * 0.3),
          color: '#49EACB',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {total}
      </span>
    </div>
  );
}

export const ChipStack = memo(ChipStackImpl);
