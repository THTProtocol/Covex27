import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X as XIcon, Loader2, RefreshCw, Key } from 'lucide-react';
import { useWallet } from '../components/WalletContext';

const TRUNC = (s, n = 8) => s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

const TIERS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    desc: 'Browse and discover covenants on the Kaspa BlockDAG.',
    features: [
      'Browse all indexed covenants',
      'Public read-only contract view',
      'Script display and parameters',
      'On-chain status verification',
      'Search and filter capabilities',
    ],
    missing: [
      'No custom interactive UI',
      'No Terminal access',
      'No featured placement',
    ],
    cta: 'Explore Covenants',
    ctaAction: 'explore',
    accent: '#6B7280',
  },
  {
    id: 'CREATOR',
    name: 'Creator',
    price: 100,
    desc: '1 custom interactive covenant with full Terminal and UI tools.',
    features: [
      'Terminal access for UI deployment',
      'Full UI customization via Terminal',
      'Shareable covenant page',
      'Standard Explorer listing',
    ],
    missing: [],
    cta: 'Upgrade to Creator',
    ctaAction: 'pay',
    accent: '#3B82F6',
  },
  {
    id: 'PRO',
    name: 'PRO',
    price: 500,
    desc: 'Greater Explorer visibility and featured placement for your covenant.',
    features: [
      'Full Terminal and UI deployment',
      'All Creator features included',
      'Featured placement on Explorer',
      'Above Creator in rankings',
    ],
    missing: [],
    cta: 'Upgrade to PRO',
    ctaAction: 'pay',
    accent: '#E8AF34',
  },
  {
    id: 'MAX',
    name: 'MAX',
    price: 1000,
    desc: 'Best Explorer visibility with top placement and TVL-weighted ranking.',
    features: [
      'Full Terminal and UI deployment',
      'All PRO features included',
      'Top Explorer placement',
      'TVL-weighted ranking boost',
    ],
    missing: [],
    cta: 'Upgrade to MAX',
    ctaAction: 'pay',
    accent: '#A855F7',
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const { address, DevConnectPanel } = useWallet();
  const [step, setStep] = useState('pricing');
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedCovenant, setSelectedCovenant] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [myCovenants, setMyCovenants] = useState([]);
  const [fetchingCovenants, setFetchingCovenants] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchMyCovenants = () => {
    if (!address) {
      setFetchError('Connect your wallet first to see your deployed covenants.');
      return;
    }
    setFetchingCovenants(true);
    setFetchError(null);
    fetch(`/api/covenants?creator=${encodeURIComponent(address)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        const list = Array.isArray(d.covenants) ? d.covenants : [];
        setMyCovenants(list);
        if (list.length === 0) {
          setFetchError('No deployed covenants found for this wallet. Deploy a covenant first on the Deploy page, then return here to upgrade.');
        }
        setFetchingCovenants(false);
      })
      .catch(err => {
        setFetchError(`Could not load covenants: ${err.message}`);
        setFetchingCovenants(false);
      });
  };

  const handleSelectTier = (tier) => {
    setSelectedTier(tier);
    setStep('select');
    fetchMyCovenants();
  };

  // Re-fetch covenants when wallet connects (dev panel or browser extension)
  // This runs inside the 'select' step only
  useEffect(() => {
    if (step === 'select' && address) {
      fetchMyCovenants();
    }
  }, [address, step]);

  const handleCheckout = () => {
    setIsProcessing(true);

    // Store the paid tier in localStorage so Terminal gate opens
    if (selectedTier && selectedTier.id !== 'FREE') {
      localStorage.setItem('covex_paid_tier', selectedTier.id);
    }

    const treasury = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
    const cleanTreasury = treasury.replace('kaspatest:', '');
    window.open(`kaspatest:${cleanTreasury}?amount=${selectedTier.price}`, '_blank');

    setTimeout(() => {
      setIsProcessing(false);
      setStep('success');
    }, 2000);
  };

  const reset = () => {
    setStep('pricing');
    setSelectedTier(null);
    setSelectedCovenant(null);
    setMyCovenants([]);
    setFetchError(null);
  };

  // ─── VIEW: 1. PRICING GRID ──────────────────────────
  if (step === 'pricing') {
    return (
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 animate-in fade-in duration-300">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Deploy Interactive Covenants
          </h1>
          <p className="text-sm md:text-base text-gray-200 leading-relaxed">
            One-time payment. Your covenant gets permanent interactive UI deployment through the Covex Terminal
            and visibility on the Explorer. No subscriptions. No recurring fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIERS.map((tier) => {
            const isPaid = tier.id !== 'FREE';
            const isFree = tier.id === 'FREE';
            return (
              <div
                key={tier.id}
                className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border rounded-2xl p-7 flex flex-col transition-all duration-300 hover:scale-[1.02]"
                style={{
                  borderColor: isPaid ? tier.accent + '40' : 'rgba(255,255,255,0.08)',
                  boxShadow: isPaid ? `0 0 30px ${tier.accent}08` : 'none',
                }}
              >
                {/* Top accent line */}
                {isPaid && (
                  <div className="absolute top-0 left-4 right-4 h-px rounded-full opacity-60"
                    style={{ background: `linear-gradient(90deg, transparent, ${tier.accent}, transparent)` }} />
                )}

                <div className="mb-5">
                  <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                  <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">{tier.desc}</p>
                </div>

                <div className="mb-5">
                  {tier.price === 0 ? (
                    <span className="text-3xl font-black text-white">Free</span>
                  ) : (
                    <span className="text-3xl font-black" style={{ color: tier.accent }}>
                      {tier.price.toLocaleString()} KAS
                    </span>
                  )}
                  <p className="text-[11px] text-gray-300 mt-1">one-time payment</p>
                </div>

                <div className="space-y-2.5 flex-1">
                  {tier.features.map((feature, i) => (
                    <div key={i} className="flex gap-2.5 text-xs text-gray-300">
                      <Check size={14} className="shrink-0 mt-0.5" style={{ color: tier.accent }} />
                      <span>{feature}</span>
                    </div>
                  ))}
                  {tier.missing && tier.missing.map((feature, i) => (
                    <div key={i} className="flex gap-2.5 text-xs text-gray-300 opacity-60">
                      <XIcon size={14} className="shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => tier.ctaAction === 'pay' ? handleSelectTier(tier) : navigate('/')}
                  className="w-full mt-6 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 border-none"
                  style={{
                    backgroundColor: isFree ? 'rgba(255,255,255,0.06)' : '#49EACB',
                    color: isFree ? '#fff' : '#000',
                  }}
                  onMouseEnter={e => {
                    if (isPaid) e.currentTarget.style.boxShadow = '0 0 30px rgba(73,234,203,0.4)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  {tier.cta}
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10 space-y-2">
          <p className="text-xs text-gray-200 max-w-xl mx-auto">
            All paid tiers include access to the same Covex Terminal for deploying custom interactive UIs.
            The only difference between Creator, PRO, and MAX is your covenant's visibility ranking on the Explorer.
            Higher tier = better placement.
          </p>
          <p className="text-[11px] text-gray-200">
            Treasury: <code className="text-gray-300">kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m</code>
          </p>
        </div>
      </div>
    );
  }

  // ─── VIEW: 2. SELECT COVENANT ────────────────────────
  if (step === 'select') {
    return (
      <div className="relative z-10 max-w-xl mx-auto px-6 py-16 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button onClick={reset} className="flex items-center gap-2 text-gray-200 hover:text-[#49EACB] mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Pricing
        </button>
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-2">Select a Covenant</h2>
            <p className="text-gray-200 text-sm">
              Choose which deployed covenant to upgrade to <span className="text-[#49EACB] font-semibold">{selectedTier?.name}</span>.
            </p>
          </div>

          {!address && (
            <div className="space-y-4 mb-4">
              <div className="p-4 rounded-lg bg-amber-500/[0.04] border border-amber-500/20 text-center">
                <p className="text-sm text-amber-400 font-semibold mb-1">Wallet Not Connected</p>
                <p className="text-xs text-gray-300">Connect your wallet to see your deployed covenants.</p>
              </div>
              <DevConnectPanel compact />
            </div>
          )}

          {fetchingCovenants && (
            <div className="flex flex-col items-center py-10 text-gray-300 gap-2">
              <Loader2 size={24} className="animate-spin text-[#49EACB]" />
              <p className="text-sm">Loading your covenants…</p>
            </div>
          )}

          {fetchError && !fetchingCovenants && (
            <div className="p-5 rounded-lg bg-red-500/[0.04] border border-red-500/20 text-center mb-4">
              <p className="text-sm text-red-400 mb-2">{fetchError}</p>
              <button onClick={fetchMyCovenants} className="inline-flex items-center gap-1 text-xs text-[#49EACB] hover:underline">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {!fetchingCovenants && !fetchError && myCovenants.length > 0 && (
            <div className="space-y-2.5">
              {myCovenants.map(cov => (
                <button
                  key={cov.tx_id}
                  onClick={() => { setSelectedCovenant(cov); setStep('pay'); }}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB]/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-[#1a1a1a] flex items-center justify-center text-gray-300 shrink-0">
                      <span className="text-xs font-bold">C</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-white text-sm font-medium truncate">{cov.name || cov.covenant_type || 'Unnamed Covenant'}</h4>
                      <p className="text-[10px] text-gray-300 font-mono truncate">{TRUNC(cov.tx_id)}</p>
                      {cov.verified_tier && cov.verified_tier !== 'FREE' && (
                        <span className="mt-0.5 inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded-full bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB]">
                          Current: {cov.verified_tier}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-[#49EACB] shrink-0">Select</span>
                </button>
              ))}
            </div>
          )}

          {!fetchingCovenants && !fetchError && address && myCovenants.length === 0 && (
            <div className="p-5 rounded-lg bg-white/[0.02] border border-white/5 text-center">
              <p className="text-sm text-gray-200 mb-3">No deployed covenants found for this wallet.</p>
              <button
                onClick={() => navigate('/deploy')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#49EACB] text-black font-bold text-xs"
              >
                Deploy a Covenant
              </button>
            </div>
          )}

          <div className="mt-5 p-4 rounded-lg bg-[#49EACB]/[0.03] border border-[#49EACB]/10 text-center">
            <p className="text-xs text-gray-200">
              After confirmation, open your covenant detail page and navigate to the <span className="text-[#49EACB] font-semibold">Terminal</span> tab
              to paste and deploy your custom interactive UI code.
            </p>
          </div>

          {/* ── Deploy New Covenant Button ── */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <p className="text-[10px] text-gray-300 text-center mb-3">
              Don't have a covenant yet? Deploy one first, then return here to upgrade.
            </p>
            <button
              onClick={() => {
                // If a paid tier was already selected, go to /deploy first
                // After deploy, the auto-redirect lands on Terminal tab
                navigate('/deploy');
              }}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl
                bg-kaspa-green/10 border-2 border-dashed border-kaspa-green/30
                text-kaspa-green text-sm font-bold
                hover:bg-kaspa-green/15 hover:border-kaspa-green/50
                hover:shadow-[0_0_20px_rgba(73,234,203,0.15)]
                active:scale-[0.98] transition-all duration-200"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Deploy New Covenant
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── VIEW: 3. PAYMENT ───────────────────────────────
  if (step === 'pay') {
    const treasury = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
    return (
      <div className="relative z-10 max-w-md mx-auto px-6 py-16 animate-in fade-in slide-in-from-right-8 duration-300">
        <button onClick={() => setStep('select')} className="flex items-center gap-2 text-gray-200 hover:text-[#49EACB] mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Selection
        </button>
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-6">Complete Upgrade</h2>

          <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-4 mb-6 text-left">
            <p className="text-[11px] text-gray-300 uppercase tracking-wider mb-2">Target Covenant</p>
            <p className="text-white text-sm font-medium truncate">{selectedCovenant?.name || selectedCovenant?.covenant_type || 'Unnamed Covenant'}</p>
            <p className="text-[10px] text-gray-200 font-mono mt-0.5">{TRUNC(selectedCovenant?.tx_id)}</p>
            <div className="border-t border-[#1f1f1f] my-3"></div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-200">{selectedTier?.name} Tier</p>
              <p className="text-base font-bold text-[#49EACB]">{selectedTier?.price.toLocaleString()} KAS</p>
            </div>
            <p className="text-[10px] text-gray-200 mt-2 text-center">
              Send exactly {selectedTier?.price.toLocaleString()} KAS to Covex Treasury
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCheckout}
              disabled={isProcessing}
              className="w-full py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-lg transition-all disabled:opacity-70"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                `Pay ${selectedTier?.price.toLocaleString()} KAS`
              )}
            </button>
            <button
              disabled={isProcessing}
              onClick={() => {
                const cleanTreasury = treasury.replace('kaspatest:', '');
                window.open(`kaspatest:${cleanTreasury}?amount=${selectedTier?.price}`, '_blank');
              }}
              className="w-full py-3 bg-[#111111] border border-[#1f1f1f] hover:border-white/20 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Open in External Wallet
            </button>
          </div>

          <p className="text-[10px] text-gray-200 mt-4">
            Payment auto-detected after 6 DAA confirmations.
          </p>
        </div>
      </div>
    );
  }

  // ─── VIEW: 4. SUCCESS ───────────────────────────────
  if (step === 'success') {
    const hasExistingCovenant = !!(selectedCovenant?.tx_id);
    return (
      <div className="relative z-10 max-w-md mx-auto px-6 py-16 animate-in zoom-in-95 duration-500">
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-xl p-10 text-center">
          <div className="w-16 h-16 mx-auto bg-[#49EACB]/10 rounded-full flex items-center justify-center mb-5">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {hasExistingCovenant ? 'Upgrade Confirmed' : 'Payment Complete — Deploy Your Covenant'}
          </h2>
          <p className="text-gray-200 text-sm mb-8">
            {hasExistingCovenant
              ? <>Payment for <span className="text-white font-medium">{selectedCovenant?.name || 'covenant'}</span> to <span className="text-[#49EACB] font-semibold"> {selectedTier?.name}</span> tier.</>
              : <><span className="text-[#49EACB] font-semibold"> {selectedTier?.name}</span> tier activated. Deploy your first covenant to access the Terminal.</>
            }
          </p>
          <p className="text-[11px] text-gray-200 mb-6">
            Confirmed automatically after 6 DAA confirmations.
          </p>

          <div className="p-4 rounded-lg bg-[#49EACB]/[0.03] border border-[#49EACB]/10 mb-6">
            <p className="text-xs text-gray-300">
              {hasExistingCovenant
                ? <><span className="text-kaspa-green font-semibold">Next:</span> You will be redirected to the <span className="text-kaspa-green font-semibold">Terminal</span> tab where you can configure your ZK circuit, paste code from Covenant Studio, and deploy your interactive UI.</>
                : <><span className="text-kaspa-green font-semibold">Next:</span> Deploy a new covenant with your paid tier. After deployment, you will be automatically redirected to the <span className="text-kaspa-green font-semibold">Terminal</span> to build and customize your interactive UI.</>
              }
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                if (hasExistingCovenant) {
                  navigate(`/covenant/${encodeURIComponent(selectedCovenant.tx_id)}?tab=terminal`);
                } else {
                  // No covenant selected — deploy one. Deploy page auto-redirects to Terminal tab after success.
                  navigate('/deploy');
                }
              }}
              className="w-full py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-lg transition-colors hover:shadow-[0_0_25px_rgba(73,234,203,0.4)]"
            >
              {hasExistingCovenant ? 'Open Terminal' : 'Deploy Covenant to Terminal'}
            </button>
            <button
              onClick={reset}
              className="w-full py-3 bg-[#111111] border border-[#1f1f1f] hover:border-white/20 text-gray-200 text-sm rounded-lg transition-colors"
            >
              Upgrade Another Covenant
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Pricing;
