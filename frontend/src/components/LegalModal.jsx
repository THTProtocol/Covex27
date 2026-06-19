import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

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
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 light:bg-slate-900/40 backdrop-blur-xl transition-opacity duration-300 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className={`max-w-lg w-full rounded-2xl glass-heavy p-5 sm:p-8 flex flex-col max-h-[90dvh] transition-transform duration-300 ${fadeOut ? 'scale-95' : 'scale-100'}`}>
        <div className="flex items-center justify-center shrink-0">
          <div className="h-14 w-14 rounded-2xl bg-red-500/10 light:bg-red-50 border border-red-500/30 light:border-red-200 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-400 light:text-red-600" />
          </div>
        </div>

        <h2 className="mt-5 text-xl font-semibold text-white light:text-slate-900 text-center shrink-0">Important Legal Disclaimer</h2>

        <div className="mt-5 space-y-3 text-xs text-gray-200 light:text-slate-700 leading-relaxed overflow-y-auto font-mono whitespace-pre-wrap pr-2 min-h-0 flex-1">
          <p className="text-gray-300 light:text-slate-700 font-semibold">
            Covex is a non-custodial BlockDAG explorer and SaaS platform. By proceeding, you acknowledge and agree to the following:
          </p>

          <div className="p-4 rounded-xl bg-red-500/[0.06] light:bg-red-50 border border-red-500/20 light:border-red-200 space-y-2">
            <p className="text-red-400 light:text-red-600 font-semibold text-sm">Critical Notices:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Covenants deployed to the Kaspa BlockDAG are <strong className="text-white light:text-slate-900">permanently immutable</strong>. They cannot be changed, deleted, or reversed by anyone, including Covex.</li>
              <li>Covex <strong className="text-white light:text-slate-900">does not create, modify, or have any control</strong> over on-chain covenants. We only index publicly visible data and generate optional UI interfaces for paid users.</li>
              <li>Covex <strong className="text-white light:text-slate-900">never stores or has access to your private keys</strong>. All signing and transaction authorization occurs exclusively within your own wallet application.</li>
              <li>It is <strong className="text-white light:text-slate-900">solely your responsibility</strong> to ensure any covenant you create, deploy, or interact with is legal in your jurisdiction.</li>
              <li>Covex provides <strong className="text-white light:text-slate-900">no legal, financial, or investment advice</strong>. We are a technology platform, not a law firm or financial advisor.</li>
              <li>Some covenants, markets, and games you discover or generate through Covex <strong className="text-white light:text-slate-900">involve staking value</strong>. Covex provides software and interfaces only, and you are solely responsible for ensuring your use is legal in your jurisdiction.</li>
              <li>All payments occur <strong className="text-white light:text-slate-900">on-chain in KAS</strong>. After payment confirmation, users receive exactly the service promised: account upgrade, interactive UI generation, and visibility boost.</li>
              <li>Payments are <strong className="text-white light:text-slate-900">non-refundable</strong> once confirmed on the Kaspa network.</li>
              <li>Covex provides <strong className="text-white light:text-slate-900">no warranty of any kind</strong>. BlockDAG data may be subject to reorgs, latency, or incomplete propagation.</li>
            </ul>
          </div>

          <p>
            By clicking Accept, you confirm you have read, understood, and agree to the full
            <a href="/terms" className="text-kaspa-green hover:underline mx-1">Terms and Conditions</a>
            available on this platform. You accept all risks associated with using a decentralized BlockDAG
            protocol and agree that Covex and its developers bear no liability for any outcomes.
          </p>
        </div>

        <div className="shrink-0 mt-5 pt-4 border-t border-white/10 light:border-slate-200 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 light:border-slate-300 bg-white/5 light:bg-white text-kaspa-green focus:ring-kaspa-green/30"
            />
            <span className="text-xs text-gray-200 light:text-slate-700 leading-relaxed">
              I have read and agree to the Covex Terms and Conditions, including the non-custodial nature of the platform, immutable covenant deployments, on-chain payment terms, SaaS subscription terms, SilverScript compiler disclaimer, no liability for locked funds, and acceptable use policy.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!checked}
            className={`w-full px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30 light:focus:ring-slate-400/40 ${checked ? 'bg-white light:bg-slate-900 text-black light:text-white hover:bg-gray-200 light:hover:bg-slate-800 active:scale-[0.97]' : 'bg-white/[0.05] light:bg-slate-100 text-gray-200 light:text-slate-400 cursor-not-allowed border border-white/5 light:border-slate-200'}`}
          >
            I Accept and Understand the Risks
          </button>

          <p className="text-xs text-gray-200 light:text-slate-500 text-center">
            You must accept these terms before using the Covenant Creator.
          </p>
        </div>
      </div>
    </div>
  );
}
