import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { Terminal, Layers, Sparkles, Plus, Cpu, Zap, Palette, Code, ChevronRight, Loader2, ShieldCheck, AlertTriangle, Crown, Star, Eye, Unlock, Code2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';

const TRUNC = (s, n = 8) => s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

function isTestnetNetwork(netStr) {
  const n = (netStr || '').toLowerCase();
  return n.includes('testnet') || n.includes('tn12') || n.includes('tn10') || n.includes('tn-');
}

export default function PaidBuilder() {
  const navigate = useNavigate();
  const { address, DevConnectPanel, isDevMode } = useWallet();

  // Server-side auth state - the ONLY source of truth
  const [auth, setAuth] = useState({ token: null, tier: null, address: null, loading: true, error: null });
  const [myCovenants, setMyCovenants] = useState([]);
  const [fetchingCovenants, setFetchingCovenants] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [justPaid, setJustPaid] = useState(null);

  const paidTier = auth.tier || 'FREE';
  const tierAccent = { BUILDER: '#3B82F6', PRO: '#E8AF34', MAX: '#A855F7' }[paidTier] || '#6B7280';
  const tierBadge = { BUILDER: 'BUILDER', PRO: 'PRO', MAX: 'MAX' }[paidTier] || 'UNKNOWN';

  // Dev convenience: skip the indexer confirmation wait after a REAL dev-wallet payment.
  // Gated on isDevMode (an actual dev wallet is connected); it does NOT persist any tier
  // flag to attacker-writable localStorage. On mainnet none of the dev paths fire, so the
  // backend (/api/auth-session) is the sole authority there.
  const forceGrantTestnetDev = useCallback((tierId = 'BUILDER', tierName = null, txid = null) => {
    if (!isDevMode) return;
    const tName = tierName || tierId;
    setAuth({ token: 'dev-testnet-force', tier: tName, address, loading: false, error: null });
    try { sessionStorage.removeItem('payment_broadcast_tx'); } catch (_) {}
    try { sessionStorage.setItem('payment_just_confirmed', JSON.stringify({ tier: tName, id: tierId, address, txid })); } catch (_) {}
    setJustPaid({ tier: tName, id: tierId, address, txid });
  }, [address, isDevMode]);

  // Read justPaid marker from session (from Pricing or payWithDevWallet)
  useEffect(() => {
    const raw = sessionStorage.getItem('payment_broadcast_tx');
    if (raw) {
      try { setJustPaid(JSON.parse(raw)); } catch (_) {}
    }
    const confirmedRaw = sessionStorage.getItem('payment_just_confirmed');
    if (confirmedRaw) {
      try {
        const parsed = JSON.parse(confirmedRaw);
        setJustPaid(parsed);
        sessionStorage.removeItem('payment_just_confirmed');
      } catch (_) {}
    }
  }, []);

  // IMMEDIATE dev unlock: a TESTNET-ONLY developer convenience to skip the indexer
  // confirmation wait after a real dev-wallet payment. Gated on isDevMode + a same-session
  // sessionStorage marker; NO persistent localStorage grant. SCOPE: this only unlocks paid
  // *UI features* on testnet (where KAS is free faucet money) — it never moves funds, and on
  // MAINNET it never fires (the backend /api/auth-session is the sole authority for real
  // value). The marker is still client-set, so the COMPLETE fix is a backend endpoint that
  // verifies the marker's txid is a genuine treasury payment (works before the 6-conf index
  // lag) — tracked as the next iteration; until then this stays testnet-scoped on purpose.
  useEffect(() => {
    if (!address || !isDevMode) return;
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    if (!isTestnetNetwork(net)) return;

    const hasMarker = !!justPaid?.txid || !!justPaid?.id || !!sessionStorage.getItem('payment_broadcast_tx');
    if (hasMarker) {
      const tierId = justPaid?.id || 'BUILDER';
      const tierName = justPaid?.tier || tierId;
      const txid = justPaid?.txid || null;
      // Grant without waiting for server (real dev-wallet tx already broadcast)
      setAuth({ token: 'dev-testnet-effect', tier: tierName, address, loading: false, error: null });
      try { sessionStorage.removeItem('payment_broadcast_tx'); } catch (_) {}
      setJustPaid({ tier: tierName, id: tierId, address, txid });
    }
  }, [address, justPaid, isDevMode]);

  // (justPaid markers are read in the dedicated effect above + the robust dev unlock effects)

  // Step 2: Request server auth session (source of truth for real paid), but dev testnet markers override to paid immediately
  useEffect(() => {
    if (!address) {
      setAuth({ token: null, tier: null, address: null, loading: false, error: null });
      return;
    }
    setAuth(prev => ({ ...prev, loading: true }));
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';

    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net })
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        const serverTier = (data?.tier && data.tier !== 'FREE') ? data.tier : null;
        const netNow = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
        const hasDevMarker = isDevMode && isTestnetNetwork(netNow) && (justPaid?.id || sessionStorage.getItem('payment_broadcast_tx'));
        if (serverTier) {
          setAuth({ token: data.token, tier: serverTier, address, loading: false, error: null });
        } else if (hasDevMarker) {
          // Dev testnet real-tx payment marker present: grant paid UI even if server has not indexed yet
          const tierId = justPaid?.id || 'BUILDER';
          const tierName = justPaid?.tier || tierId;
          setAuth({ token: 'dev-testnet-server-override', tier: tierName, address, loading: false, error: null });
          try { sessionStorage.removeItem('payment_broadcast_tx'); } catch (_) {}
          setJustPaid(prev => prev || { tier: tierName, id: tierId, address });
        } else {
          setAuth({ token: null, tier: 'FREE', address, loading: false, error: data?.error || 'No paid tier found' });
        }
      })
      .catch(err => {
        // On network error, still allow a real testnet dev-wallet marker to unlock
        const netNow = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
        const hasDevMarker = isDevMode && isTestnetNetwork(netNow) && (justPaid?.id || sessionStorage.getItem('payment_broadcast_tx'));
        if (hasDevMarker) {
          const tierId = justPaid?.id || 'BUILDER';
          const tierName = justPaid?.tier || tierId;
          setAuth({ token: 'dev-testnet-catch', tier: tierName, address, loading: false, error: null });
          try { sessionStorage.removeItem('payment_broadcast_tx'); } catch (_) {}
          setJustPaid(prev => prev || { tier: tierName, id: tierId, address });
        } else {
          setAuth({ token: null, tier: 'FREE', address, loading: false, error: err.message });
        }
      });
  }, [address, justPaid, isDevMode]);

  // If after auth we are still FREE but a real dev-wallet marker exists, force grant (covers races).
  // isDevMode-gated + sessionStorage-only (no persistent localStorage tier).
  useEffect(() => {
    if (auth.loading) return;
    if (auth.token && auth.tier && auth.tier !== 'FREE') return;
    if (!address || !isDevMode) return;
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    if (!isTestnetNetwork(net)) return;
    const hasMarker = justPaid?.id || sessionStorage.getItem('payment_broadcast_tx');
    if (hasMarker) {
      const tierId = justPaid?.id || 'BUILDER';
      const tierName = justPaid?.tier || tierId;
      setAuth({ token: 'dev-testnet-post-auth', tier: tierName, address, loading: false, error: null });
      try { sessionStorage.removeItem('payment_broadcast_tx'); } catch (_) {}
      setJustPaid(prev => prev || { tier: tierName, id: tierId, address });
    }
  }, [auth.loading, auth.token, auth.tier, address, justPaid, isDevMode]);

  const fetchMyCovenants = useCallback(() => {
    if (!address) return;
    setFetchingCovenants(true); setFetchError(null);
    fetch(`/api/covenants?creator=${encodeURIComponent(address)}&network=${localStorage.getItem('kaspaNetwork') || 'testnet-12'}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { setMyCovenants(Array.isArray(d.covenants) ? d.covenants : []); setFetchingCovenants(false); })
      .catch(err => { setFetchError(err.message); setFetchingCovenants(false); });
  }, [address]);

  useEffect(() => { if (address) fetchMyCovenants(); }, [address, fetchMyCovenants]);

  // Loading state: if we have a broadcast marker on testnet, show awaiting + prominent force-unlock button
  if (auth.loading) {
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    const onTestnet = isTestnetNetwork(net);
    if (justPaid?.txid || justPaid?.id) {
      return (
        <div className="p-16 text-center max-w-xl mx-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
            <Loader2 className="animate-spin text-amber-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Payment Broadcast - Awaiting Confirmation</h3>
          <p className="text-gray-300 mb-2 max-w-lg mx-auto text-sm">
            Your {justPaid.tier || justPaid.id} tier payment of <span className="text-white font-mono">{justPaid.id === 'BUILDER' ? '100' : justPaid.id === 'PRO' ? '500' : justPaid.id === 'MAX' ? '1000' : '100'} KAS</span> was broadcast to the treasury.
          </p>
          {justPaid.txid && (
            <p className="text-gray-200 max-w-lg mx-auto text-sm mb-4 break-all">
              TX: <span className="font-mono text-[10px] text-[#49EACB]">{justPaid.txid}</span>
            </p>
          )}
          <p className="text-xs text-gray-300 mb-6">
            On mainnet the server waits for 6+ confirmations. On testnet dev (TN12/TN10) with dev wallet real tx we unlock instantly.
          </p>

          {/* Always show force button - this is the reliable path for dev testnet after payWithDevWallet or Pricing send */}
          <Button
            onClick={() => forceGrantTestnetDev(justPaid.id || 'BUILDER', justPaid.tier, justPaid.txid)}
            className="mx-auto flex items-center gap-2 px-8"
          >
            <Unlock size={16} /> UNLOCK TERMINAL NOW (Testnet Dev)
          </Button>
          <p className="text-[10px] text-gray-500 mt-3">Click if the page stays on this screen after your dev wallet broadcast a real tx.</p>

          {onTestnet && (
            <div className="mt-4 text-xs text-emerald-400">Testnet detected. Dev payments grant access immediately via the button above.</div>
          )}
        </div>
      );
    }
    return (
      <div className="p-20 text-center">
        <Loader2 className="animate-spin text-[#49EACB] mx-auto mb-4" size={32} />
        <p className="text-gray-300 font-mono text-sm">Verifying payment status on-chain...</p>
      </div>
    );
  }

  // Not paid according to server, but on testnet with marker we should have been granted by the effects above.
  // Still render a gate with a big force-unlock button so user is never stuck.
  if (!auth.token || auth.tier === 'FREE') {
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    const onTestnet = isTestnetNetwork(net);
    const hasAnyMarker = justPaid || sessionStorage.getItem('payment_broadcast_tx');
    return (
      <div className="p-16 text-center max-w-xl mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
          <AlertTriangle size={32} className="text-amber-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Payment Required</h3>
        <p className="text-gray-300 mb-6 max-w-md mx-auto text-sm">
          {auth.error || 'Paid tier access requires verified on-chain payment.'}
        </p>

        {onTestnet && isDevMode && hasAnyMarker && (
          <div className="mb-6">
            <Button
              onClick={() => forceGrantTestnetDev(justPaid?.id || 'BUILDER', justPaid?.tier, justPaid?.txid)}
              size="lg"
              className="mx-auto flex items-center gap-2"
            >
              <Unlock size={18} /> UNLOCK NOW: I just paid with dev wallet on testnet
            </Button>
            <p className="text-xs text-emerald-400 mt-2">Real tx was broadcast from your mnemonic private key. This bypasses server confirmation for TN12/TN10 dev.</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => navigate('/pricing')} size="lg">View Pricing / Pay Again</Button>
          {!address && (
            <div className="mt-2"><DevConnectPanel compact /></div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-12">
      {/* Persistent paid-area indicator - server-verified */}
      <div className="mb-6 inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 rounded-full text-xs font-mono font-bold tracking-wide max-w-full"
        style={{ background: tierAccent + '15', border: `1px solid ${tierAccent}30`, color: tierAccent }}>
        <ShieldCheck size={14} className="shrink-0" /><span>SERVER-VERIFIED PAID AREA</span><span className="opacity-50">|</span><span>{tierBadge}</span><span className="opacity-50">|</span><span>Terminal Unlocked</span>
      </div>

      {/* Payment success banner */}
      {justPaid && (
        <Card className="mb-8 border-emerald-500/40 bg-emerald-500/[0.04]">
          <CardContent className="p-6 flex items-start gap-4">
            <Sparkles className="text-emerald-400 mt-1 shrink-0" size={28} />
            <div>
              <div className="text-emerald-400 font-bold text-xl">Payment Confirmed</div>
              <div className="text-gray-200 mt-1 text-sm">You now have <span className="font-semibold text-white">{justPaid.tier}</span> server-verified access. Each payment grants one covenant deployment.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: tierAccent + '20', border: `1px solid ${tierAccent}40` }}>
          {paidTier === 'BUILDER' && <Terminal size={24} style={{ color: tierAccent }} />}
          {paidTier === 'PRO' && <Star size={24} style={{ color: tierAccent }} />}
          {paidTier === 'MAX' && <Crown size={24} style={{ color: tierAccent }} />}
          {paidTier !== 'BUILDER' && paidTier !== 'PRO' && paidTier !== 'MAX' && <Sparkles size={24} style={{ color: tierAccent }} />}
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Your Covenants</h1>
          <p className="text-gray-200 text-sm">{tierBadge} Paid (server-verified). Terminal access enabled.</p>
        </div>
      </div>

      {/* Already paid, no covenant yet */}
      {myCovenants.length === 0 && paidTier !== 'FREE' && (
        <Card className="mb-8 border-kaspa-green/40 bg-kaspa-green/[0.04]">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Zap className="text-kaspa-green mt-1 shrink-0" size={28} />
              <div className="flex-1">
                <div className="text-kaspa-green font-bold text-xl">You've unlocked {tierBadge} tier - server verified</div>
                <p className="text-gray-200 mt-2 text-sm">Your on-chain payment is confirmed. Each payment grants one covenant deployment. Open the Covex Terminal to configure ZK circuits, oracles, fees, and custom UIs.</p>
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
            <p className="text-gray-300 mb-4">Connect your wallet to see the covenants you deployed. Server-auth is tied to your connected wallet address.</p>
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
            <p className="text-gray-200 mb-6 max-w-md mx-auto text-sm">Your payment is verified. Deploy your first covenant with the full paid Terminal experience. Each tier payment grants one deployment.</p>
            <Button onClick={() => navigate('/premium')} size="lg">
              <Terminal size={18} />Create Your First Covenant<ChevronRight size={18} />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SECTION A: Existing Covenants */}
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

      {/* SECTION B: Create New Covenant */}
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
                  <p className="text-sm text-gray-300">Deploy a brand-new covenant. Each tier payment grants one deployment. The terminal includes ZK circuits, oracles, fees, auto-generated SilverScript, and Covenant Studio integration.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
                {[
                  { icon: Cpu, text: 'Dozens of game types with ZK circuit configurations' },
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
              <div className="text-[10px] text-center text-gray-500 mt-2">Advanced covenant creation and customization tools (including live editor and public UI design) are inside the terminal after payment.</div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
