import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Terminal, Database, Search } from 'lucide-react';

// Updated for BUILDER tier (Phase 2)
const TIER_STYLES = {
  MAX: {
    card: 'border-purple-500/30 bg-zinc-900/90',
    badge: 'bg-purple-500/20 text-purple-300',
    label: 'MAX',
  },
  PRO: {
    card: 'border-amber-500/30 bg-zinc-900/80',
    badge: 'bg-amber-500/20 text-amber-300',
    label: 'PRO',
  },
  BUILDER: {
    card: 'border-[#49EACB]/30 bg-zinc-900/70',
    badge: 'bg-[#49EACB]/20 text-[#49EACB]',
    label: 'BUILDER',
  },
  FREE: {
    card: 'border-white/10 bg-zinc-900/50',
    badge: 'bg-white/10 text-gray-300',
    label: 'FREE',
  },
};

const formatKaspa = (kas) => kas == null ? 'N/A' : `${kas.toLocaleString()} KAS`;

const truncate = (s, n = 12) => s && s.length > n*2 ? `${s.slice(0,n)}...${s.slice(-n)}` : s || 'N/A';

export default function Explorer() {
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/covenants')
      .then(res => res.json())
      .then(data => {
        setCovenants(Array.isArray(data.covenants) ? data.covenants : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load covenants');
        setLoading(false);
      });
  }, []);

  // TODO: Add real search + better interactive covenant filtering in next pass

  return (
    <div className="max-w-6xl mx-auto px-6 pt-20 pb-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Covenant Explorer</h1>
        <p className="text-gray-400">Live interactive covenants on Kaspa Testnet-12</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 border-b border-white/10">
        <button onClick={() => setActiveTab('explore')} className={`px-4 py-2 text-sm ${activeTab === 'explore' ? 'border-b-2 border-[#49EACB] text-white' : 'text-gray-400'}`}>
          All Covenants
        </button>
        <button onClick={() => setActiveTab('interactive')} className={`px-4 py-2 text-sm ${activeTab === 'interactive' ? 'border-b-2 border-[#49EACB] text-white' : 'text-gray-400'}`}>
          Interactive Demos
        </button>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading covenants from the BlockDAG...</div>}
      {error && <div className="text-red-400">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {covenants.map((c, index) => {
          const tier = (c.verified_tier || 'FREE').toUpperCase();
          const style = TIER_STYLES[tier] || TIER_STYLES.FREE;
          const isInteractive = c.ui_config?.custom_ui_enabled || c.has_custom_ui;

          return (
            <Link 
              key={c.tx_id || index} 
              to={`/covenant/${encodeURIComponent(c.tx_id)}`}
              className={`group block rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${style.card}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-semibold text-lg text-white group-hover:text-[#49EACB] transition-colors">
                    {c.name || c.covenant_type || 'Unnamed Covenant'}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{truncate(c.tx_id)}</div>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${style.badge}`}>{style.label}</span>
              </div>

              <p className="text-sm text-gray-300 line-clamp-3 mb-4">
                {c.description || c.full_logic_summary || 'No description provided.'}
              </p>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Locked: {formatKaspa(c.amount_kaspa)}</span>
                {isInteractive && <span className="text-[#49EACB]">Interactive UI</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {activeTab === 'interactive' && (
        <div className="mt-12 p-6 border border-[#49EACB]/20 rounded-2xl bg-[#0a0a0a]/60">
          <h3 className="font-semibold text-[#49EACB] mb-3">Advanced Interactive Demos (Coming Soon)</h3>
          <p className="text-sm text-gray-400">
            Full chess with client-side + ZK win verification, poker tables with on-chain settlement, and other complex games will be showcased here once creators deploy them.
          </p>
        </div>
      )}
    </div>
  );
}