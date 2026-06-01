import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { Terminal, Layers, Sparkles, Plus, Cpu, Zap, Palette, Code, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

const TRUNC = (s, n = 8) => s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

export default function PaidBuilder() {
  const navigate = useNavigate();
  const { address, DevConnectPanel } = useWallet();
  const paidTier = localStorage.getItem('covex_paid_tier') || 'BUILDER';

  const [myCovenants, setMyCovenants] = useState([]);
  const [fetchingCovenants, setFetchingCovenants] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [justPaid, setJustPaid] = useState(null);

  const tierAccent = { BUILDER: '#3B82F6', PRO: '#E8AF34', MAX: '#A855F7' }[paidTier] || '#49EACB';
  const tierBadge = { BUILDER: 'BUILDER', PRO: 'PRO', MAX: 'MAX' }[paidTier] || 'PAID';

  useEffect(() => {
    const raw = sessionStorage.getItem('payment_just_confirmed');
    if (raw) {
      try { setJustPaid(JSON.parse(raw)); sessionStorage.removeItem('payment_just_confirmed'); } catch (_) {}
    }
  }, []);

  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    if (!tier || tier === 'FREE') navigate('/pricing', { replace: true });
  }, [navigate]);

  const fetchMyCovenants = useCallback(() => {
    if (!address) return;
    setFetchingCovenants(true); setFetchError(null);
    fetch(`/api/covenants?creator=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { setMyCovenants(Array.isArray(d.covenants) ? d.covenants : []); setFetchingCovenants(false); })
      .catch(err => { setFetchError(err.message); setFetchingCovenants(false); });
  }, [address]);

  useEffect(() => { if (address) fetchMyCovenants(); }, [address, fetchMyCovenants]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/paid-status?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.highest_tier) {
          const current = localStorage.getItem('covex_paid_tier');
          const tierOrder = { FREE: 0, BUILDER: 1, PRO: 2, MAX: 3 };
          if (!current || (tierOrder[data.highest_tier] || 0) > (tierOrder[current] || 0)) {
            localStorage.setItem('covex_paid_tier', data.highest_tier);
          }
        }
      }).catch(() => {});
  }, [address]);

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-12">
      {/* Persistent paid-area indicator */}
      <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono font-bold tracking-wide"
        style={{ background: tierAccent + '15', border: `1px solid ${tierAccent}30`, color: tierAccent }}>
        <ShieldCheck size={14} /><span>PAID AREA</span><span className="opacity-50">|</span><span>{tierBadge}</span><span className="opacity-50">|</span><span>Terminal Unlocked</span>
      </div>

      {/* Payment success banner */}
      {justPaid && (
        <Card className="mb-8 border-emerald-500/40 bg-emerald-500/[0.04]">
          <CardContent className="p-6 flex items-start gap-4">
            <Sparkles className="text-emerald-400 mt-1 shrink-0" size={28} />
            <div>
              <div className="text-emerald-400 font-bold text-xl">Payment Confirmed</div>
              <div className="text-gray-200 mt-1 text-sm">You now have <span className="font-semibold text-white">{justPaid.tier}</span> access. Click <strong>Go to Terminal</strong> for the full tools.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment pending banner */}
      {sessionStorage.getItem('payment_pending_uri') && !justPaid && (
        <Card className="mb-8 border-amber-500/40 bg-amber-500/[0.04]">
          <CardContent className="p-6 flex items-start gap-4">
            <Loader2 className="text-amber-400 mt-1 animate-spin shrink-0" size={28} />
            <div className="flex-1">
              <div className="text-amber-400 font-bold text-xl">Payment Broadcast</div>
              <div className="text-gray-200 mt-1 text-sm">Your transaction was sent. Once confirmed on-chain, new covenants will get paid tier visibility.</div>
              <Button variant="ghost" size="sm" onClick={() => sessionStorage.removeItem('payment_pending_uri')} className="mt-3">Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: tierAccent + '20', border: `1px solid ${tierAccent}40` }}>
          <Sparkles size={24} style={{ color: tierAccent }} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Your Covenants</h1>
          <p className="text-gray-200 text-sm">{tierBadge} Paid, Terminal access enabled</p>
        </div>
      </div>

      {/* Already paid, no covenant yet */}
      {myCovenants.length === 0 && paidTier !== 'FREE' && (
        <Card className="mb-8 border-kaspa-green/40 bg-kaspa-green/[0.04]">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Zap className="text-kaspa-green mt-1 shrink-0" size={28} />
              <div className="flex-1">
                <div className="text-kaspa-green font-bold text-xl">You've already unlocked {tierBadge} tier</div>
                <p className="text-gray-200 mt-2 text-sm">Your previous payment has been recognized. Open the <strong>Covex Terminal</strong> to configure ZK circuits, oracles, fees, and custom UIs, then deploy your first covenant.</p>
                <Button onClick={() => navigate('/premium')} className="mt-4">
                  Open Terminal, Create First Covenant <ChevronRight size={18} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connect prompt */}
      {!address && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-300 mb-4">Connect your wallet to see the covenants you have deployed.</p>
            <DevConnectPanel compact />
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {address && fetchingCovenants && (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-kaspa-green" size={32} /></div>
      )}

      {/* Error */}
      {address && !fetchingCovenants && fetchError && (
        <Card className="border-red-500/20 bg-red-500/[0.04]">
          <CardContent className="p-6 text-center">
            <p className="text-red-400">Failed to load covenants: {fetchError}</p>
            <Button variant="ghost" onClick={fetchMyCovenants} className="mt-3">Try again</Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {address && !fetchingCovenants && !fetchError && myCovenants.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-kaspa-green/10 border border-kaspa-green/20 flex items-center justify-center mb-5">
              <Layers size={32} className="text-kaspa-green" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No covenants yet</h3>
            <p className="text-gray-200 mb-6 max-w-md mx-auto text-sm">You haven't deployed any covenants with this wallet. Create your first covenant with the full paid Terminal experience.</p>
            <Button onClick={() => navigate('/premium')} size="lg">
              <Terminal size={18} />Create Your First Covenant<ChevronRight size={18} />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ SECTION A: Existing Covenants ═══ */}
      {address && !fetchingCovenants && myCovenants.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={14} className="text-gray-300" />
            <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Your Existing Covenants</p>
            <span className="text-[10px] text-gray-200 ml-auto font-mono">{myCovenants.length} total</span>
          </div>
          <div className="space-y-3 mb-10">
            {myCovenants.map((cov) => (
              <Card key={cov.tx_id} className="hover:border-white/10 transition-colors">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-base text-white truncate">{cov.name || cov.covenant_type || 'Unnamed Covenant'}</div>
                    <div className="text-xs text-gray-300 font-mono mt-1">{TRUNC(cov.tx_id)}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/covenant/${encodeURIComponent(cov.tx_id)}`)}>View</Button>
                    <Button size="sm" onClick={() => navigate(`/covenant/${encodeURIComponent(cov.tx_id)}?tab=terminal`)}>
                      <Terminal size={14} />Terminal
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ═══ SECTION B: Create New Covenant ═══ */}
      {address && !fetchingCovenants && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent mb-10" />
          <div className="flex items-center gap-2 mb-3">
            <Plus size={14} className="text-gray-300" />
            <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Create New Covenant</p>
          </div>

          <Card className="border-kaspa-green/15">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-2.5 rounded-xl bg-kaspa-green/10 shrink-0">
                  <Terminal size={22} className="text-kaspa-green" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Launch the Full Terminal</h3>
                  <p className="text-sm text-gray-300">Deploy a brand-new covenant with complete customization: game types, ZK circuits, oracles, fees, and auto-generated SilverScript.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
                {[
                  { icon: Cpu, text: '12 game types with ZK circuit configurations' },
                  { icon: Zap, text: 'Oracle + ZK proof resolution modes' },
                  { icon: Palette, text: 'Covenant Studio custom UI integration' },
                  { icon: Code, text: 'Auto-generated SilverScript + deploy' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-300 p-2.5 rounded-lg bg-black/20">
                    <item.icon size={14} className="text-kaspa-green shrink-0" />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              <Button onClick={() => navigate('/premium')} className="w-full py-4 text-base">
                <Terminal size={20} />Open Full Terminal, Create New Covenant
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
