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

const NL = ({isActive}) => `text-sm font-medium transition-colors ${isActive?'text-kaspa-green':'text-gray-400 hover:text-white'}`;

export default function App() {
  const [kaspaOpen, setKaspaOpen] = useState(false);

  return (
    <WalletProvider>
      <BrowserRouter>
        <DagBackground />
        <WhatIsKaspa open={kaspaOpen} onClose={() => setKaspaOpen(false)} />

        <nav className="fixed top-0 w-full z-40 bg-[#0A0A0D]/80 backdrop-blur-md border-b border-white/10">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link to="/" className="text-lg font-semibold tracking-tight text-white hover:text-kaspa-green transition-colors">COVEX</Link>
            <div className="flex items-center gap-5">
              <button onClick={() => setKaspaOpen(true)} className="text-sm font-medium text-gray-400 hover:text-white transition-colors">What is Kaspa?</button>
              <NavLink to="/" end className={NL}>Explorer</NavLink>
              <NavLink to="/create" className={NL}>Create</NavLink>
              <NavLink to="/pricing" className={NL}>Pricing</NavLink>
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
          </Routes>
        </div>
      </BrowserRouter>
    </WalletProvider>
  );
}
