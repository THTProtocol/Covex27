import { useState, useEffect } from 'react';

export default function LegalModal({ onAccept }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [checked, setChecked] = useState(false);

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
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl transition-opacity duration-300 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className={`max-w-lg w-full rounded-2xl bg-[#111116]/95 backdrop-blur-xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.6)] p-8 space-y-6 transition-transform duration-300 ${fadeOut ? 'scale-95' : 'scale-100'}`}>
        <div className="flex items-center justify-center">
          <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg className="h-7 w-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-white text-center">Important Legal Disclaimer</h2>

        <div className="space-y-3 text-xs text-gray-400 leading-relaxed max-h-60 overflow-y-auto font-mono whitespace-pre-wrap pr-2">
          <p className="text-gray-300 font-semibold">
            Covex is a non-custodial blockchain explorer and SaaS platform. By proceeding, you acknowledge and agree to the following:
          </p>

          <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20 space-y-2">
            <p className="text-red-400 font-semibold text-sm">Critical Notices:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Covenants deployed to the Kaspa BlockDAG are <strong className="text-white">permanently immutable</strong>. They cannot be changed, deleted, or reversed by anyone - including Covex.</li>
              <li>Covex <strong className="text-white">does not create, modify, or have any control</strong> over on-chain covenants. We only index publicly visible data and generate optional UI interfaces for paid users.</li>
              <li>Covex <strong className="text-white">never stores or has access to your private keys</strong>. All signing and transaction authorization occurs exclusively within your own wallet application.</li>
              <li>It is <strong className="text-white">solely your responsibility</strong> to ensure any covenant you create, deploy, or interact with is legal in your jurisdiction.</li>
              <li>Covex provides <strong className="text-white">no legal, financial, or investment advice</strong>. We are a technology platform, not a law firm or financial advisor.</li>
              <li>Covex has <strong className="text-white">no connection to predictive markets, gambling, or any illegal activity</strong>. We provide covenant indexing and UI generation tools only.</li>
              <li>All payments occur <strong className="text-white">on-chain in KAS</strong>. After payment confirmation, users receive exactly the service promised: account upgrade, interactive UI generation, and visibility boost.</li>
              <li>Payments are <strong className="text-white">non-refundable</strong> once confirmed on the Kaspa network.</li>
              <li>Covex provides <strong className="text-white">no warranty of any kind</strong>. Blockchain data may be subject to reorgs, latency, or incomplete propagation.</li>
            </ul>
          </div>

          <p>
            By clicking Accept, you confirm you have read, understood, and agree to the full
            <a href="/terms" className="text-kaspa-green hover:underline mx-1">Terms and Conditions</a>
            available on this platform. You accept all risks associated with using a decentralized blockchain
            protocol and agree that Covex and its developers bear no liability for any outcomes.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-kaspa-green focus:ring-kaspa-green/30"
          />
          <span className="text-xs text-gray-400 leading-relaxed">
            I have read and agree to the Covex Terms and Conditions, including the non-custodial nature of the platform, immutable covenant deployments, on-chain payment terms, SaaS subscription terms, SilverScript compiler disclaimer, no liability for locked funds, and acceptable use policy.
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked}
          className={`w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30 ${checked ? 'bg-white text-black hover:bg-gray-200 active:scale-[0.97]' : 'bg-white/[0.05] text-gray-600 cursor-not-allowed border border-white/5'}`}
        >
          I Accept and Understand the Risks
        </button>

        <p className="text-xs text-gray-600 text-center">
          You must accept these terms before using the Covenant Creator.
        </p>
      </div>
    </div>
  );
}
