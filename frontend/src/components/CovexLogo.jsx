/**
 * The Covex brand mark: the crystalline hexagonal "C" with isometric blocks,
 * rendered from the brand artwork (public/covex-logo-192.png). Shown as a small
 * rounded badge so the artwork's dark backdrop reads as an intentional chip on
 * both light and dark surfaces.
 */
export function CovexMark({ size = 30, decorative = false }) {
  return (
    <img
      src="/covex-logo-192.png"
      alt={decorative ? '' : 'Covex'}
      width={size}
      height={size}
      decoding="async"
      className="rounded-lg shrink-0"
      style={{ boxShadow: '0 0 10px rgba(73, 234, 203, 0.25)' }}
    />
  );
}

/** Full lockup: mark + COVEX wordmark with the EX gradient accent. */
export default function CovexLogo({ size = 30 }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <CovexMark size={size} decorative />
      <span className="covex-brand font-black leading-none tracking-[0.28em] text-[21px]">
        <span className="text-white light:text-slate-900">COV</span>
        <span className="bg-gradient-to-r from-[#49EACB] to-[#22D3EE] bg-clip-text text-transparent">EX</span>
      </span>
    </span>
  );
}
