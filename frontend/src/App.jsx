import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { WalletProvider, useWallet } from './components/WalletContext';
import WalletButton from './components/WalletButton';
import DagBackground from './components/DagBackground';
import Explorer from './pages/Explorer';

// Route-level code splitting: the Explorer (homepage) stays eager, everything
// else (games, builders, wasm, snarkjs, three.js) loads on demand. This is the
// difference between a 16MB and a sub-1MB initial bundle.
const CovenantInteractive = lazy(() => import('./pages/CovenantInteractive'));
const CovenantFix = lazy(() => import('./pages/CovenantFix'));
const WhatIsKaspaPage = lazy(() => import('./pages/WhatIsKaspa'));
const Pricing = lazy(() => import('./pages/Pricing'));
const TemplateLibrary = lazy(() => import('./pages/TemplateLibrary'));
const AdvancedComposer = lazy(() => import('./pages/AdvancedComposer'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Terms = lazy(() => import('./pages/Terms'));
const Deploy = lazy(() => import('./pages/Deploy'));
const PaidDeploy = lazy(() => import('./pages/PaidDeploy'));
const PaidBuilder = lazy(() => import('./pages/PaidBuilder'));
const PremiumBuilder = lazy(() => import('./pages/PremiumBuilder'));
const DemoCovenant = lazy(() => import('./pages/DemoCovenant'));
const AddressPortfolio = lazy(() => import('./pages/AddressPortfolio'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
import { ThemeProvider } from './components/ThemeProvider';
import ThemeToggle from './components/ThemeToggle';
import { Menu, X } from 'lucide-react';

const NL = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive
      ? 'text-kaspa-green'
      : 'text-gray-200 hover:text-white dark:text-gray-200 dark:hover:text-white'
  }`;

function SmartDeployLink() {
  const { address } = useWallet();
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!address) return;
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net })
    })
      .then(r => r.ok ? r.json() : { tier: 'FREE' })
      .then(data => setIsPaid(data.tier && data.tier !== 'FREE'))
      .catch(() => setIsPaid(false));
  }, [address]);

  const to = isPaid ? '/premium' : '/deploy';
  return <NavLink to={to} className={NL}>Deploy</NavLink>;
}

function SmartTerminalLink() {
  const { address } = useWallet();
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!address) { setIsPaid(false); return; }
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
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

function NetworkSwitcher() {
  const [network, setNetwork] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('kaspaNetwork') || 'testnet-12';
    return 'testnet-12';
  });

  useEffect(() => {
    localStorage.setItem('kaspaNetwork', network);
    // Dispatch event so CovexTerminal and other components sync
    window.dispatchEvent(new CustomEvent('kaspa-network-change', { detail: network }));
  }, [network]);

  const networks = [
    { value: 'testnet-12', label: 'TN12', color: '#49EACB', title: 'Toccata Testnet 12' },
    { value: 'testnet-10', label: 'TN10', color: '#F59E0B', title: 'Testnet 10' },
    { value: 'mainnet', label: 'MAIN', color: '#EF4444', title: 'Kaspa MAINNET - REAL FUNDS' },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5 light:bg-white light:border-slate-200" title={networks.find(n => n.value === network)?.title}>
      {networks.map(n => (
        <button
          key={n.value}
          onClick={() => setNetwork(n.value)}
          className={`px-2 py-1 text-[11px] font-semibold rounded-sm transition-all ${
            network === n.value
              ? 'text-black'
              : 'text-gray-400 hover:text-white'
          }`}
          style={network === n.value ? { backgroundColor: n.color } : {}}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}

function LiveStatus() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      const tryFetch = (url) => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
      const selectedNet = localStorage.getItem('kaspaNetwork') || 'testnet-12';
      Promise.all([
        tryFetch('/status').then(d => d || tryFetch('/api/status')),
        tryFetch(`/api/covenants?network=${selectedNet}&limit=1`),
      ])
        .then(([d, list]) => {
          if (!mounted || !d) return;
          const git = (d.git_commit || 'dev').slice(0, 7);
          const total = (list && typeof list.total === 'number') ? list.total : (d.total_covenants || 0);
          const totalStr = total > 1000 ? `${(total / 1000).toFixed(1)}k` : total.toString();
          const ready = d.mainnet_ready ? ' • mainnet-ready' : '';
          setInfo(`${git} • ${selectedNet} • ${totalStr} covenants${ready}`);
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
    <div className="text-[10px] opacity-50 tracking-widest">
      Covex {info}
    </div>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <WalletProvider>
        <BrowserRouter>
          <DagBackground />
          <nav className="fixed top-0 w-full z-40 glass-panel border-b border-white/5 dark:bg-[#0A0A0D]/95 light:bg-white/95 light:border-slate-200">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
              <Link to="/" className="group flex items-center gap-2.5">
                {/* New user-provided glowing network C logo */}
                <img 
                  src="/covex-logo-48.png" 
                  alt="Covex" 
                  width="28" 
                  height="28" 
                  className="shrink-0 drop-shadow-[0_0_8px_rgba(0,255,157,0.45)] group-hover:drop-shadow-[0_0_16px_rgba(0,229,255,0.6)] transition-all duration-300 rounded"
                />
                {/* COVEX wordmark */}
                <span className="covex-brand font-extrabold text-[23px] tracking-[4px] leading-none select-none">
                  <span className="text-white dark:text-white group-hover:text-[#49EACB] light:text-slate-900 light:group-hover:text-[#0f766e] transition-colors duration-300">COV</span>
                  <span className="text-[#49EACB] group-hover:text-white dark:group-hover:text-white light:text-[#0f766e] light:group-hover:text-slate-900 transition-colors duration-300">EX</span>
                </span>
              </Link>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center gap-6">
                <NavLink to="/" end className={NL}>Explore</NavLink>
                <SmartTerminalLink />
                <NavLink to="/fix" className={NL}>Fix</NavLink> 
                {/* Full visual editor, covenant composer, and best-covenant tools are in paid Terminal only. */}
                <NavLink to="/kaspa" className={NL}>Kaspa</NavLink>
                <NavLink to="/pricing" className={NL}>Pricing</NavLink>
                <SmartDeployLink />
                <NetworkSwitcher />
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
                  <SmartTerminalLink />
                  <NavLink to="/fix" className={NL} onClick={() => setMobileMenuOpen(false)}>Fix</NavLink>
                  <NavLink to="/kaspa" className={NL} onClick={() => setMobileMenuOpen(false)}>Kaspa</NavLink>
                  <NavLink to="/pricing" className={NL} onClick={() => setMobileMenuOpen(false)}>Pricing</NavLink>
                  <SmartDeployLink />
                  <div className="pt-2 border-t border-white/10 light:border-slate-200">
                    <NetworkSwitcher />
                  </div>
                </div>
              </div>
            )}
          </nav>

          <div className="relative z-10 pt-16">
            <Suspense fallback={
              <div className="flex items-center justify-center py-32">
                <div className="w-8 h-8 rounded-full border-2 border-kaspa-green/30 border-t-kaspa-green animate-spin" />
              </div>
            }>
            <Routes>
              <Route path="/" element={<Explorer />} />
              <Route path="/fix" element={<CovenantFix />} />
              <Route path="/covenant" element={<DemoCovenant />} />
              <Route path="/covenant/:id" element={<CovenantInteractive />} />
              <Route path="/covenant/:id/fix" element={<CovenantFix />} />
              <Route path="/kaspa" element={<WhatIsKaspaPage />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/deploy" element={<Deploy />} />
              <Route path="/deploy/paid" element={<PaidDeploy />} />
              <Route path="/paid-builder" element={<PaidBuilder />} />
              <Route path="/premium" element={<PremiumBuilder />} />
              <Route path="/templates" element={<TemplateLibrary />} />
              <Route path="/advanced" element={<AdvancedComposer />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/address/:addr" element={<AddressPortfolio />} />
              <Route path="/docs" element={<ApiDocs />} />
            </Routes>
            </Suspense>
          </div>

          <footer className="relative z-10 border-t border-white/[0.03] py-6 px-4 text-xs text-gray-400 light:border-slate-200 light:text-slate-500">
            <div className="max-w-6xl mx-auto text-center space-y-1">
              <div>
                Non-custodial. Keys stay in your wallet.
                <span className="mx-2 opacity-30">|</span>
                <Link to="/docs" className="hover:text-kaspa-green transition-colors">API</Link>
                <span className="mx-2 opacity-30">|</span>
                <Link to="/templates" className="hover:text-kaspa-green transition-colors">Templates</Link>
                <span className="mx-2 opacity-30">|</span>
                <Link to="/terms" className="hover:text-kaspa-green transition-colors">Terms</Link>
              </div>
              <LiveStatus />
            </div>
          </footer>
        </BrowserRouter>
      </WalletProvider>
    </ThemeProvider>
  );
}