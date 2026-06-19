import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { X, ArrowRight, Compass } from 'lucide-react';
import { enforcementSummary } from '../lib/enforcement-copy';

/*
 * FirstCovenantTour
 *
 * 7-step coachmark tour for new visitors. Honesty-first copy: the tour describes
 * enforcement reality (consensus-enforced primitives vs. oracle co-signed
 * outcomes) and never claims trustless / on-chain ZK / non-custodial.
 *
 * Activation:
 *   - URL query param ?tour=1, OR
 *   - localStorage flag covex_tour_active=1
 *
 * Skip persists via localStorage covex_tour_skipped=1.
 *
 * The component is self-contained: it does NOT touch covenant id binding,
 * signing paths, or broadcast logic. It is a pure overlay reading
 * data-tour="step-id" attributes already present (or expected) in the host
 * pages, and routing the user via react-router useNavigate.
 *
 * To wire a target element, add data-tour="<step-id>" to it. The step ids are:
 *   explorer-hero, build-cta, sandbox-create, sandbox-logic, sandbox-deploy,
 *   studio-block, public-page.
 *
 * If the matching element is not on screen for the current route, the
 * coachmark falls back to a centered modal so the tour never gets stuck.
 */

const STORAGE_ACTIVE = 'covex_tour_active';
const STORAGE_SKIPPED = 'covex_tour_skipped';
const STORAGE_DEMO_ID = 'covex_tour_demo_id';
const STORAGE_DEMO_REALITY = 'covex_tour_demo_reality';

// Step definitions. route is the path the step expects the user to be on; the
// "Next" button navigates to nextRoute (with tour=1 preserved) before
// advancing. anchor is the data-tour attribute value the coachmark points at.
//
// Routing note: the Explorer is mounted at the root path in App.jsx (the
// literal slash, NOT a /explorer prefix). All Explorer-targeted routes here
// use the root path so the tour never navigates the user to the NotFound
// catch-all. /sandbox is a top-level route; the website builder lives at
// /covenant/:id/studio (there is NO bare /studio route), so the studio-block
// step resolves its route and the prior step's nextRoute at runtime from the
// fetched demoId. /covenant/:id is the public covenant page.
export const STEPS = [
  {
    id: 'explorer-hero',
    anchor: 'explorer-hero',
    route: '/',
    title: 'Welcome to Covex',
    body: 'This is the public Explorer. Every covenant on Kaspa with a known template shows up here, indexed from real blocks. Nothing in this tour will sign or broadcast anything.',
    nextLabel: 'Show me how to build one',
    nextRoute: '/',
  },
  {
    id: 'build-cta',
    anchor: 'build-cta',
    route: '/',
    title: 'Start from the Sandbox',
    body: 'Click "Build a covenant" to open the Sandbox. The Sandbox is a 3-phase guided builder: create, logic, deploy. You can step through it without spending any KAS.',
    nextLabel: 'Open the Sandbox',
    nextRoute: '/sandbox',
  },
  {
    id: 'sandbox-create',
    anchor: 'sandbox-create',
    route: '/sandbox',
    title: 'Phase 1: Create',
    body: 'Pick a template. Each template tells you what is consensus-enforced (the script the Kaspa node verifies) and what is oracle co-signed (resolved by the disclosed Covex oracle, fail-closed).',
    nextLabel: 'Next: logic',
    nextRoute: '/sandbox',
  },
  {
    id: 'sandbox-logic',
    anchor: 'sandbox-logic',
    route: '/sandbox',
    title: 'Phase 2: Logic',
    body: 'Set the parameters: amounts, thresholds, deadlines, the oracle outcome to watch. The Sandbox shows the exact enforcement label for each field so nothing is hidden.',
    nextLabel: 'Next: deploy',
    nextRoute: '/sandbox',
  },
  {
    id: 'sandbox-deploy',
    anchor: 'sandbox-deploy',
    route: '/sandbox',
    title: 'Phase 3: Deploy',
    body: 'Review the script bytes, fees, and the honest enforcement summary. On mainnet, your private key never leaves the browser. The Sandbox can also produce a metadata-only preview without broadcasting.',
    nextLabel: 'See the website builder',
    nextRoute: null, // computed at runtime from demo id (/covenant/:id/studio)
  },
  {
    id: 'studio-block',
    anchor: 'studio-block',
    route: null, // computed at runtime from demo id (/covenant/:id/studio)
    title: 'Optional: a public page',
    body: 'Every covenant can host a public page built from blocks (hero, video, rich text, enforcement badge). The page is metadata only. It does not affect how the covenant settles.',
    nextLabel: 'See a real example',
    nextRoute: null, // computed at runtime from demo id
  },
  {
    id: 'public-page',
    anchor: 'public-page',
    route: null, // computed at runtime
    title: 'A real covenant page',
    body: 'This is a real on-chain covenant. The badge shows the disclosed enforcement reality. From here, anyone can participate by signing in their own wallet. The tour ends here.',
    nextLabel: 'Finish',
    nextRoute: '/',
  },
];

function isReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readActiveFlag() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_ACTIVE) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function appendTourParam(path) {
  if (!path) return path;
  const hasQuery = path.includes('?');
  if (path.includes('tour=1')) return path;
  return `${path}${hasQuery ? '&' : '?'}tour=1`;
}

export default function FirstCovenantTour() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const reducedMotion = useMemo(isReducedMotion, []);
  const [stepIdx, setStepIdx] = useState(0);
  const [active, setActive] = useState(false);
  const [demoId, setDemoId] = useState(null);
  const [demoReality, setDemoReality] = useState(null);
  const [demoChecked, setDemoChecked] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [visibleFade, setVisibleFade] = useState(false);
  const fetchedRef = useRef(false);

  // Activation: query param OR localStorage flag.
  useEffect(() => {
    const fromQuery = searchParams.get('tour') === '1';
    const fromStorage = readActiveFlag();
    if (fromQuery || fromStorage) {
      writeFlag(STORAGE_ACTIVE, '1');
      // Respect prior skip: if the user explicitly skipped, do not auto-resume
      // unless the URL query is explicitly set this session.
      try {
        const skipped = window.localStorage.getItem(STORAGE_SKIPPED) === '1';
        if (skipped && !fromQuery) return;
      } catch {
        /* ignore */
      }
      setActive(true);
      // Fade in after mount.
      requestAnimationFrame(() => setVisibleFade(true));
    }
  }, [searchParams]);

  // Fetch a demo covenant id once on mount (cached in localStorage).
  useEffect(() => {
    if (!active || fetchedRef.current) return;
    fetchedRef.current = true;
    let cached = null;
    let cachedReality = null;
    try {
      cached = window.localStorage.getItem(STORAGE_DEMO_ID);
      cachedReality = window.localStorage.getItem(STORAGE_DEMO_REALITY);
    } catch {
      /* ignore */
    }
    if (cached) {
      setDemoId(cached);
      if (cachedReality) setDemoReality(cachedReality);
      setDemoChecked(true);
      return;
    }
    const controller = new AbortController();
    fetch('/api/covenants?limit=1', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((data) => {
        // Tolerate either an array response or { items: [...] }.
        const list = Array.isArray(data) ? data : (data && data.items) || [];
        const first = list[0];
        const id =
          (first && (first.covenant_id || first.id || first.txid)) || null;
        const reality =
          (first && String(first.enforcement_reality || '').toLowerCase()) || null;
        if (id) {
          setDemoId(id);
          writeFlag(STORAGE_DEMO_ID, id);
        }
        if (reality) {
          setDemoReality(reality);
          writeFlag(STORAGE_DEMO_REALITY, reality);
        }
        setDemoChecked(true);
      })
      .catch(() => {
        setDemoChecked(true);
      });
    return () => controller.abort();
  }, [active]);

  // Compute the resolved step (substituting demoId-dependent routes and
  // wiring honesty copy through enforcementSummary so the language stays
  // consistent with the rest of the app).
  const step = useMemo(() => {
    const raw = STEPS[stepIdx];
    if (!raw) return null;
    const out = { ...raw };
    if (out.id === 'sandbox-deploy') {
      // The next step (studio-block) is the per-covenant website builder
      // mounted at /covenant/:id/studio. Without a demo id, demoMissing in
      // handleNext will skip studio-block (and public-page) entirely, so the
      // null fallback here is never navigated to.
      out.nextRoute = demoId ? `/covenant/${demoId}/studio` : null;
    }
    if (out.id === 'studio-block') {
      out.route = demoId ? `/covenant/${demoId}/studio` : null;
      out.nextRoute = demoId ? `/covenant/${demoId}` : '/';
    }
    if (out.id === 'public-page') {
      out.route = demoId ? `/covenant/${demoId}` : null;
    }

    // Sandbox steps describe a generic build flow before any reality is
    // chosen, so fall back to the on-chain baseline (the most honest default).
    // The public-page step uses the actual demo covenant's reality.
    const sandboxReality = 'on-chain';
    const publicReality = demoReality || 'on-chain';

    if (out.id === 'sandbox-create') {
      const s = enforcementSummary(sandboxReality);
      out.body = `Pick a template. Each template discloses its enforcement reality so nothing is hidden: ${s.badge.toLowerCase()} (${s.headline.toLowerCase()}) is the baseline, and oracle-attested or full-zk templates make the disclosed Covex oracle's role explicit.`;
    }
    if (out.id === 'sandbox-logic') {
      const s = enforcementSummary(sandboxReality);
      out.body = `Set the parameters: amounts, thresholds, deadlines, the oracle outcome to watch. The Sandbox shows the exact enforcement label for each field. ${s.headline}: ${s.body}`;
    }
    if (out.id === 'sandbox-deploy') {
      const s = enforcementSummary(sandboxReality);
      out.body = `Review the script bytes, fees, and the honest enforcement summary. On mainnet, your private key never leaves the browser. The Sandbox can also produce a metadata-only preview without broadcasting. ${s.headline}.`;
    }
    if (out.id === 'studio-block') {
      out.body = 'Every covenant can host a public page built from blocks (hero, video, rich text, enforcement badge). The page is metadata only. It does not change how the covenant settles, the redeem script and the disclosed enforcement reality are the source of truth.';
    }
    if (out.id === 'public-page') {
      const s = enforcementSummary(publicReality);
      const notTrustless =
        publicReality === 'full-zk' || publicReality === 'oracle-attested'
          ? ' This is not trustless: the disclosed Covex oracle contributes the consensus-required co-signature, and that is the honest disclosure shown on every covenant page.'
          : '';
      out.body = `This is a real on-chain covenant. The badge shows the disclosed enforcement reality. ${s.headline}: ${s.body}${notTrustless} From here, anyone can participate by signing in their own wallet. The tour ends here.`;
    }
    return out;
  }, [stepIdx, demoId, demoReality]);

  // Anchor measurement. Re-measures on resize / scroll / step change.
  useEffect(() => {
    if (!active || !step) return undefined;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (!el) {
        setAnchorRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Ignore zero-size elements (hidden / not yet rendered).
      if (r.width === 0 && r.height === 0) {
        setAnchorRect(null);
        return;
      }
      setAnchorRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    // Re-measure shortly after step changes to allow route mount.
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 400);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      cancelAnimationFrame(raf);
    };
  }, [active, step, location.pathname, demoId]);

  // If demo is unavailable and we land on a demo-dependent step, skip to end
  // with an honest message.
  const demoMissing = demoChecked && !demoId;
  const onDemoStep = step && (step.id === 'studio-block' || step.id === 'public-page');

  const handleSkip = () => {
    writeFlag(STORAGE_SKIPPED, '1');
    writeFlag(STORAGE_ACTIVE, null);
    setVisibleFade(false);
    window.setTimeout(() => setActive(false), reducedMotion ? 0 : 180);
  };

  const handleFinish = () => {
    writeFlag(STORAGE_ACTIVE, null);
    setVisibleFade(false);
    window.setTimeout(() => setActive(false), reducedMotion ? 0 : 180);
  };

  const handleNext = () => {
    if (!step) return;
    const isLast = stepIdx >= STEPS.length - 1;
    if (isLast) {
      handleFinish();
      return;
    }
    // Skip demo-dependent steps if we have no demo id.
    let nextIdx = stepIdx + 1;
    if (demoMissing) {
      while (
        nextIdx < STEPS.length &&
        (STEPS[nextIdx].id === 'studio-block' || STEPS[nextIdx].id === 'public-page')
      ) {
        nextIdx += 1;
      }
      if (nextIdx >= STEPS.length) {
        handleFinish();
        return;
      }
    }
    const target = STEPS[nextIdx];
    let targetPath = step.nextRoute;
    if (step.id === 'studio-block') {
      targetPath = demoId ? `/covenant/${demoId}` : '/';
    }
    setStepIdx(nextIdx);
    if (targetPath && targetPath !== location.pathname) {
      navigate(appendTourParam(targetPath));
    } else if (target && target.route && target.route !== location.pathname) {
      navigate(appendTourParam(target.route));
    }
  };

  if (!active || !step) return null;

  // Honest demo-missing banner replaces the demo-dependent step content.
  const demoFallback = onDemoStep && demoMissing;

  // Position computation. If we have an anchor rect, position next to it; on
  // mobile (< 640px) we always use a full-width bottom banner. The arrow only
  // renders when we have a measured anchor and are not in mobile fallback.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const useBanner = isMobile || !anchorRect;

  // Compute coachmark position (desktop, anchored).
  let coachStyle = {};
  let arrowStyle = null;
  if (!useBanner && anchorRect) {
    const cardW = 360;
    const cardH = 200; // approximate; height auto, used only for clamping
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Default: place below the anchor, horizontally centered.
    let top = anchorRect.top + anchorRect.height + margin;
    let left = anchorRect.left + anchorRect.width / 2 - cardW / 2;
    let arrowOn = 'top';
    // If the anchor is in the bottom half, place above.
    if (anchorRect.top > vh * 0.55) {
      top = anchorRect.top - margin - cardH;
      arrowOn = 'bottom';
    }
    // Clamp horizontally.
    if (left < 12) left = 12;
    if (left + cardW > vw - 12) left = vw - cardW - 12;
    // Clamp vertically.
    if (top < 12) top = 12;
    if (top + cardH > vh - 12) top = vh - cardH - 12;
    coachStyle = { top: `${top}px`, left: `${left}px`, width: `${cardW}px` };
    // Arrow points at the anchor center along the X axis, clamped to card.
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const arrowX = Math.max(left + 18, Math.min(left + cardW - 18, anchorCenterX)) - left;
    arrowStyle =
      arrowOn === 'top'
        ? { top: '-7px', left: `${arrowX - 7}px` }
        : { bottom: '-7px', left: `${arrowX - 7}px` };
  }

  // Spotlight ring around the anchor (desktop only, non-mobile).
  const spotlight =
    !useBanner && anchorRect ? (
      <div
        aria-hidden="true"
        className="fixed pointer-events-none rounded-xl ring-2 ring-emerald-400/70 light:ring-emerald-600/80 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]"
        style={{
          top: `${anchorRect.top - 6}px`,
          left: `${anchorRect.left - 6}px`,
          width: `${anchorRect.width + 12}px`,
          height: `${anchorRect.height + 12}px`,
          zIndex: 60,
          transition: reducedMotion ? 'opacity 120ms linear' : 'opacity 180ms ease, top 180ms ease, left 180ms ease',
          opacity: visibleFade ? 1 : 0,
        }}
      />
    ) : null;

  const stepNumber = stepIdx + 1;
  const totalSteps = STEPS.length;

  const titleText = demoFallback ? 'No demo available right now' : step.title;
  const bodyText = demoFallback
    ? 'We could not find a public covenant to show as a live example. That is the honest state of the index at this moment. You can still build your own from the Sandbox, or come back later.'
    : step.body;
  const nextText = demoFallback ? 'Finish' : step.nextLabel;
  const handleNextResolved = demoFallback ? handleFinish : handleNext;

  const fadeClass = visibleFade ? 'opacity-100' : 'opacity-0';
  const transitionStyle = reducedMotion
    ? { transition: 'opacity 120ms linear' }
    : { transition: 'opacity 180ms ease' };

  const card = (
    <div
      role="dialog"
      aria-label={`Covex tour, step ${stepNumber} of ${totalSteps}`}
      className={[
        'fixed z-[61] rounded-2xl border shadow-2xl backdrop-blur-md',
        'bg-slate-950/95 border-emerald-500/30 text-slate-100',
        'light:bg-white light:border-emerald-600/40 light:text-slate-900',
        fadeClass,
      ].join(' ')}
      style={useBanner ? {
        left: '8px',
        right: '8px',
        bottom: '8px',
        ...transitionStyle,
      } : { ...coachStyle, ...transitionStyle }}
    >
      {arrowStyle && !useBanner && (
        <div
          aria-hidden="true"
          className="absolute w-3.5 h-3.5 rotate-45 bg-slate-950/95 border border-emerald-500/30 light:bg-white light:border-emerald-600/40"
          style={arrowStyle}
        />
      )}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 light:bg-emerald-600/15 text-emerald-300 light:text-emerald-700">
              <Compass className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] uppercase tracking-wider text-emerald-300 light:text-emerald-700 font-semibold">
              Tour, step {stepNumber} of {totalSteps}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Skip the tour"
            className="text-slate-400 hover:text-slate-100 light:text-slate-500 light:hover:text-slate-900 transition-colors -mr-1 -mt-1 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="mt-2 text-base sm:text-lg font-semibold text-white light:text-slate-900">
          {titleText}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300 light:text-slate-700">
          {bodyText}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 light:text-slate-500 light:hover:text-slate-900 transition-colors"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleNextResolved}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors light:bg-emerald-600 light:hover:bg-emerald-500 light:text-white"
          >
            {nextText}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {spotlight}
      {card}
    </>
  );
}
