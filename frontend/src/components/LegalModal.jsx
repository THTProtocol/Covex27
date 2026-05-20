import { useState, useEffect } from 'react';

/* ───────────────────────────────────────────────────────────────────
   LegalModal — full-screen glassmorphism legal warning overlay
   Blocks all interaction until the user accepts.
   ─────────────────────────────────────────────────────────────────── */

export default function LegalModal({ onAccept }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible]);

  const handleAccept = () => {
    setFadeOut(true);
    // Let the fade animation play, then remove
    setTimeout(() => {
      setVisible(false);
      onAccept?.();
    }, 300);
  };

  if (!visible) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-6
        bg-black/80 backdrop-blur-xl
        transition-opacity duration-300
        ${fadeOut ? 'opacity-0' : 'opacity-100'}
      `}
    >
      <div
        className={`
          max-w-lg w-full rounded-2xl
          bg-[#111116]/95 backdrop-blur-xl
          border border-white/10
          shadow-[0_0_80px_rgba(0,0,0,0.6)]
          p-8 space-y-6
          transition-transform duration-300
          ${fadeOut ? 'scale-95' : 'scale-100'}
        `}
      >
        {/* Icon */}
        <div className="flex items-center justify-center">
          <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg className="h-7 w-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-white text-center">
          Important Legal Notice
        </h2>

        {/* Body */}
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Covex is a <strong className="text-white">non-custodial</strong> explorer.
            Users are solely responsible for their covenants. Hosting or deploying
            illegal, malicious, or exploitative smart contracts is strictly
            prohibited.
          </p>

          <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20 text-xs text-gray-400 space-y-2">
            <p className="text-red-400 font-semibold">
              By proceeding, you acknowledge and agree that:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Covenants are immutable once deployed to the Kaspa network.</li>
              <li>Covex does not review, audit, or endorse any covenant code.</li>
              <li>You bear full legal and financial responsibility for the covenants you create and deploy.</li>
              <li>Violations of applicable law or platform policy may result in permanent delisting.</li>
            </ul>
          </div>
        </div>

        {/* Accept button */}
        <button
          onClick={handleAccept}
          className="
            w-full px-6 py-3.5 rounded-xl
            bg-white text-black font-semibold text-sm
            hover:bg-gray-200
            active:scale-[0.97]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-white/30
          "
        >
          I Agree and Understand the Risks
        </button>

        {/* Reject hint */}
        <p className="text-xs text-gray-600 text-center">
          You must accept these terms before using the Covenant Creator.
        </p>
      </div>
    </div>
  );
}
