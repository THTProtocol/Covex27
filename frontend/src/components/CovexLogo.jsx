/**
 * The Covex brand mark: a crystalline hexagonal "C" (the BlockDAG ring, open on
 * the right) studded with three isometric blocks - one at the top terminal, one
 * floating in the mouth, one on the lower arm. Faceted glass in the Kaspa teal,
 * with a soft glow. Pure SVG: crisp at any size, theme-aware, no image requests.
 */
export function CovexMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cvx-face-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7fbf4" />
          <stop offset="1" stopColor="#7fe9d8" />
        </linearGradient>
        <linearGradient id="cvx-face-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5cead3" />
          <stop offset="1" stopColor="#2bb6a3" />
        </linearGradient>
        <linearGradient id="cvx-face-right" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#33c6b2" />
          <stop offset="1" stopColor="#178f80" />
        </linearGradient>
        <linearGradient id="cvx-band" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#eafffb" />
          <stop offset="0.5" stopColor="#49EACB" />
          <stop offset="1" stopColor="#1c9d8c" />
        </linearGradient>
        <filter id="cvx-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#cvx-glow)">
        {/* Hexagonal C band: outer hexagon minus inner hexagon, open on the right.
            Drawn as one even-odd filled shape, then faceted with highlight seams. */}
        <path
          fillRule="evenodd"
          fill="url(#cvx-band)"
          d="M32 4 L56 18 L56 26 L44 19 L32 12 L14 22.5 L14 41.5 L32 52 L44 45 L56 38 L56 46 L32 60 L8 46 L8 18 Z"
        />
        {/* crystalline facet seams (white highlights) */}
        <g stroke="#eafffb" strokeWidth="0.9" strokeOpacity="0.65" strokeLinejoin="round" fill="none">
          <path d="M32 12 L14 22.5 L14 41.5 L32 52" />
          <path d="M32 4 L32 12 M8 18 L14 22.5 M8 46 L14 41.5 M32 60 L32 52" />
        </g>

        {/* Top-right isometric block (upper terminal of the C) */}
        <g>
          <path d="M49 17 L55 20.4 L49 23.8 L43 20.4 Z" fill="url(#cvx-face-top)" />
          <path d="M43 20.4 L49 23.8 L49 30.6 L43 27.2 Z" fill="url(#cvx-face-left)" />
          <path d="M55 20.4 L49 23.8 L49 30.6 L55 27.2 Z" fill="url(#cvx-face-right)" />
        </g>

        {/* Centre block, floating in the mouth of the C */}
        <g>
          <path d="M32 25 L39 29 L32 33 L25 29 Z" fill="url(#cvx-face-top)" />
          <path d="M25 29 L32 33 L32 41 L25 37 Z" fill="url(#cvx-face-left)" />
          <path d="M39 29 L32 33 L32 41 L39 37 Z" fill="url(#cvx-face-right)" />
        </g>

        {/* Lower-right block (lower arm of the C) */}
        <g>
          <path d="M49 40.2 L55 43.6 L49 47 L43 43.6 Z" fill="url(#cvx-face-top)" />
          <path d="M43 43.6 L49 47 L49 53.8 L43 50.4 Z" fill="url(#cvx-face-left)" />
          <path d="M55 43.6 L49 47 L49 53.8 L55 50.4 Z" fill="url(#cvx-face-right)" />
        </g>
      </g>
    </svg>
  );
}

/** Full lockup: mark + COVEX wordmark with the EX gradient accent. */
export default function CovexLogo({ size = 30 }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <CovexMark size={size} />
      <span className="covex-brand font-black leading-none tracking-[0.28em] text-[21px]">
        <span className="text-white light:text-slate-900">COV</span>
        <span className="bg-gradient-to-r from-[#49EACB] to-[#22D3EE] bg-clip-text text-transparent">EX</span>
      </span>
    </span>
  );
}
