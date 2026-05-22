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
              <NavLink to="/deploy" className={NL}>
                Deploy
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
            <Route path="/explorer" element={<>
              <Explorer />
              <KaspaPromo />
            </>} />
            <Route path="/covenant/:id" element={<CovenantInteractive />} />
            <Route path="/create" element={<CreateCovenant />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/deploy" element={<Deploy />} />
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
              <span>DAG is the truth. Covex is the window.</span>
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

import { Terminal, Database, Code2, Zap } from 'lucide-react';

function KaspaPromo() {
  return (
    <section className="relative z-10 flex flex-col items-center justify-center pt-24 pb-16 px-6 text-center animate-in fade-in duration-700">
      
      {/* Network Status Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111111] border border-[#1f1f1f] text-gray-400 text-xs font-mono mb-8">
        <div className="w-1.5 h-1.5 rounded-full bg-[#49EACB] shadow-[0_0_8px_#49EACB] animate-pulse" />
        TN-12 LIVE (TOCCATA)
      </div>

      {/* Main Headline */}
      <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 max-w-4xl mx-auto leading-[1.1]">
        Interactive Covenants for <br className="hidden md:block"/>
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] to-white">The Kaspa BlockDAG</span>
      </h2>

      {/* Subtitle */}
      <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-16">
        Covex is the native indexing and deployment layer for SilverScript covenants. Compile, deploy, and interact with programmable UTXOs at 10 blocks per second.
      </p>

      {/* Sleek Data Bar */}
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-[#0a0a0a]/80 backdrop-blur-md border border-[#1f1f1f] shadow-2xl">
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Terminal size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">LANGUAGE</p>
            <p className="text-sm font-semibold text-white">SilverScript</p>
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Zap size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">SPEED</p>
            <p className="text-sm font-semibold text-white">10 BPS</p>
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Database size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">INDEXER</p>
            <p className="text-sm font-semibold text-white">Covex Engine</p>
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Code2 size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">RUNTIME</p>
            <p className="text-sm font-semibold text-white">Toccata</p>
          </div>
        </div>

      </div>
    </section>
  );
}
