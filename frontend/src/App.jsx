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

export default function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <BrowserRouter>
          <DagBackground />
          <nav className="fixed top-0 w-full z-40 glass-panel border-b border-white/5 dark:bg-[#0A0A0D]/85">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
              <Link to="/" className="group flex items-center gap-2.5">
                {/* Premium DAG-vibe logo mark (rich blockDAG with multiple parents/edges, Kaspa colors) */}
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 48 48" className="shrink-0 drop-shadow-[0_0_8px_rgba(73,234,203,0.45)] group-hover:drop-shadow-[0_0_16px_rgba(73,234,203,0.7)] transition-all duration-300">
                  <defs>
                    <linearGradient id="navGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#49EACB"/>
                      <stop offset="35%" stopColor="#00D2FF"/>
                      <stop offset="65%" stopColor="#3B82F6"/>
                      <stop offset="100%" stopColor="#7C3AED"/>
                    </linearGradient>
                    <filter id="navGlow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="1.1" result="b1"/>
                      <feGaussianBlur stdDeviation="2.6" result="b2"/>
                      <feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <g filter="url(#navGlow)">
                    {/* Organic central DAG block — Kaspa blockDAG shape */}
                    <polygon points="24,5 41,13 42,33 25,43 7,34 6,14" fill="none" stroke="url(#navGrad)" strokeWidth="2.3" strokeLinejoin="round"/>
                    {/* Rich DAG edges — multiple parents/merges for real GHOSTDAG vibe */}
                    <path d="M12 17 Q18 11 24 9" fill="none" stroke="url(#navGrad)" strokeWidth="1.3" strokeLinecap="round" opacity="0.85"/>
                    <path d="M36 17 Q30 11 24 9" fill="none" stroke="url(#navGrad)" strokeWidth="1.3" strokeLinecap="round" opacity="0.85"/>
                    <path d="M9 28 Q15 24 21 27" fill="none" stroke="url(#navGrad)" strokeWidth="1.15" strokeLinecap="round" opacity="0.75"/>
                    <path d="M39 28 Q33 24 27 27" fill="none" stroke="url(#navGrad)" strokeWidth="1.15" strokeLinecap="round" opacity="0.75"/>
                    <path d="M13 37 Q18 41 24 40" fill="none" stroke="url(#navGrad)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7"/>
                    <path d="M35 37 Q30 41 24 40" fill="none" stroke="url(#navGrad)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7"/>
                    {/* DAG nodes — 8+ for dense nice vibe */}
                    <circle cx="11" cy="14" r="2.1" fill="#49EACB"/>
                    <circle cx="37" cy="14" r="2.0" fill="#00D2FF"/>
                    <circle cx="24" cy="23" r="3.1" fill="url(#navGrad)"/>
                    <circle cx="8" cy="27" r="1.9" fill="#3B82F6"/>
                    <circle cx="40" cy="27" r="1.9" fill="#7C3AED"/>
                    <circle cx="13" cy="38" r="1.85" fill="#00D2FF"/>
                    <circle cx="35" cy="38" r="1.9" fill="#49EACB"/>
                    {/* Extra tip nodes for full DAG density */}
                    <circle cx="18" cy="8" r="1.4" fill="#7C3AED"/>
                    <circle cx="30" cy="8" r="1.45" fill="#00D2FF"/>
                  </g>
                </svg>
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