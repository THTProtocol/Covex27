import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import { Terminal, Lock, ArrowLeft, Cpu, ShieldCheck } from 'lucide-react';

export default function CovenantInteractive() {
  const { id } = useParams();
  const [covenant, setCovenant] = useState(null);
  const [amount, setAmount] = useState('');
  const { address, sendPayment, connecting, buildUri } = useWallet();

  useEffect(() => {
    fetch('/api/covenants').then(r => r.json()).then(d => {
      setCovenant(d.covenants.find(c => c.tx_id === id));
    });
  }, [id]);

  const deployUri = useMemo(() => covenant ? buildUri(covenant.address, amount || 0) : '#', [covenant, amount, buildUri]);

  const handleExecute = async () => {
    if (!covenant || !amount) return;
    if (address) {
      try { await sendPayment(covenant.address, parseFloat(amount) * 1e8); }
      catch { window.location.href = deployUri; }
    } else {
      window.location.href = deployUri;
    }
  };

  if (!covenant) return <div className="p-20 text-center text-kaspa-green animate-pulse font-mono tracking-widest">INITIALIZING PROTOCOL SEQUENCE...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-8 font-mono text-sm uppercase tracking-wider">
        <ArrowLeft size={16} /> Return to Registry
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-10 rounded-3xl flex flex-col">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-kaspa-green/10 rounded-2xl border border-kaspa-green/30 text-kaspa-green">
              <Cpu size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">{covenant.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-kaspa-gold/10 text-kaspa-gold border border-kaspa-gold/20 uppercase tracking-widest">{covenant.tier} TIER</span>
                <span className="text-sm text-gray-500 font-mono">{covenant.category}</span>
              </div>
            </div>
          </div>
          {covenant.image && <img src={covenant.image} alt="Covenant Protocol" className="w-full h-48 object-cover rounded-2xl mb-8 border border-white/10" />}
          <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
            <h3 className="text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">Protocol Description</h3>
            <p className="text-gray-300 leading-relaxed">{covenant.desc}</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-10 rounded-3xl bg-black/60 border-kaspa-green/20 relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-kaspa-green/0 via-kaspa-green to-kaspa-green/0 opacity-50" />
          <h2 className="text-xl font-mono text-kaspa-green flex items-center gap-3 mb-10">
            <Terminal size={24} /> SECURE EXECUTION TERMINAL
          </h2>
          <div className="space-y-8">
            <div>
              <label className="block text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">Amount to Lock (KAS)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full cyber-input text-4xl p-6 rounded-2xl font-mono placeholder:text-kaspa-green/20"
              />
            </div>
            <button
              onClick={handleExecute}
              disabled={connecting || !amount}
              className="w-full bg-kaspa-green text-black font-extrabold py-5 rounded-2xl text-lg hover:shadow-[0_0_40px_rgba(73,234,203,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-wide"
            >
              {address ? <ShieldCheck size={24} /> : <Lock size={24} />}
              {address ? 'Sign Transaction' : 'Open Wallet Application'}
            </button>
            <p className="text-center text-xs text-gray-600 font-mono mt-4">DIRECT wRPC CONNECTION. NO MIDDLEMEN.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
