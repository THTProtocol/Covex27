import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { Terminal, Layers, Loader2, RefreshCw, Sparkles, Plus, Zap, Cpu, Palette, Code } from 'lucide-react';

const TRUNC = (s, n = 8) => s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

export default function PaidBuilder() {
  const navigate = useNavigate();
  const { address, DevConnectPanel } = useWallet();
  const paidTier = localStorage.getItem('covex_paid_tier') || 'CREATOR';

  const [myCovenants, setMyCovenants] = useState([]);
  const [fetchingCovenants, setFetchingCovenants] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [justPaid, setJustPaid] = useState(null);

  const tierAccent = { CREATOR: '#3B82F6', PRO: '#E8AF34', MAX: '#A855F7' }[paidTier] || '#49EACB';

  useEffect(() => {
    const raw = sessionStorage.getItem('payment_just_confirmed');
    if (raw) {
      try {
        setJustPaid(JSON.parse(raw));
        sessionStorage.removeItem('payment_just_confirmed');
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    if (!tier || tier === 'FREE') {
      navigate('/pricing', { replace: true });
    }
  }, [navigate]);

  const fetchMyCovenants = useCallback(() => {
    if (!address) return;
    setFetchingCovenants(true);
    setFetchError(null);
    fetch(`/api/covenants?creator=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => {
        setMyCovenants(Array.isArray(d.covenants) ? d.covenants : []);
        setFetchingCovenants(false);
      })
      .catch(err => {
        setFetchError(err.message);
        setFetchingCovenants(false);
      });
  }, [address]);

  useEffect(() => {
    if (address) fetchMyCovenants();
  }, [address, fetchMyCovenants]);

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
      {/* Payment success banner */}
      {justPaid && (
        <div className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 flex items-start gap-4">
          <Sparkles className="text-emerald-400 mt-1" size={28} />
          <div>
            <div className="text-emerald-400 font-bold text-xl">Payment Confirmed</div>
            <div className="text-gray-300 mt-1">
              You now have <span className="font-semibold text-white">{justPaid.tier}</span> access. 
              Below are all covenants deployed with this wallet. Click <strong>Go to Terminal</strong> for the full tools.
            </div>
          </div>
        </div>
      )}

      {/* Clean header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: tierAccent + '20', border: `1px solid ${tierAccent}40` }}>
          <Sparkles size={24} style={{ color: tierAccent }} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white">Your Covenants</h1>
          <p className="text-gray-400 text-sm">{paidTier} Paid • Terminal access enabled</p>
        </div>
      </div>

      {/* Connect prompt */}
      {!address && (
        <div className="bg-[#111] border border-white/10 rounded-2xl p-8 text-center mb-8">
          <p className="text-gray-300 mb-4">Connect your wallet to see the covenants you have deployed.</p>
          <DevConnectPanel compact />
        </div>
      )}

      {/* Loading */}
      {address && fetchingCovenants && (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#49EACB]" size={32} /></div>
      )}

      {/* Error */}
      {address && !fetchingCovenants && fetchError && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
          <p className="text-red-400">Failed to load covenants: {fetchError}</p>
          <button onClick={fetchMyCovenants} className="mt-3 text-sm underline text-[#49EACB]">Try again</button>
        </div>
      )}

      {/* Empty state */}
      {address && !fetchingCovenants && !fetchError && myCovenants.length === 0 && (
        <div className="bg-[#111] border border-white/10 rounded-2xl p-10 text-center">
          <Layers size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No covenants yet</h3>
          <p className="text-gray-400">You haven't deployed any covenants with this wallet on the current network.</p>
          <p className="text-xs text-gray-300 mt-4">Use the Deploy link in the top navigation when you want to create one.</p>
        </div>
      )}

      {/* Covenants list - clean and focused */}
      {address && !fetchingCovenants && myCovenants.length > 0 && (
        <div className="space-y-3">
          {myCovenants.map((cov) => (
            <div key={cov.tx_id} className="bg-[#0f0f0f] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
              <div className="min-w-0">
                <div className="font-semibold text-lg text-white truncate">
                  {cov.name || cov.covenant_type || 'Unnamed Covenant'}
                </div>
                <div className="text-xs text-gray-300 font-mono mt-1">{TRUNC(cov.tx_id)}</div>
              </div>

              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => navigate(`/covenant/${encodeURIComponent(cov.tx_id)}`)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-sm transition"
                >
                  View
                </button>
                <button
                  onClick={() => navigate(`/covenant/${encodeURIComponent(cov.tx_id)}?tab=terminal`)}
                  className="px-6 py-2.5 rounded-xl bg-[#49EACB] text-black font-bold text-sm flex items-center gap-2 hover:brightness-105 transition"
                >
                  <Terminal size={17} /> Go to Terminal
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create New Covenant - Full Terminal Access */}
      {address && !fetchingCovenants && (
        <div className="mt-10 bg-[#0f0f0f] border border-[#49EACB]/20 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-2.5 rounded-xl bg-[#49EACB]/15 shrink-0">
              <Plus size={22} className="text-[#49EACB]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Create a New Covenant</h3>
              <p className="text-sm text-gray-300">
                Open the full paid Terminal to deploy a brand-new covenant with complete customization.
                Configure game types, ZK circuits, oracle keys, custom UI, fees, and generate SilverScript.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2 text-xs text-gray-300 p-2 rounded-lg bg-black/30">
              <Cpu size={14} className="text-[#49EACB] shrink-0" />
              <span>12 game types with pre-audited ZK circuits</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300 p-2 rounded-lg bg-black/30">
              <Zap size={14} className="text-[#49EACB] shrink-0" />
              <span>Oracle + ZK proof resolution modes</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300 p-2 rounded-lg bg-black/30">
              <Palette size={14} className="text-[#49EACB] shrink-0" />
              <span>Covenant Studio integration for custom UI</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300 p-2 rounded-lg bg-black/30">
              <Code size={14} className="text-[#49EACB] shrink-0" />
              <span>Auto-generated SilverScript + deploy</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/premium')}
            className="w-full py-4 rounded-xl bg-[#49EACB] text-black font-bold text-base flex items-center justify-center gap-2.5 hover:shadow-[0_0_30px_rgba(73,234,203,0.4)] active:scale-[0.985] transition-all"
          >
            <Terminal size={20} />
            Open Full Terminal, Create New Covenant
          </button>
        </div>
      )}

      <div className="mt-10 text-center text-xs text-gray-300">
        Paid tier active. All Terminal tools (ZK, Oracles, UI, SilverScript) are unlocked for your covenants.
      </div>
    </div>
  );
}
