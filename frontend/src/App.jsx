import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { WalletProvider } from './components/WalletContext';
import WalletButton from './components/WalletButton';
import DagBackground from './components/DagBackground';
import WhatIsKaspaModal from './components/WhatIsKaspaModal';
import Explorer from './pages/Explorer';
import CovenantInteractive from './pages/CovenantInteractive';
import WhatIsKaspaPage from './pages/WhatIsKaspa';
import Pricing from './pages/Pricing';
import Dashboard from './pages/Dashboard';
import Terms from './pages/Terms';
import Deploy from './pages/Deploy';

const NL = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-kaspa-green' : 'text-gray-400 hover:text-white'
  }`;

export default function App() {
  const [kaspaOpen, setKaspaOpen] = useState(false);

  return (
    <WalletProvider>
      <BrowserRouter>
        <DagBackground />
        <WhatIsKaspaModal open={kaspaOpen} onClose={() => setKaspaOpen(false)} />

        <nav className="fixed top-0 w-full z-40 bg-[#0A0A0D]/85 backdrop-blur-lg border-b border-white/5 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link
              to="/"
              className="text-lg font-bold tracking-tight text-white hover:text-[#49EACB] transition-colors flex items-center gap-2.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="21" fill="none" viewBox="0 0 48 46" className="drop-shadow-[0_0_8px_rgba(73,234,203,0.4)]">
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#49EACB"/>
                    <stop offset="100%" stopColor="#7e14ff"/>
                  </linearGradient>
                </defs>
                <path d="M22 7L18 11L10 17L8 25L10 33L18 38L22 40" stroke="url(#navGrad)" strokeWidth="1.5" fill="none" opacity="0.6"/>
                <circle cx="22" cy="7" r="2.5" fill="#49EACB" opacity="0.9"/>
                <circle cx="18" cy="11" r="2" fill="#00D2FF" opacity="0.8"/>
                <circle cx="10" cy="17" r="2.5" fill="#49EACB" opacity="0.9"/>
                <circle cx="8" cy="25" r="3" fill="#49EACB"/>
                <circle cx="10" cy="33" r="2.5" fill="#49EACB" opacity="0.9"/>
                <circle cx="18" cy="38" r="2" fill="#00D2FF" opacity="0.8"/>
                <circle cx="22" cy="40" r="2.5" fill="#7e14ff" opacity="0.9"/>
              </svg>
              <span className="bg-gradient-to-r from-[#49EACB] to-white bg-clip-text text-transparent">COVEX</span>
            </Link>
            <div className="flex items-center gap-6">
              <NavLink to="/what-is-kaspa" className={NL}>
                What is Kaspa?
              </NavLink>
              <NavLink to="/" end className={NL}>
                Explorer
              </NavLink>
              <NavLink to="/pricing" className={NL}>
                Pricing
              </NavLink>
              <NavLink to="/dashboard" className={NL}>
                Dashboard
              </NavLink>
              <NavLink to="/deploy" className={NL}>
                Deploy
              </NavLink>
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
          </Routes>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/[0.03] bg-[#0A0A0D]/85 backdrop-blur-lg py-8 px-4">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
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
          <div className="max-w-6xl mx-auto mt-4 text-center text-xs text-gray-500 leading-relaxed">
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
