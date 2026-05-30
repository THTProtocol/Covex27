import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { Terminal, Layers, Loader2, RefreshCw, Sparkles, Plus, Zap, Cpu, Palette, Code, ShieldCheck, ChevronRight } from 'lucide-react';

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
  const tierBadge = { CREATOR: 'CREATOR', PRO: 'PRO', MAX: 'MAX' }[paidTier] || 'PAID';

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

  // Auto-detect previous on-chain payment
  useEffect(() => {
    if (!address) return;

    fetch(`/api/paid-status?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.highest_tier) {
          const current = localStorage.getItem('covex_paid_tier');
          const tierOrder = { FREE: 0, CREATOR: 1, PRO: 2, MAX: 3 };
          if (!current || (tierOrder[data.highest_tier] || 0) > (tierOrder[current] || 0)) {
            localStorage.setItem('covex_paid_tier', data.highest_tier);
          }
        }
      })
      .catch(() => {});
  }, [address]);

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">

      {/* Persistent paid-area indicator */}
      <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono font-bold tracking-wide"
        style={{ background: tierAccent + '15', border: `1px solid ${tierAccent}30`, color: tierAccent }}>
        <ShieldCheck size={14} />
        <span>PAID AREA</span>
        <span className="opacity-50">|</span>
        <span>{tierBadge}</span>
        <span className="opacity-50">|</span>
        <span>Terminal Unlocked</span>
      </div>

      {/* Studio Tools - Professional access to advanced features after payment */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-white">Studio Tools</h2>
          <div className="text-xs text-gray-400">Full power unlocked with your tier</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <a href="/templates" className="block p-4 rounded-2xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/30 hover:bg-white/[0.02] transition group">
            <div className="font-medium text-white group-hover:text-[#49EACB] transition">Templates</div>
            <div className="text-xs text-gray-400 mt-1">Ready professional covenant designs</div>
          </a>
          <a href="/advanced" className="block p-4 rounded-2xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/30 hover:bg-white/[0.02] transition group">
            <div className="font-medium text-white group-hover:text-[#49EACB] transition">Advanced Composer</div>
            <div className="text-xs text-gray-400 mt-1">Complex agreements with primitives</div>
          </a>
          <a href="/multi-oracle" className="block p-4 rounded-2xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/30 hover:bg-white/[0.02] transition group">
            <div className="font-medium text-white group-hover:text-[#49EACB] transition">Multi-Oracle</div>
            <div className="text-xs text-gray-400 mt-1">Decentralized resolution setup</div>
          </a>
          <a href="/marketplace" className="block p-4 rounded-2xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/30 hover:bg-white/[0.02] transition group">
            <div className="font-medium text-white group-hover:text-[#49EACB] transition">Marketplace</div>
            <div className="text-xs text-gray-400 mt-1">Discover and publish templates</div>
          </a>
          <a href="/analytics" className="block p-4 rounded-2xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/30 hover:bg-white/[0.02] transition group">
            <div className="font-medium text-white group-hover:text-[#49EACB] transition">Analytics</div>
            <div className="text-xs text-gray-400 mt-1">Performance and insights</div>
          </a>

        </div>
      </div>

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

      {/* Payment broadcast / pending confirmation banner (for URI/deep-link wallets) */}
      {sessionStorage.getItem('payment_pending_uri') && !justPaid && (
        <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 flex items-start gap-4">
          <Loader2 className="text-amber-400 mt-1 animate-spin" size={28} />
          <div className="flex-1">
            <div className="text-amber-400 font-bold text-xl">Payment Broadcast</div>
            <div className="text-gray-300 mt-1 text-sm">
              Your transaction was sent to your wallet. Once it is confirmed on-chain (usually a few minutes), 
              any new covenants you deploy will automatically get the paid tier visibility.
              You can use the Terminal right now for configuration.
            </div>
            <button
              onClick={() => sessionStorage.removeItem('payment_pending_uri')}
              className="mt-3 text-xs text-amber-300 hover:text-white underline"
            >
              Dismiss
            </button>
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
          <p className="text-gray-200 text-sm">{tierBadge} Paid, Terminal access enabled</p>
        </div>
      </div>

      {/* "Already paid, no covenant yet" friendly notification */}
      {myCovenants.length === 0 && paidTier !== 'FREE' && (
        <div className="mb-8 rounded-2xl border border-[#49EACB]/40 bg-[#49EACB]/10 p-6">
          <div className="flex items-start gap-4">
            <Zap className="text-[#49EACB] mt-1" size={28} />
            <div className="flex-1">
              <div className="text-[#49EACB] font-bold text-xl">You've already unlocked {tierBadge} tier</div>
              <p className="text-gray-200 mt-2">
                Your previous payment to the treasury has been recognized. 
                You can now open the <strong>Covex Terminal</strong> to configure ZK circuits, oracles, fees, and custom UIs — 
                then deploy your first covenant whenever you're ready.
              </p>
              <button
                onClick={() => navigate('/paid-deploy')}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#49EACB] text-black font-bold hover:bg-white transition flex items-center gap-2"
              >
                Open Terminal &amp; Create Your First Covenant <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Empty state - improved, clear CTA to create */}
      {address && !fetchingCovenants && !fetchError && myCovenants.length === 0 && (
        <div className="bg-[#111] border border-white/10 rounded-2xl p-10 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#49EACB]/10 border border-[#49EACB]/20 flex items-center justify-center mb-5">
            <Layers size={32} className="text-[#49EACB]" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No covenants yet</h3>
          <p className="text-gray-200 mb-6 max-w-md mx-auto">
            You haven't deployed any covenants with this wallet on the current network. Create your first covenant below with the full paid Terminal experience.
          </p>
          <button
            onClick={() => navigate('/premium')}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#49EACB] text-black font-bold text-sm hover:shadow-[0_0_30px_rgba(73,234,203,0.4)] active:scale-[0.985] transition-all"
          >
            <Terminal size={18} />
            <span>Create Your First Covenant</span>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── SECTION A: Existing Covenants ── */}
      {address && !fetchingCovenants && myCovenants.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <Layers size={16} className="text-gray-300" />
            <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Your Existing Covenants</p>
            <span className="text-[10px] text-gray-200 ml-auto font-mono">{myCovenants.length} total</span>
          </div>
          <div className="space-y-3 mb-10">
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
                    className="px-6 py-2.5 rounded-xl bg-[#49EACB] text-black font-bold text-sm flex items-center gap-2 hover:shadow-[0_0_20px_rgba(73,234,203,0.4)] active:scale-[0.985] transition-all"
                  >
                    <Terminal size={17} /> Go to Terminal
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── SECTION B: Create New Covenant (below, visually separated) ── */}
      {address && !fetchingCovenants && (
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="pt-10">
            <div className="flex items-center gap-2 mb-1">
              <Plus size={16} className="text-gray-300" />
              <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Create New Covenant</p>
            </div>

            <div className="bg-[#0f0f0f] border border-[#49EACB]/15 rounded-2xl p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-2.5 rounded-xl bg-[#49EACB]/10 shrink-0">
                  <Terminal size={22} className="text-[#49EACB]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Launch the Full Terminal</h3>
                  <p className="text-sm text-gray-300">
                    Deploy a brand-new covenant with complete customization. Configure game types, ZK circuits, oracle keys, custom UI from Covenant Studio, fees, and auto-generate SilverScript.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="flex items-center gap-2 text-xs text-gray-300 p-2.5 rounded-lg bg-black/30">
                  <Cpu size={14} className="text-[#49EACB] shrink-0" />
                  <span>12 game types with pre-audited ZK circuits</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-300 p-2.5 rounded-lg bg-black/30">
                  <Zap size={14} className="text-[#49EACB] shrink-0" />
                  <span>Oracle + ZK proof resolution modes</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-300 p-2.5 rounded-lg bg-black/30">
                  <Palette size={14} className="text-[#49EACB] shrink-0" />
                  <span>Covenant Studio integration for custom UI</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-300 p-2.5 rounded-lg bg-black/30">
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
          </div>
        </div>
      )}
    </div>
  );
}
