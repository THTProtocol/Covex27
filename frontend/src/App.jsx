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
            <Route path="/" element={<>
              <Explorer />
              <KaspaPromo />
            </>} />
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

function KaspaPromo() {
  return (
    <section className="relative z-10 py-20 px-4">
      <div className="max-w-5xl mx-auto text-center">
        <div className="glass-panel p-10 sm:p-14 rounded-3xl border border-kaspa-green/10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-kaspa-green/10 text-kaspa-green text-xs font-medium mb-6 border border-kaspa-green/20">
            <span className="h-1.5 w-1.5 rounded-full bg-kaspa-green" />
            Built on Kaspa BlockDAG
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-tight">
            The Fastest Decentralized Ledger on Earth
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Kaspa processes <strong className="text-white">10 blocks per second</strong> with parallel block processing via the GHOSTDAG protocol.
            Native SilverScript covenants enable programmable spending conditions. Learn the technology before you interact.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8">
            {[
              ['10 BPS', 'Block Production'],
              ['GHOSTDAG', 'Consensus Protocol'],
              ['Toccata', 'Native Covenants'],
              ['Rust Node', 'Production Ready'],
            ].map(([val, label]) => (
              <div key={label} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-lg font-bold text-white">{val}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <a
            href="https://kaspa.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Visit Kaspa.org
          </a>
        </div>
      </div>
    </section>
  );
}
