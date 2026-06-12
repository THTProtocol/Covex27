/**
 * The Covex brand mark: a hexagonal block (the BlockDAG) holding a "C" formed
 * by an open orbital ring with three linked nodes (parallel blocks linking),
 * drawn in the Kaspa teal-to-cyan gradient. Pure SVG: crisp at any size,
 * theme-aware, no image requests.
 */
export function CovexMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cvx-g" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#49EACB" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <filter id="cvx-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* hexagon frame */}
      <path
        d="M24 3 41.3 13v20L24 43 6.7 33V13L24 3Z"
        stroke="url(#cvx-g)"
        strokeWidth="2.4"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {/* open C ring */}
      <path
        d="M32.5 15.5a11.5 11.5 0 1 0 0 17"
        stroke="url(#cvx-g)"
        strokeWidth="3.6"
        strokeLinecap="round"
        filter="url(#cvx-glow)"
      />
      {/* DAG nodes: three linked blocks at the C opening */}
      <path d="M32.5 15.5 38 12.8M32.5 32.5 38 35.2M38 12.8v22.4" stroke="url(#cvx-g)" strokeWidth="1.6" opacity="0.7" />
      <circle cx="32.5" cy="15.5" r="2.6" fill="url(#cvx-g)" />
      <circle cx="32.5" cy="32.5" r="2.6" fill="url(#cvx-g)" />
      <circle cx="38" cy="24" r="3.1" fill="url(#cvx-g)" filter="url(#cvx-glow)" />
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
