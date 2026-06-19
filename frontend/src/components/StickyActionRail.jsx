import { useEffect, useState } from 'react';
import { Share2, ArrowRight } from 'lucide-react';
import WalletButton from '../components/WalletButton';

/**
 * StickyActionRail
 *
 * Premium right-rail on desktop / bottom-sheet on mobile for covenant pages.
 *
 * - Desktop (lg+): fixed right-rail, sticky position via top-24, 280px wide.
 * - Mobile  (<lg): fixed bottom-sheet, full-width, safe-area-inset-bottom
 *   padding, slides up on scroll. prefers-reduced-motion drops the slide.
 *
 * Honesty: this rail does not assert that any action is "trustless". The
 * primary action label and any extraActions are supplied by the caller and
 * should already reflect the covenant's enforcement reality
 * (consensus-enforced vs oracle-cosigned vs metadata).
 */
export default function StickyActionRail({
  covenant,
  onStake,
  onShare,
  primaryLabel = 'Stake',
  extraActions = [],
}) {
  // Mobile slide-up: hidden until the user has scrolled past the hero.
  // Disabled under prefers-reduced-motion (always visible, no transform).
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else if (mq.removeListener) mq.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (reduceMotion) {
      setVisible(true);
      return;
    }
    const onScroll = () => {
      setVisible(window.scrollY > 120);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reduceMotion]);

  const handlePrimary = () => {
    if (typeof onStake === 'function') onStake(covenant);
  };
  const handleShare = () => {
    if (typeof onShare === 'function') onShare(covenant);
  };

  const primaryBtn = (
    <button
      type="button"
      onClick={handlePrimary}
      className="btn-shimmer w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm shadow-[0_0_20px_rgba(73,234,203,0.25)] hover:shadow-[0_0_28px_rgba(73,234,203,0.45)] transition-all"
    >
      <span>{primaryLabel}</span>
      <ArrowRight size={15} aria-hidden="true" />
    </button>
  );

  const shareBtn = (
    <button
      type="button"
      onClick={handleShare}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-white text-gray-200 light:text-slate-700 hover:text-white light:hover:text-slate-900 hover:border-kaspa-green/40 hover:bg-kaspa-green/[0.06] light:hover:bg-kaspa-green/[0.08] text-sm font-medium transition-all"
    >
      <Share2 size={14} aria-hidden="true" />
      <span>Share</span>
    </button>
  );

  const renderExtras = () => {
    if (!Array.isArray(extraActions) || extraActions.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        {extraActions.map((a, i) => {
          if (!a) return null;
          const { label, onClick, icon: Icon, disabled } = a;
          return (
            <button
              key={a.key || `${label || 'action'}-${i}`}
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-transparent text-xs font-medium text-gray-300 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:bg-white/[0.04] light:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {Icon ? <Icon size={13} aria-hidden="true" /> : null}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // ---------- Desktop rail (lg+) ----------
  const desktop = (
    <aside
      aria-label="Covenant actions"
      className="hidden xl:block fixed top-24 right-6 w-[280px] z-30"
    >
      <div className="sticky top-24 rounded-2xl border border-white/10 light:border-slate-200 bg-white/5 light:bg-white/80 backdrop-blur-xl p-4 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] light:shadow-[0_8px_28px_-12px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3">
          <WalletButton />
          {primaryBtn}
          {shareBtn}
          {renderExtras()}
        </div>
      </div>
    </aside>
  );

  // ---------- Mobile bottom-sheet (<lg) ----------
  const sheetTransform = reduceMotion
    ? 'translate-y-0'
    : visible
      ? 'translate-y-0'
      : 'translate-y-[120%]';

  const mobile = (
    <div
      aria-label="Covenant actions"
      role="region"
      className={`xl:hidden fixed inset-x-0 bottom-0 z-40 transform ${sheetTransform} ${
        reduceMotion ? '' : 'transition-transform duration-300 ease-out'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-3 mb-3 rounded-2xl border border-white/10 light:border-slate-200 bg-[#0a0a0a]/95 light:bg-white/95 backdrop-blur-xl p-3 shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.7)] light:shadow-[0_-8px_28px_-12px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0">{primaryBtn}</div>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share covenant"
              className="shrink-0 inline-flex items-center justify-center w-11 rounded-xl border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-white text-gray-200 light:text-slate-700 hover:text-white light:hover:text-slate-900 hover:border-kaspa-green/40 hover:bg-kaspa-green/[0.06] light:hover:bg-kaspa-green/[0.08] transition-all"
            >
              <Share2 size={15} aria-hidden="true" />
            </button>
          </div>
          <WalletButton />
          {renderExtras()}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {desktop}
      {mobile}
    </>
  );
}
