import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { WalletProvider } from './components/WalletContext';
import WalletButton from './components/WalletButton';
import DagBackground from './components/DagBackground';
import WhatIsKaspa from './components/WhatIsKaspa';
import Explorer from './pages/Explorer';
import CovenantInteractive from './pages/CovenantInteractive';
import CreateCovenant from './pages/CreateCovenant';
import Pricing from './pages/Pricing';
import Dashboard from './pages/Dashboard';
import Terms from './pages/Terms';

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
        <WhatIsKaspa open={kaspaOpen} onClose={() => setKaspaOpen(false)} />

        <nav className="fixed top-0 w-full z-40 bg-[#0A0A0D]/80 backdrop-blur-md border-b border-white/10">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight text-white hover:text-kaspa-green transition-colors"
            >
              COVEX
            </Link>
            <div className="flex items-center gap-5">
              <button
                onClick={() => setKaspaOpen(true)}
                className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                What is Kaspa?
              </button>
              <NavLink to="/" end className={NL}>
                Explorer
              </NavLink>
              <NavLink to="/create" className={NL}>
                Create
              </NavLink>
              <NavLink to="/pricing" className={NL}>
                Pricing
              </NavLink>
              <NavLink to="/dashboard" className={NL}>
                Dashboard
              </NavLink>
              <WalletButton />
            </div>
          </div>
        </nav>

        <div className="relative z-10 min-h-screen pt-16">
          <Routes>
            <Route path="/" element={<Explorer />} />
            <Route path="/covenant/:id" element={<CovenantInteractive />} />
            <Route path="/create" element={<CreateCovenant />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/5 bg-[#0A0A0D]/60 backdrop-blur-md py-8 px-4">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-6">
              <Link to="/terms" className="hover:text-gray-400 transition-colors">
                Terms and Conditions
              </Link>
              <a
                href="https://github.com/THTProtocol/Covex27"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://kaspa.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors"
              >
                Kaspa.org
              </a>
            </div>
            <div className="flex items-center gap-4">
              <span>Non-custodial. Keys stay in your wallet.</span>
              <span className="text-white/20">|</span>
              <span>Chain is the truth. Covex is the window.</span>
            </div>
          </div>
          <div className="max-w-6xl mx-auto mt-4 text-center text-xs text-gray-700">
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
