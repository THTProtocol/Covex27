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
import Marketplace from './pages/Marketplace';
import Analytics from './pages/Analytics';
import Governance from './pages/Governance';
import Dashboard from './pages/Dashboard';
import Terms from './pages/Terms';
import Deploy from './pages/Deploy';
import PaidDeploy from './pages/PaidDeploy';
import PaidBuilder from './pages/PaidBuilder';
import PremiumBuilder from './pages/PremiumBuilder';

const NL = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-kaspa-green' : 'text-gray-200 hover:text-white'
  }`;

// Smart Deploy nav link: paid users → /paid-builder, free → /deploy
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
  return (
    <NavLink to={to} className={NL}>
      Deploy
    </NavLink>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <DagBackground />

        <nav className="fixed top-0 w-full z-40 bg-[#0A0A0D]/85 backdrop-blur-lg border-b border-white/5 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link
              to="/"
              className="text-lg font-bold tracking-tight text-white hover:text-[#49EACB] transition-colors flex items-center gap-2.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 48 48" className="drop-shadow-[0_0_12px_rgba(73,234,203,0.5)]">
                <defs>
                  <filter id="navGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.5" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <linearGradient id="navG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#49EACB"/>
                    <stop offset="50%" stop-color="#00D2FF"/>
                    <stop offset="100%" stop-color="#7e14ff"/>
                  </linearGradient>
                </defs>
                <g filter="url(#navGlow)">
                  <line x1="7" y1="10" x2="7" y2="38" stroke="url(#navG)" stroke-width="1.5" opacity="0.7"/>
                  <line x1="7" y1="10" x2="18" y2="6" stroke="url(#navG)" stroke-width="1" opacity="0.5"/>
                  <line x1="18" y1="6" x2="24" y2="12" stroke="url(#navG)" stroke-width="0.8" opacity="0.4"/>
                  <line x1="7" y1="38" x2="18" y2="42" stroke="url(#navG)" stroke-width="1" opacity="0.5"/>
                  <line x1="18" y1="42" x2="24" y2="36" stroke="url(#navG)" stroke-width="0.8" opacity="0.4"/>
                  <circle cx="7" cy="10" r="3" fill="#49EACB"/>
                  <circle cx="18" cy="6" r="2" fill="#7e14ff" opacity="0.85"/>
                  <circle cx="24" cy="12" r="1.8" fill="#00D2FF" opacity="0.7"/>
                  <circle cx="7" cy="24" r="3.2" fill="#00D2FF"/>
                  <circle cx="7" cy="38" r="3" fill="#7e14ff"/>
                  <circle cx="18" cy="42" r="2" fill="#49EACB" opacity="0.85"/>
                  <circle cx="24" cy="36" r="1.8" fill="#00D2FF" opacity="0.7"/>
                </g>
              </svg>
              <span className="bg-gradient-to-r from-[#49EACB] via-[#00D2FF] to-[#7e14ff] bg-clip-text text-transparent font-black tracking-tight text-lg">COVEX</span>
            </Link>
            <div className="flex items-center gap-6">
              <NavLink to="/" end className={NL}>
                Explore
              </NavLink>
              <NavLink to="/what-is-kaspa" className={NL}>
                About
              </NavLink>
              <NavLink to="/pricing" className={NL}>
                Pricing
              </NavLink>
              <SmartDeployLink />
              <WalletButton />
            </div>
          </div>
        </nav>

        <div className="relative z-10 min-h-screen pt-16">
          <Routes>
            <Route path="/" element={<Explorer />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/covenant/:id" element={<CovenantInteractive />} />
            <Route path="/what-is-kaspa" element={<WhatIsKaspaPage />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/deploy" element={<Deploy />} />
            <Route path="/deploy/paid" element={<PaidDeploy />} />
            <Route path="/paid-builder" element={<PaidBuilder />} />
            <Route path="/premium" element={<PremiumBuilder />} />
            <Route path="/templates" element={<TemplateLibrary />} />
            <Route path="/advanced" element={<AdvancedComposer />} />
            <Route path="/multi-oracle" element={<AdvancedComposer />} /> {/* Phase 15 focused entry */}
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/governance" element={<Governance />} />
          </Routes>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/[0.03] bg-[#0A0A0D]/85 backdrop-blur-lg py-8 px-4">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-200">
            <div className="flex items-center gap-6">
              <Link to="/terms" className="hover:text-white transition-colors">
                Terms and Conditions
              </Link>
              <a
                href="https://github.com/THTProtocol/Covex27"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://kaspa.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Kaspa.org
              </a>
            </div>
            <div className="flex items-center gap-4">
              <span>Non-custodial. Keys stay in your wallet.</span>
              <span className="text-white/10">|</span>
              <span>DAG is the truth. Covex is the window.</span>
            </div>
          </div>
          <div className="max-w-6xl mx-auto mt-4 text-center text-[11px] text-gray-200 leading-relaxed">
            <p>
              Covex indexes publicly available covenant data from the Kaspa BlockDAG. It does not
              create, modify, or control any on-chain covenant. All covenants remain immutable on-chain;
              Covex only indexes them and generates optional interactive UIs for paid users. It is solely
              the user's liability to ensure any covenant they create or interact with is legal in their
              jurisdiction. Covex provides no legal advice and has no connection to predictive markets,
              gambling, or any illegal activity.
            </p>
          </div>
        </footer>
      </BrowserRouter>
    </WalletProvider>
  );
}
