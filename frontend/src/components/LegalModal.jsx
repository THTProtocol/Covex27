import { useState, useEffect } from 'react';
import { ShieldCheck } from '../lib/icons.js';
import { useDialog } from '../lib/useDialog';

export default function LegalModal({ onAccept }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [checked, setChecked] = useState(false);
  const canAccept = checked;
  const titleId = 'legal-modal-title';

  // This is a consent GATE, not a dismissable dialog: Escape must NOT bypass it (you cannot use
  // the platform without accepting). So useDialog gets a no-op onClose - it still traps focus,
  // moves focus in on open, and restores it on close, just never auto-closes on Escape.
  const dialogRef = useDialog({ open: visible, onClose: () => {} });

  useEffect(() => {
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible]);

  const handleAccept = () => {
    setFadeOut(true);
    setTimeout(() => {
      setVisible(false);
      onAccept?.();
    }, 300);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 light:bg-slate-900/40 backdrop-blur-xl transition-opacity duration-300 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-w-lg w-full rounded-2xl glass-heavy p-5 sm:p-8 flex flex-col max-h-[90dvh] transition-transform duration-300 outline-none ${fadeOut ? 'scale-95' : 'scale-100'}`}
      >
        <div className="flex items-center justify-center shrink-0">
          <div className="h-14 w-14 rounded-2xl bg-kaspa-green/10 light:bg-teal-50 border border-kaspa-green/30 light:border-teal-200 flex items-center justify-center">
            <ShieldCheck size={28} className="text-kaspa-green light:text-teal-600" />
          </div>
        </div>

        <h2 id={titleId} className="mt-5 text-xl font-semibold text-white light:text-slate-900 text-center shrink-0">Before you continue</h2>

        <div className="mt-5 space-y-3 text-xs text-gray-200 light:text-slate-700 leading-relaxed overflow-y-auto font-mono whitespace-pre-wrap pr-2 min-h-0 flex-1">
          <p className="text-gray-300 light:text-slate-700 font-semibold">
            Covex is non-custodial covenant infrastructure on the Kaspa BlockDAG. A few things to know before you proceed:
          </p>

          <div className="p-4 rounded-xl bg-kaspa-green/[0.06] light:bg-teal-50 border border-kaspa-green/20 light:border-teal-200 space-y-2">
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Covenants deployed to the Kaspa BlockDAG are <strong className="text-white light:text-slate-900">permanently immutable</strong>. They cannot be changed, deleted, or reversed by anyone, including Covex.</li>
              <li>Covex <strong className="text-white light:text-slate-900">does not create, modify, or control</strong> on-chain covenants. We index publicly visible data and generate optional UI interfaces for paid users.</li>
              <li>Covex <strong className="text-white light:text-slate-900">never stores or has access to your private keys</strong>. All signing happens in your own wallet. You control your own keys and your own actions.</li>
              <li>Covex is <strong className="text-white light:text-slate-900">neutral software, provided as-is</strong>, with no warranty. BlockDAG data may be subject to reorgs, latency, or incomplete propagation.</li>
              <li>On-chain payments in KAS are <strong className="text-white light:text-slate-900">non-refundable</strong> once confirmed on the Kaspa network.</li>
            </ul>
          </div>

          <p>
            For the full description of how Covex works and the limits of our role, see the
            <a href="/terms" className="text-kaspa-green hover:underline mx-1">Terms</a>.
          </p>
        </div>

        <div className="shrink-0 mt-5 pt-4 border-t border-white/10 light:border-slate-200 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 light:border-slate-300 bg-white/5 light:bg-white text-kaspa-green focus:ring-2 focus:ring-kaspa-green/40 focus:ring-offset-0"
            />
            <span className="text-xs text-gray-200 light:text-slate-700 leading-relaxed">
              I understand Covex is non-custodial, that I control my own keys, that covenant deployments are immutable, and that the software is provided as-is.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!canAccept}
            className={`w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30 light:focus:ring-slate-400/40 ${canAccept ? 'bg-white light:bg-slate-900 text-black light:text-white hover:bg-gray-200 light:hover:bg-slate-800 active:scale-[0.97]' : 'bg-white/[0.05] light:bg-slate-100 text-gray-200 light:text-slate-600 cursor-not-allowed border border-white/5 light:border-slate-200'}`}
          >
            Continue to Covex
          </button>
        </div>
      </div>
    </div>
  );
}
