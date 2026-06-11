import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { WalletProvider, useWallet } from './components/WalletContext';
import WalletButton from './components/WalletButton';
import WebGLBackground from './components/WebGLBackground';
import Explorer from './pages/Explorer';
import CovenantInteractive from './pages/CovenantInteractive';
import CovenantFix from './pages/CovenantFix';
import WhatIsKaspaPage from './pages/WhatIsKaspa';
import Pricing from './pages/Pricing';
import TemplateLibrary from './pages/TemplateLibrary';
import AdvancedComposer from './pages/AdvancedComposer';
import Analytics from './pages/Analytics';

import Dashboard from './pages/Dashboard';
import Terms from './pages/Terms';
import Deploy from './pages/Deploy';
import PaidDeploy from './pages/PaidDeploy';
import PaidBuilder from './pages/PaidBuilder';
import PremiumBuilder from './pages/PremiumBuilder';
import DemoCovenant from './pages/DemoCovenant';
import { ThemeProvider } from './components/ThemeProvider';
import CovexLogo from './components/CovexLogo';

// Nav link active state
const NL = ({ isActive }) =>
  `text-[0.9rem] font-medium tracking-[0.01em] rounded-full px-5 py-2 transition-all duration-200 whitespace-nowrap ${
    isActive
      ? 'bg-white/[0.08] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
      : 'text-white/60 hover:text-white/95 hover:bg-white/[0.06]'
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
    window.dispatchEvent(new CustomEvent('kaspa-network-change', { detail: network }));
  }, [network]);

  const networks = [
    { value: 'testnet-12', label: 'TN12', color: '#49EACB', title: 'Toccata Testnet 12' },
    { value: 'testnet-10', label: 'TN10', color: '#F59E0B', title: 'Testnet 10' },
    { value: 'mainnet', label: 'MAIN', color: '#EF4444', title: 'Kaspa MAINNET - REAL FUNDS' },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[oklch(0.65_0.18_145_/_20%)] bg-[oklch(0.65_0.18_145_/_10%)] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      title={networks.find(n => n.value === network)?.title}
    >
      {networks.map(n => (
        <button
          key={n.value}
          onClick={() => setNetwork(n.value)}
          className={`px-2 py-0.5 text-[0.72rem] font-semibold tracking-[0.06em] rounded-full transition-all ${
            network === n.value
              ? 'text-black'
              : 'text-[oklch(0.75_0.18_145)] hover:text-white'
          }`}
          style={network === n.value ? { backgroundColor: n.color } : {}}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <BrowserRouter>
          <WebGLBackground />
          {/* Shader vignette — darkens edges for readability */}
          <div className="shader-vignette" />

          {/* Nav — full-width liquid glass bar, three-zone layout */}
          <nav
            className="fixed top-4 left-4 right-4 z-50 nav-glass"
            style={{
              maxWidth: '1438px',
              margin: '0 auto',
              borderRadius: '20px',
            }}
          >
            <div className="flex items-center justify-between w-full px-8 h-14">
              {/* ZONE 1 — Logo (far left) */}
              <Link to="/" className="group flex items-center gap-3 shrink-0">
                <CovexLogo size={32} className="transition-transform duration-300 group-hover:scale-105" />
                <span className="text-[14px] font-light italic tracking-[0.08em] text-[#f0fefd] select-none leading-none">
                  COVEX
                </span>
              </Link>

              {/* ZONE 2 — Center nav links (absolutely centered) */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
                <NavLink to="/" end className={NL}>Explore</NavLink>
                <SmartTerminalLink />
                <NavLink to="/fix" className={NL}>Fix</NavLink>
                <NavLink to="/kaspa" className={NL}>Kaspa</NavLink>
                <NavLink to="/pricing" className={NL}>Pricing</NavLink>
                <SmartDeployLink />
              </div>

              {/* ZONE 3 — Wallet + Network (far right) */}
              <div className="flex items-center gap-2 shrink-0">
                <NetworkSwitcher />
                <WalletButton />
              </div>
            </div>
          </nav>

          <div className="relative z-10 pt-20">
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
            </Routes>
          </div>

          <footer className="relative z-10 border-t border-white/[0.03] py-6 px-4 text-xs text-gray-400">
            <div className="max-w-6xl mx-auto text-center">
              Non-custodial. Keys stay in your wallet.
            </div>
          </footer>
        </BrowserRouter>
      </WalletProvider>
    </ThemeProvider>
  );
}
