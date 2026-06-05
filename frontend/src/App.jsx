import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { WalletProvider } from './components/WalletContext';
import WalletButton from './components/WalletButton';
import DagBackground from './components/DagBackground';
import Explorer from './pages/Explorer';
import CovenantInteractive from './pages/CovenantInteractive';
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
import ThemeToggle from './components/ThemeToggle';

const NL = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive
      ? 'text-kaspa-green'
      : 'text-gray-200 hover:text-white dark:text-gray-200 dark:hover:text-white'
  }`;

function SmartDeployLink() {
  const [isPaid, setIsPaid] = useState(false);
  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    setIsPaid(tier && tier !== 'FREE');
    const onStorage = () => {
      const t = localStorage.getItem('covex_paid_tier');
      setIsPaid(t && t !== 'FREE');
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('covex-tier-change', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('covex-tier-change', onStorage);
    };
  }, []);

  const to = isPaid ? '/paid-builder' : '/deploy';
  return <NavLink to={to} className={NL}>Deploy</NavLink>;
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
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5" title={networks.find(n => n.value === network)?.title}>
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

export default function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <BrowserRouter>
          <DagBackground />
          <nav className="fixed top-0 w-full z-40 glass-panel border-b border-white/5 dark:bg-[#0A0A0D]/85">
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
                  <span className="text-white dark:text-white group-hover:text-[#49EACB] transition-colors duration-300">COV</span>
                  <span className="text-[#49EACB] group-hover:text-white dark:group-hover:text-white transition-colors duration-300">EX</span>
                </span>
              </Link>
              <div className="flex items-center gap-6">
                <NavLink to="/" end className={NL}>Explore</NavLink>
                <NavLink to="/kaspa" className={NL}>Kaspa</NavLink>
                <NavLink to="/pricing" className={NL}>Pricing</NavLink>
                <SmartDeployLink />
                <NetworkSwitcher />
                <WalletButton />
                <ThemeToggle />
              </div>
            </div>
          </nav>

          <div className="relative z-10 min-h-screen pt-16">
            <Routes>
              <Route path="/" element={<Explorer />} />
              <Route path="/covenant" element={<DemoCovenant />} />
              <Route path="/covenant/:id" element={<CovenantInteractive />} />
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

          <footer className="relative z-10 border-t border-white/[0.03] py-8 px-4 text-xs text-gray-400">
            <div className="max-w-6xl mx-auto text-center">
              Non-custodial. Keys stay in your wallet.
            </div>
          </footer>
        </BrowserRouter>
      </WalletProvider>
    </ThemeProvider>
  );
}