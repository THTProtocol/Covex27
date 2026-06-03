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
              <Link to="/" className="group flex items-center gap-2.5 text-lg font-extrabold tracking-[1.5px] text-white hover:text-[#49EACB] transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 48 48" className="shrink-0 drop-shadow-[0_0_8px_rgba(73,234,203,0.5)] group-hover:drop-shadow-[0_0_12px_rgba(73,234,203,0.7)] transition-all">
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#49EACB"/><stop offset="45%" stopColor="#00D2FF"/><stop offset="100%" stopColor="#7e14ff"/>
                    </linearGradient>
                  </defs>
                  <g>
                    <circle cx="8" cy="8" r="2.1" fill="#49EACB"/>
                    <circle cx="8" cy="24" r="2.9" fill="#00D2FF"/>
                    <circle cx="8" cy="40" r="2.1" fill="#7e14ff"/>
                    <circle cx="24" cy="8" r="1.9" fill="#7e14ff" opacity="0.9"/>
                    <circle cx="24" cy="40" r="1.9" fill="#49EACB" opacity="0.9"/>
                    <circle cx="40" cy="8" r="2.1" fill="#00D2FF"/>
                    <circle cx="40" cy="24" r="2.9" fill="#49EACB"/>
                    <circle cx="40" cy="40" r="2.1" fill="#7e14ff"/>
                    <line x1="8" y1="8" x2="24" y2="8" stroke="url(#navGrad)" strokeWidth="1.1" opacity="0.65"/>
                    <line x1="8" y1="24" x2="24" y2="8" stroke="url(#navGrad)" strokeWidth="0.9" opacity="0.55"/>
                    <line x1="8" y1="24" x2="24" y2="40" stroke="url(#navGrad)" strokeWidth="0.9" opacity="0.55"/>
                    <line x1="8" y1="40" x2="24" y2="40" stroke="url(#navGrad)" strokeWidth="1.1" opacity="0.65"/>
                    <line x1="24" y1="8" x2="40" y2="8" stroke="url(#navGrad)" strokeWidth="1.1" opacity="0.65"/>
                    <line x1="24" y1="40" x2="40" y2="40" stroke="url(#navGrad)" strokeWidth="1.1" opacity="0.65"/>
                    <line x1="24" y1="8" x2="40" y2="24" stroke="url(#navGrad)" strokeWidth="0.9" opacity="0.55"/>
                    <line x1="24" y1="40" x2="40" y2="24" stroke="url(#navGrad)" strokeWidth="0.9" opacity="0.55"/>
                  </g>
                </svg>
                <span className="font-black tracking-[2px] text-white group-hover:text-kaspa-green dark:text-transparent dark:bg-gradient-to-r dark:from-white dark:via-[#49EACB] dark:to-white dark:bg-clip-text dark:group-hover:from-[#49EACB] dark:group-hover:via-white dark:group-hover:to-[#49EACB] transition-all">COVEX</span>
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