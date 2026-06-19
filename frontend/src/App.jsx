import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useLocation, useParams } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Route-level boundary: catches a single page's render/chunk-load error (e.g. a stale
// dynamic import right after a redeploy) so it shows a graceful recovery instead of the
// root boundary nuking the whole shell; resets when the route changes.
function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}

// The covenant Fix page is consolidated into Page Studio (one create -> design ->
// preview -> deploy flow). /covenant/:id/fix redirects to that covenant's Studio,
// preserving the id. Bare /fix has no covenant context, so it falls back to the
// Sandbox builder where a creator starts a new covenant.
function FixToStudioRedirect() {
  const { id } = useParams();
  return id
    ? <Navigate to={`/covenant/${encodeURIComponent(id)}/studio`} replace />
    : <Navigate to="/sandbox" replace />;
}
import { WalletProvider, useWallet } from './components/WalletContext';
import WalletButton from './components/WalletButton';
import DagBackground from './components/DagBackground';
import CovexLogo from './components/CovexLogo';
import LegalModal from './components/LegalModal';
import Explorer from './pages/Explorer';

// Route-level code splitting: the Explorer (homepage) stays eager, everything
// else (games, builders, wasm, snarkjs, three.js) loads on demand. This is the
// difference between a 16MB and a sub-1MB initial bundle.
const CovenantInteractive = lazy(() => import('./pages/CovenantInteractive'));
const WhatIsKaspaPage = lazy(() => import('./pages/WhatIsKaspa'));
const Pricing = lazy(() => import('./pages/Pricing'));
const TemplateLibrary = lazy(() => import('./pages/TemplateLibrary'));
const AdvancedComposer = lazy(() => import('./pages/AdvancedComposer'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const EnforcedDeploy = lazy(() => import('./pages/EnforcedDeploy'));
const PremiumBuilder = lazy(() => import('./pages/PremiumBuilder'));
const AddressPortfolio = lazy(() => import('./pages/AddressPortfolio'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const Whitepaper = lazy(() => import('./pages/Whitepaper'));
const Treasury = lazy(() => import('./pages/Treasury'));
const Stats = lazy(() => import('./pages/Stats'));
const CovenantStudio = lazy(() => import('./pages/CovenantStudio'));
const CovenantEmbed = lazy(() => import('./pages/CovenantEmbed'));
const Sandbox = lazy(() => import('./pages/Sandbox'));
const Readme = lazy(() => import('./pages/Readme'));
const About = lazy(() => import('./pages/About'));
const Recover = lazy(() => import('./pages/Recover'));
const NotFound = lazy(() => import('./pages/NotFound'));
import { ThemeProvider } from './components/ThemeProvider';
import { ToastProvider } from './components/ToastContext';
import ThemeToggle from './components/ThemeToggle';
import { Menu, X, ChevronDown, Download } from 'lucide-react';

// Grouped "Learn" menu so the nav stays clean: informational pages live here instead of
// crowding the top bar. Opens on hover (desktop).
function LearnMenu() {
  const [open, setOpen] = useState(false);
  const items = [
    ['About Covex', '/about'],
    ['How it Works', '/readme'],
    ['What is Kaspa', '/kaspa'],
    ['API Docs', '/docs'],
    ['Whitepaper', '/whitepaper'],
  ];
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="text-sm font-medium text-gray-200 hover:text-white inline-flex items-center gap-1 transition-colors">
        Learn <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50">
          <div className="min-w-[176px] rounded-xl border border-white/10 bg-[#0c0c12]/95 backdrop-blur-xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] py-1.5 light:bg-white/98 light:border-slate-200">
            {items.map(([label, to]) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-gray-200 hover:text-kaspa-green hover:bg-white/5 light:text-slate-700 light:hover:bg-slate-100 transition-colors">
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Active-link wayfinding: a kaspa-green underline that is full-width on the active route
// and grows in on hover for the others. Reduced-motion users just get the static underline.
const NL = ({ isActive }) =>
  `relative text-sm font-medium transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-[2px] after:rounded-full after:bg-kaspa-green after:transition-all after:duration-300 motion-reduce:after:transition-none ${
    isActive
      ? 'text-kaspa-green after:w-full'
      : 'text-gray-200 hover:text-white dark:text-gray-200 dark:hover:text-white after:w-0 hover:after:w-full'
  }`;

function SmartDeployLink() {
  const { address } = useWallet();
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!address) return;
    const net = localStorage.getItem('kaspaNetwork') || 'mainnet';
    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net })
    })
      .then(r => r.ok ? r.json() : { tier: 'FREE' })
      .then(data => setIsPaid(data.tier && data.tier !== 'FREE'))
      .catch(() => setIsPaid(false));
  }, [address]);

  // One trustless deploy path for everyone: the enforced (script-locked P2SH) flow.
  // The old decorative /deploy is redirected there. (isPaid kept only to gate the
  // separate paid "Terminal" builder link, not the deploy destination.)
  void isPaid;
  return <NavLink to="/deploy/enforced" className={NL}>Deploy</NavLink>;
}

function SmartTerminalLink() {
  const { address } = useWallet();
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!address) { setIsPaid(false); return; }
    const net = localStorage.getItem('kaspaNetwork') || 'mainnet';
    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net })
    })
      .then(r => r.ok ? r.json() : { tier: 'FREE' })
      .then(data => setIsPaid(data.tier && data.tier !== 'FREE'))
      .catch(() => setIsPaid(false));
  }, [address]);

  if (!isPaid) return null;
  return <NavLink to="/premium" className={NL}>Terminal</NavLink>;
}

// Covex is mainnet-only. Pin the stored network to mainnet once on mount so any code that
// still reads localStorage('kaspaNetwork') resolves to mainnet, and notify listeners.
function ensureMainnetNetwork() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('kaspaNetwork') !== 'mainnet') {
    localStorage.setItem('kaspaNetwork', 'mainnet');
    window.dispatchEvent(new CustomEvent('kaspa-network-change', { detail: 'mainnet' }));
  }
}

function LiveStatus() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      const tryFetch = (url) => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
      const selectedNet = localStorage.getItem('kaspaNetwork') || 'mainnet';
      Promise.all([
        tryFetch('/api/status'),
        tryFetch(`/api/covenants?network=${selectedNet}&limit=1`),
      ])
        .then(([d, list]) => {
          if (!mounted || !d) return;
          const git = (d.git_commit || 'dev').slice(0, 7);
          const total = (list && typeof list.total === 'number') ? list.total : (d.total_covenants || 0);
          const totalStr = total > 1000 ? `${(total / 1000).toFixed(1)}k` : total.toString();
          // Honest mainnet signal: "live" only when wRPC is connected AND the covenant
          // gate (Toccata) is active (that is what mainnet_ready encodes server-side);
          // otherwise show "mainnet node connected" when the node URL is set but the
          // covenant gate is not yet open.
          const ready = d.mainnet_ready
            ? ' • mainnet live'
            : (d.mainnet_wrpc_configured ? ' • mainnet node connected' : '');
          setInfo(`${git} • ${totalStr} covenants${ready}`);
        })
        .catch(() => { /* silent, keep footer clean */ });
    };
    load();
    const id = setInterval(load, 90000); // light poll
    const onNet = () => load();
    window.addEventListener('kaspa-network-change', onNet);
    return () => { mounted = false; clearInterval(id); window.removeEventListener('kaspa-network-change', onNet); };
  }, []);

  if (!info) return null;

  return (
    <div className="text-[10px] opacity-60 tracking-wider flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-2">
      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-kaspa-green opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kaspa-green" />
      </span>
      <span className="break-words">Covex {info}</span>
    </div>
  );
}

// One-time consent gate. The dead-code LegalModal is mounted here so first-time
// visitors must read and accept the Terms (and the no-liability disclaimer) before
// using the platform. Acceptance is persisted in localStorage and never re-shown.
// Skipped on /embed routes so the chrome-free covenant widget embedded on external
// sites is never blocked by a full-screen overlay.
const TERMS_ACCEPTED_KEY = 'covex_terms_accepted';

function TermsGate() {
  const location = useLocation();
  const isEmbed = location.pathname.startsWith('/embed/');
  const [accepted, setAccepted] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(TERMS_ACCEPTED_KEY) === '1';
  });

  if (accepted || isEmbed) return null;

  return (
    <LegalModal
      onAccept={() => {
        try { localStorage.setItem(TERMS_ACCEPTED_KEY, '1'); } catch { /* private mode */ }
        setAccepted(true);
      }}
    />
  );
}

// `beforeinstallprompt` fires once, at page load, BEFORE the user opens the
// mobile drawer. The install button lives inside that conditionally-mounted
// drawer, so it would miss the event if it listened itself. We capture the
// event at module scope the instant the script runs, and notify any mounted
// hook subscribers, so the button can render the moment it mounts even though
// the event already fired. Reduced-motion / honesty safe; pure UX.
let _deferredInstallPrompt = null;
let _appInstalled = false;
const _installSubs = new Set();
function _notifyInstall() { _installSubs.forEach((fn) => fn()); }
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    _notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
    _appInstalled = true;
    _notifyInstall();
  });
}

// "Install app" affordance. Surfaced only when the browser has offered an
// install prompt (manifest + service worker + not already installed) and not
// after a successful install. Hoisted to module scope so it never remounts.
function InstallAppButton({ variant = 'menu', onInstalled }) {
  const [, force] = useState(0);

  useEffect(() => {
    const sub = () => force((n) => n + 1);
    _installSubs.add(sub);
    return () => { _installSubs.delete(sub); };
  }, []);

  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

  if (standalone || _appInstalled || !_deferredInstallPrompt) return null;

  const install = async () => {
    const evt = _deferredInstallPrompt;
    if (!evt) return;
    try {
      evt.prompt();
      const choice = await evt.userChoice;
      if (choice && choice.outcome === 'accepted') { _appInstalled = true; onInstalled?.(); }
    } catch { /* user dismissed */ }
    _deferredInstallPrompt = null; // a prompt can only be used once
    _notifyInstall();
  };

  if (variant === 'menu') {
    return (
      <button
        onClick={install}
        className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#49EACB] text-black text-sm font-bold active:scale-[0.985] transition-transform"
      >
        <Download size={16} /> Install app
      </button>
    );
  }
  // compact chip for the mobile control row
  return (
    <button
      onClick={install}
      aria-label="Install app"
      className="p-2 rounded-lg border border-kaspa-green/40 text-kaspa-green hover:bg-kaspa-green/10 active:scale-95 transition"
    >
      <Download size={18} />
    </button>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Covex is mainnet-only: pin the stored network to mainnet on first paint.
  useEffect(() => { ensureMainnetNetwork(); }, []);

  // Close mobile menu on route change or escape
  useEffect(() => {
    const close = () => setMobileMenuOpen(false);
    window.addEventListener('popstate', close);
    const onKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', close);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
      <WalletProvider>
        <BrowserRouter>
          <DagBackground />
          <TermsGate />
          <nav className="fixed top-0 w-full z-40 glass-panel border-b border-white/5 dark:bg-[#0A0A0D]/95 light:bg-white/95 light:border-slate-200">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
              <Link to="/" className="group flex items-center transition-all duration-300 hover:drop-shadow-[0_0_18px_rgba(73,234,203,0.45)]">
                <CovexLogo size={30} />
              </Link>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center gap-6">
                <NavLink to="/" end className={NL}>Explore</NavLink>
                <NavLink to="/sandbox" className={NL}>Build</NavLink>
                <NavLink to="/pricing" className={NL}>Pricing</NavLink>
                <LearnMenu />
                <WalletButton />
                <ThemeToggle />
              </div>

              {/* Mobile controls: Wallet + Theme + Hamburger */}
              <div className="md:hidden flex items-center gap-2">
                <WalletButton />
                <ThemeToggle />
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white light:text-slate-700 light:hover:text-slate-900 light:border-slate-300"
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>

            {/* Mobile Menu Drawer */}
            {mobileMenuOpen && (
              <div className="md:hidden border-t border-white/10 bg-[#0A0A0D]/95 light:bg-white/98 light:border-slate-200 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-3 text-sm">
                  <NavLink to="/" end className={NL} onClick={() => setMobileMenuOpen(false)}>Explore</NavLink>
                  <NavLink to="/sandbox" className={NL} onClick={() => setMobileMenuOpen(false)}>Build</NavLink>
                  <NavLink to="/pricing" className={NL} onClick={() => setMobileMenuOpen(false)}>Pricing</NavLink>
                  <div className="mt-1 pt-3 border-t border-white/10 light:border-slate-200 text-[10px] uppercase tracking-widest text-gray-500">Learn</div>
                  <NavLink to="/readme" className={NL} onClick={() => setMobileMenuOpen(false)}>How it Works</NavLink>
                  <NavLink to="/kaspa" className={NL} onClick={() => setMobileMenuOpen(false)}>What is Kaspa</NavLink>
                  <NavLink to="/docs" className={NL} onClick={() => setMobileMenuOpen(false)}>API Docs</NavLink>
                  <NavLink to="/whitepaper" className={NL} onClick={() => setMobileMenuOpen(false)}>Whitepaper</NavLink>
                  {/* Add Covex to your home screen (only shown when installable) */}
                  <InstallAppButton variant="menu" onInstalled={() => setMobileMenuOpen(false)} />
                </div>
              </div>
            )}
          </nav>

          <div className="relative z-10 pt-16">
            <RouteErrorBoundary>
            <Suspense fallback={
              <div className="max-w-3xl mx-auto px-4 py-16 space-y-4" aria-hidden="true">
                <div className="skeleton h-9 w-2/5 rounded-lg" />
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-64 w-full rounded-2xl" />
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-4 w-2/3 rounded" />
              </div>
            }>
            <Routes>
              <Route path="/" element={<Explorer />} />
              {/* Fix is consolidated into Page Studio; preserve the id where present. */}
              <Route path="/fix" element={<FixToStudioRedirect />} />
              {/* /covenant was leftover demo scaffolding ("Demo not found" with no param);
                  send it to the real deploy flow. */}
              <Route path="/covenant" element={<Navigate to="/deploy/enforced" replace />} />
              <Route path="/covenant/:id" element={<CovenantInteractive />} />
              <Route path="/covenant/:id/fix" element={<FixToStudioRedirect />} />
              <Route path="/kaspa" element={<WhatIsKaspaPage />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              {/* The old decorative /deploy is gone: every deploy is now the trustless,
                  script-enforced (P2SH) flow. /deploy redirects to it. */}
              <Route path="/deploy" element={<Navigate to="/deploy/enforced" replace />} />
              <Route path="/deploy/enforced" element={<EnforcedDeploy />} />
              {/* /deploy/paid was an orphan duplicate builder; the live paid path is
                  Pricing -> /premium. Redirect to the canonical enforced deploy. */}
              <Route path="/deploy/paid" element={<Navigate to="/deploy/enforced" replace />} />
              {/* /paid-builder was an orphan duplicate; the live paid path is /premium. */}
              <Route path="/paid-builder" element={<Navigate to="/premium" replace />} />
              <Route path="/premium" element={<PremiumBuilder />} />
              <Route path="/templates" element={<TemplateLibrary />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/readme" element={<Readme />} />
              <Route path="/about" element={<About />} />
              <Route path="/recover" element={<Recover />} />
              <Route path="/advanced" element={<AdvancedComposer />} />
              <Route path="/address/:addr" element={<AddressPortfolio />} />
              <Route path="/docs" element={<ApiDocs />} />
              <Route path="/whitepaper" element={<Whitepaper />} />
              <Route path="/treasury" element={<Treasury />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/covenant/:id/studio" element={<CovenantStudio />} />
              {/* Embeddable read-only covenant widget for external sites (chrome-free fixed overlay).
                  Framing is allowed for /embed paths via nginx (CSP frame-ancestors *). */}
              <Route path="/embed/covenant/:id" element={<CovenantEmbed />} />
              {/* Catch-all: any unknown path (incl. removed stubs) -> branded 404, never a blank page. */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </RouteErrorBoundary>
          </div>

          <footer className="relative z-10 border-t border-white/[0.03] py-6 px-4 text-xs text-gray-400 light:border-slate-200 light:text-slate-500">
            <div className="max-w-6xl mx-auto text-center space-y-2.5">
              <p>Non-custodial custody. Your wallet signs every payment, and Covex holds no user keys. Some covenants (games, prediction markets, full-zk circuits) are oracle-cosigned; see the enforcement badge on each page.</p>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                {[
                  ['How it Works', '/readme'],
                  ['API', '/docs'],
                  ['Whitepaper', '/whitepaper'],
                  ['Treasury', '/treasury'],
                  // Discoverable entry for "I have a redeem script, spend any covenant":
                  // the external-spend panel lives on the enforced deploy page.
                  ['Spend a Covenant', '/deploy/enforced'],
                  ['Recover', '/recover'],
                  ['Stats', '/stats'],
                  ['Templates', '/templates'],
                  ['Terms', '/terms'],
                  ['Privacy', '/privacy'],
                ].map(([label, to], i, arr) => (
                  <span key={to} className="inline-flex items-center gap-x-3">
                    <Link to={to} className="hover:text-kaspa-green transition-colors">{label}</Link>
                    {i < arr.length - 1 && <span aria-hidden="true" className="opacity-30">|</span>}
                  </span>
                ))}
              </div>
              <LiveStatus />
            </div>
          </footer>
        </BrowserRouter>
      </WalletProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}