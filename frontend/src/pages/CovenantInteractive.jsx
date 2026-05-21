import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import { Terminal, Lock, ArrowLeft, Cpu, ShieldCheck, ExternalLink, AlertTriangle, BadgeCheck } from 'lucide-react';

const DEPLOYER = 'kaspatest:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq';

const isVerified = (c) => c?.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER';

export default function CovenantInteractive() {
  const { id } = useParams();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [extraParams, setExtraParams] = useState({});
  const { address, balance, sendPayment, connecting, buildUri } = useWallet();

  useEffect(() => {
    setLoading(true);
    fetch('/api/covenants')
      .then((r) => r.json())
      .then((d) => {
        setCovenant((d.covenants || []).find((c) => c.tx_id === id) || null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const deployUri = useMemo(
    () =>
      covenant
        ? buildUri(covenant.address || DEPLOYER, amount || '0', {
            scriptHash: covenant.script_hash,
          })
        : null,
    [covenant, amount, buildUri]
  );

  const handleExecute = async () => {
    if (!covenant || !amount) return;
    if (address) {
      try {
        await sendPayment(covenant.address || DEPLOYER, amount, {
          scriptHash: covenant.script_hash,
        });
      } catch {
        if (deployUri) window.open(deployUri, '_blank');
      }
    } else if (deployUri) {
      window.open(deployUri, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="p-20 text-center text-kaspa-green animate-pulse font-mono tracking-widest text-lg">
        INITIALIZING PROTOCOL SEQUENCE...
      </div>
    );
  }

  if (!covenant) {
    return (
      <div className="p-20 text-center">
        <p className="text-gray-500 text-lg">Covenant not found.</p>
        <Link to="/" className="text-kaspa-green hover:underline mt-4 inline-block">
          Return to Explorer
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-8 font-mono text-sm uppercase tracking-wider"
      >
        <ArrowLeft size={16} /> Return to Registry
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Covenant metadata */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel p-8 sm:p-10 rounded-3xl flex flex-col"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-kaspa-green/10 rounded-2xl border border-kaspa-green/30 text-kaspa-green">
              <Cpu size={32} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {covenant.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-kaspa-gold/10 text-kaspa-gold border border-kaspa-gold/20 uppercase tracking-widest">
                  {covenant.tier} TIER
                </span>
                <span className="text-sm text-gray-500 font-mono">{covenant.category}</span>
              </div>
            </div>
          </div>

          {/* Verification badge */}
          {isVerified(covenant) ? (
            <div className="mb-6 px-5 py-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex items-center gap-3">
              <BadgeCheck size={20} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">VERIFIED COVENANT ({covenant.verified_tier} tier)</p>
                <p className="text-xs text-emerald-400/70">Full transparency. All fields, logic summary, and receiving addresses disclosed.</p>
              </div>
            </div>
          ) : (
            <div className="mb-6 px-5 py-4 rounded-xl bg-red-500/[0.06] border border-red-500/25 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">DANGEROUS / UNVERIFIED COVENANT</p>
                <p className="text-xs text-red-400/70">Limited disclosure: tx_id, script_hash, amount only. Use at your own risk. Full details require verified payment by covenant creator.</p>
              </div>
            </div>
          )}

          <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-6">
            <h3 className="text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">
              {isVerified(covenant) ? 'Logic Summary (Full Disclosure)' : 'Protocol Description (Limited)'}
            </h3>
            <p className="text-gray-300 leading-relaxed">
              {isVerified(covenant)
                ? (covenant.description || 'Verified covenant. Full disclosure enabled.')
                : 'Limited information available. Only tx_id, script_hash, and amount are disclosed. Upgrade to a paid tier for full transparency.'}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 mt-auto">
            {[
              ['Covenant Type', covenant.covenant_type || 'Unknown'],
              ['Script Hash', (covenant.script_hash || '').slice(0, 20) + '...'],
              ['Locked KAS', `${(covenant.amount_kaspa || 0).toLocaleString()} KAS`],
              ['Category', covenant.category || 'General'],
            ].map(([label, value]) => (
              <div key={label} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-sm font-mono text-white truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* TXID */}
          <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
            <p className="text-xs text-gray-500 mb-1">TXID</p>
            <p className="text-xs font-mono text-kaspa-green break-all">{covenant.tx_id}</p>
          </div>
        </motion.div>

        {/* Right: Interaction terminal */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel p-8 sm:p-10 rounded-3xl bg-black/60 border-kaspa-green/20 relative overflow-hidden flex flex-col justify-center"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-kaspa-green/0 via-kaspa-green to-kaspa-green/0 opacity-50" />
          <h2 className="text-xl font-mono text-kaspa-green flex items-center gap-3 mb-10">
            <Terminal size={24} /> SECURE EXECUTION TERMINAL
          </h2>

          <div className="space-y-8">
            <div>
              <label className="block text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">
                Amount to Lock (KAS)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.00000001"
                min="0"
                className="w-full cyber-input text-4xl p-6 rounded-2xl font-mono placeholder:text-kaspa-green/20"
              />
            </div>

            {address && (
              <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                <p className="text-xs text-emerald-400 font-mono mb-1">CONNECTED WALLET</p>
                <p className="text-sm font-mono text-white truncate">{address}</p>
                {balance !== null && (
                  <p className="text-xs text-gray-400 mt-1">
                    Balance: {(balance / 1e8).toFixed(4)} KAS
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleExecute}
              disabled={connecting || !amount}
              className="w-full bg-kaspa-green text-black font-extrabold py-5 rounded-2xl text-lg hover:shadow-[0_0_40px_rgba(73,234,203,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-wide"
            >
              {address ? <ShieldCheck size={24} /> : <Lock size={24} />}
              {connecting ? 'PROCESSING...' : address ? 'Sign & Execute' : 'Open Wallet to Execute'}
            </button>

            {deployUri && (
              <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                <p className="text-xs text-gray-600 font-mono break-all">
                  URI: {deployUri.slice(0, 60)}...
                </p>
              </div>
            )}

            <p className="text-center text-xs text-gray-600 font-mono">
              DIRECT wRPC CONNECTION · NO MIDDLEMEN · NON-CUSTODIAL
            </p>

            {/* External explorer link */}
            <a
              href={`https://explorer.kaspa.org/tx/${covenant.tx_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-kaspa-green transition-colors font-mono"
            >
              <ExternalLink size={12} />
              View on Kaspa Explorer
            </a>
          </div>
        </motion.div>
      </div>

      {/* Disclaimer */}
      <div className="glass-panel p-6 mt-8 text-xs text-gray-600 leading-relaxed max-w-3xl mx-auto">
        <p className="text-gray-500 font-semibold mb-2">Transparency Notice</p>
        <p>
          This covenant is immutable on the Kaspa BlockDAG. Covex does not create, modify, or control
          it. We only index publicly available data. All interactions occur non-custodially through your
          own wallet. You bear full responsibility for verifying all transaction details before signing.
        </p>
      </div>
    </div>
  );
}
