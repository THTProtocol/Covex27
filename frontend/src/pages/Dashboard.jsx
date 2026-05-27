import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { LayoutDashboard, ExternalLink, ShieldCheck, PlusCircle } from 'lucide-react';

export default function Dashboard() {
  const { address, balance } = useWallet();
  const [generatedUis, setGeneratedUis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountTier, setAccountTier] = useState('FREE');

  useEffect(() => {
    // Fetch user's generated UIs
    setLoading(true);
    fetch('/api/status')
      .then((r) => r.json())
      .then(() => {
        if (address) {
          setGeneratedUis([]);
          setAccountTier('FREE');
        }
      })
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-20 text-center">
        <LayoutDashboard size={48} className="mx-auto text-gray-200 mb-6" />
        <h1 className="text-2xl font-semibold text-white mb-4">Dashboard</h1>
        <p className="text-gray-200 mb-8">
          Connect your wallet to view your generated UIs, track payments, and manage your covenants.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all"
        >
          Explore Covenants
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="glass-panel p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-kaspa-green/10 border border-kaspa-green/30 flex items-center justify-center">
              <ShieldCheck size={24} className="text-kaspa-green" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
              <p className="text-sm text-gray-300 font-mono">{address}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {balance !== null && (
              <div className="px-4 py-2 rounded-xl bg-kaspa-green/10 border border-kaspa-green/30">
                <span className="text-xs text-gray-300">Balance: </span>
                <span className="text-sm font-mono text-white">{(balance / 1e8).toFixed(4)} KAS</span>
              </div>
            )}
            <span className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
              accountTier === 'MAX'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                : accountTier === 'PRO'
                ? 'bg-kaspa-gold/10 text-kaspa-gold border-kaspa-gold/30'
                : accountTier === 'CREATOR'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'bg-gray-500/10 text-gray-200 border-gray-500/20'
            }`}>
              {accountTier} TIER
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Active UIs', generatedUis.filter((u) => u.is_published).length.toString(), 'published'],
          ['Featured UIs', generatedUis.filter((u) => u.featured).length.toString(), 'featured'],
          ['Tier', accountTier, accountTier === 'FREE' ? 'upgrade' : 'active'],
        ].map(([label, value, status]) => (
          <div key={label} className="glass-panel p-6 text-center">
            <p className="text-2xl font-bold text-white font-mono tabular-nums">{value}</p>
            <p className="text-xs text-gray-300 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Generated UIs */}
      <div className="glass-panel overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Your Generated UIs</h2>
          <Link
            to="/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 text-xs font-semibold hover:bg-kaspa-green/20 transition-colors"
          >
            <PlusCircle size={14} />
            Create New
          </Link>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-300 text-sm animate-pulse">Loading your UIs...</p>
          </div>
        ) : generatedUis.length === 0 ? (
          <div className="px-6 py-16 text-center space-y-4">
            <LayoutDashboard size={40} className="mx-auto text-white/80" />
            <div>
              <p className="text-gray-300 text-sm">No generated UIs yet</p>
              <p className="text-gray-200 text-xs mt-1">
                Upgrade to Creator tier or above to generate interactive UIs for your covenants.
              </p>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 text-sm font-semibold hover:bg-kaspa-green/20 transition-colors"
            >
              View Pricing Tiers
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {generatedUis.map((ui) => (
              <div key={ui.slug} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02]">
                <div>
                  <p className="text-sm font-semibold text-white">{ui.covenant_id?.slice(0, 16)}...</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-300 font-mono">/{ui.slug}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      ui.featured
                        ? 'bg-kaspa-gold/10 text-kaspa-gold border border-kaspa-gold/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {ui.tier}
                    </span>
                    {ui.featured && (
                      <span className="text-xs text-kaspa-gold">Featured</span>
                    )}
                  </div>
                </div>
                <a
                  href={`/ui/${ui.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-gray-200 hover:text-kaspa-green transition-colors"
                >
                  <ExternalLink size={12} />
                  Preview UI
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upgrade prompt for FREE users */}
      {accountTier === 'FREE' && (
        <div className="glass-panel p-8 text-center space-y-4 bg-kaspa-gold/[0.02] border-kaspa-gold/20">
          <h3 className="text-lg font-semibold text-white">Unlock Interactive UI Generation</h3>
          <p className="text-sm text-gray-200 max-w-md mx-auto">
            Upgrade to Creator tier for a one-time payment of 100 KAS and generate fully interactive
            UIs for your covenants with wallet integration.
          </p>
          <Link
            to="/pricing"
            className="inline-block px-6 py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all"
          >
            View Pricing
          </Link>
        </div>
      )}

      {/* Disclaimers */}
      <div className="glass-panel p-5 text-xs text-gray-200 leading-relaxed">
        <p>
          Generated UIs are hosted as static HTML pages. Your covenant remains immutable on the Kaspa
          BlockDAG. Covex does not control or modify on-chain data. All interactions occur
          non-custodially through your own wallet.
        </p>
      </div>
    </div>
  );
}
