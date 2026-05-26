import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X as XIcon, ArrowLeft, Box, Sparkles, CheckCircle, Loader2, RefreshCw, Star, Zap, Crown, Diamond, Trophy, Gem } from 'lucide-react';
import { useWallet } from '../components/WalletContext';

const TRUNC = (s, n = 8) => s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

const TIERS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    color: '#6B7280',
    glow: '',
    accent: 'gray',
    icon: Box,
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
      'No featured placement',
      'No custom branding',
      'No multi-game support',
    ],
    cta: 'Explore Covenants',
    ctaAction: 'explore',
  },
  {
    id: 'CREATOR',
    name: 'Creator',
    price: 100,
    color: '#3B82F6',
    glow: '',
    accent: 'blue',
    icon: Star,
    desc: 'Unlock 1 custom interactive covenant with standard visibility.',
    features: [
      'Everything in Free',
      '1 custom interactive covenant',
      'Full UI customization suite',
      'Template library (308+ games)',
      'Wallet-integrated interact buttons',
      'Shareable covenant page',
      'Standard registry listing',
    ],
    missing: [],
    badge: 'Popular',
    cta: 'Upgrade to Creator',
    ctaAction: 'pay',
  },
  {
    id: 'PRO',
    name: 'PRO',
    price: 500,
    color: '#E8AF34',
    glow: 'shadow-[0_0_30px_rgba(232,175,52,0.08)]',
    accent: 'amber',
    icon: Crown,
    desc: '1 custom interactive covenant with premium visibility and featured placement.',
    features: [
      'Everything in Creator',
      '1 custom interactive covenant',
      'Featured listings placement',
      'Higher search ranking',
      'Verified source badge',
      'Developer notes & trust tools',
      'Custom interaction buttons',
      'Priority indexer refresh',
    ],
    missing: [],
    cta: 'Upgrade to PRO',
    ctaAction: 'pay',
  },
  {
    id: 'MAX',
    name: 'MAX',
    price: 1000,
    color: '#A855F7',
    glow: 'shadow-[0_0_40px_rgba(168,85,247,0.1)]',
    accent: 'purple',
    icon: Diamond,
    desc: '1 custom interactive covenant with maximum visibility, multipurpose mode, and premium branding.',
    features: [
      'Everything in PRO',
      '1 custom interactive covenant',
      'Multipurpose mode (multiple games per covenant)',
      'Top Explorer placement',
      'Premium branding options',
      'Custom CSS injection',
      'Logo & custom domain support',
      'Dedicated indexer priority',
      'Divine Mode terminal enhancements',
    ],
    missing: [],
    badge: 'Best Value',
    cta: 'Upgrade to MAX',
    ctaAction: 'pay',
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const { address } = useWallet();
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

  const handleCheckout = () => {
    setIsProcessing(true);
    if (!address) {
      const treasury = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
      const cleanTreasury = treasury.replace('kaspatest:', '');
      window.open(`kaspatest:${cleanTreasury}?amount=${selectedTier.price}`, '_blank');
    }
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
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 animate-in fade-in duration-300">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#49EACB]/[0.06] border border-[#49EACB]/20 mb-2">
            <Sparkles size={14} className="text-[#49EACB]" />
            <span className="text-xs font-semibold text-[#49EACB] tracking-wider uppercase">COVEX COVENANT PLATFORM</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
            Deploy Interactive Covenants on the Kaspa BlockDAG
          </h1>
          <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            One-time payment. Permanent deployment. Your covenant gets a full interactive UI, game templates, and visibility tools.
            No subscriptions. No recurring fees.
          </p>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const isPremium = tier.id !== 'FREE';
            const isMax = tier.id === 'MAX';
            return (
              <div
                key={tier.id}
                className={`relative bg-[#0a0a0a]/95 backdrop-blur-xl border rounded-2xl p-8 flex flex-col transition-all duration-300 group ${
                  isMax
                    ? 'border-purple-500/30 shadow-[0_0_40px_rgba(168,85,247,0.1)] hover:border-purple-400/50 hover:shadow-[0_0_60px_rgba(168,85,247,0.15)]'
                    : tier.id === 'PRO'
                    ? 'border-amber-500/20 shadow-[0_0_30px_rgba(232,175,52,0.06)] hover:border-amber-400/40 hover:shadow-[0_0_50px_rgba(232,175,52,0.1)]'
                    : 'border-[#1f1f1f] hover:border-[#49EACB]/30'
                }`}
              >
                {/* Top accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                  style={{ background: `linear-gradient(90deg, ${tier.color}80, ${tier.color}40, transparent)` }}
                />

                {/* Badge */}
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                    style={{
                      backgroundColor: tier.color + '20',
                      color: tier.color,
                      borderColor: tier.color + '40',
                    }}
                  >
                    {tier.badge}
                  </div>
                )}

                {/* Header */}
                <div className="text-center mb-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: tier.color + '15',
                      border: `1px solid ${tier.color}30`,
                    }}
                  >
                    <Icon size={24} style={{ color: tier.color }} />
                  </div>
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{tier.desc}</p>
                </div>

                {/* Price */}
                <div className="text-center mb-8">
                  {tier.price === 0 ? (
                    <>
                      <span className="text-4xl font-black text-white">Free</span>
                      <p className="text-xs text-gray-500 mt-1">forever</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-black" style={{ color: tier.color }}>{tier.price.toLocaleString()}</span>
                        <span className="text-sm font-semibold" style={{ color: tier.color }}>KAS</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">one-time</p>
                    </>
                  )}
                </div>

                {/* Features */}
                <div className="space-y-3 flex-1">
                  {tier.features.map((feature, i) => (
                    <div key={i} className="flex gap-3 text-sm text-gray-300">
                      <Check size={16} className="shrink-0 mt-0.5" style={{ color: tier.color }} />
                      <span>{feature}</span>
                    </div>
                  ))}
                  {tier.missing.map((feature, i) => (
                    <div key={i} className="flex gap-3 text-sm text-gray-600">
                      <XIcon size={16} className="shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => tier.ctaAction === 'pay' ? handleSelectTier(tier) : navigate('/')}
                  className="w-full mt-8 px-6 py-3 font-bold rounded-xl transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none text-sm"
                  style={{
                    backgroundColor: isPremium ? tier.color : '#49EACB',
                    color: isPremium ? '#000' : '#000',
                    boxShadow: isPremium ? `0 0 20px ${tier.color}30` : '0 0 10px rgba(73,234,203,0.25)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = isPremium ? `0 0 35px ${tier.color}50` : '0 0 25px rgba(73,234,203,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = isPremium ? `0 0 20px ${tier.color}30` : '0 0 10px rgba(73,234,203,0.25)';
                  }}
                >
                  {tier.cta === 'explore' ? (
                    <><Sparkles size={16} /> {tier.cta}</>
                  ) : (
                    <><Zap size={16} /> {tier.cta}</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="text-center mt-12 space-y-3">
          <p className="text-xs text-gray-600 max-w-2xl mx-auto leading-relaxed">
            All paid tiers include <span className="text-gray-400 font-semibold">1 custom interactive covenant</span> with full UI customization through the Covex Terminal.
            Each tier stacks on the one below it. MAX tier adds <span className="text-purple-400 font-semibold">multipurpose mode</span> — attach multiple game templates to a single covenant.
          </p>
          <p className="text-[11px] text-gray-600">
            One-time payment. No subscriptions. Treasury: <code className="text-gray-500">kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m</code>
          </p>
        </div>
      </div>
    );
  }

  // ─── VIEW: 2. SELECT COVENANT ────────────────────────
  if (step === 'select') {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-16 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button onClick={reset} className="flex items-center gap-2 text-gray-400 hover:text-[#49EACB] mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Pricing
        </button>
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Select a Covenant</h2>
            <p className="text-gray-400 text-sm">
              Choose which deployed covenant you are upgrading to <span className="font-semibold" style={{ color: selectedTier?.color }}>{selectedTier?.name}</span>.
            </p>
          </div>

          {!address && (
            <div className="p-6 rounded-xl bg-amber-500/[0.04] border border-amber-500/20 text-center mb-4">
              <p className="text-sm text-amber-400 font-semibold mb-1">Wallet Not Connected</p>
              <p className="text-xs text-gray-500">Connect your Kaspa wallet to see your deployed covenants.</p>
            </div>
          )}

          {fetchingCovenants && (
            <div className="flex flex-col items-center py-8 text-gray-500 gap-2">
              <Loader2 size={24} className="animate-spin text-[#49EACB]" />
              <p className="text-sm">Loading your covenants…</p>
            </div>
          )}

          {fetchError && !fetchingCovenants && (
            <div className="p-6 rounded-xl bg-red-500/[0.04] border border-red-500/20 text-center mb-4">
              <p className="text-sm text-red-400 mb-2">{fetchError}</p>
              <button onClick={fetchMyCovenants} className="inline-flex items-center gap-1 text-xs text-[#49EACB] hover:underline">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {!fetchingCovenants && !fetchError && myCovenants.length > 0 && (
            <div className="space-y-3">
              {myCovenants.map(cov => (
                <button
                  key={cov.tx_id}
                  onClick={() => { setSelectedCovenant(cov); setStep('pay'); }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] transition-all group text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-[#1a1a1a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB]">
                      <Box size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{cov.name || cov.covenant_type || 'Unnamed Covenant'}</h4>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{TRUNC(cov.tx_id)}</p>
                      {cov.verified_tier && cov.verified_tier !== 'FREE' && (
                        <span className="mt-1 inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB]">
                          Current: {cov.verified_tier}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-[#49EACB] opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
                </button>
              ))}
            </div>
          )}

          {!fetchingCovenants && !fetchError && address && myCovenants.length === 0 && (
            <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center">
              <p className="text-sm text-gray-400 mb-3">No deployed covenants found for this wallet.</p>
              <button
                onClick={() => navigate('/deploy')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#49EACB] text-black font-bold text-xs"
              >
                Deploy a Covenant
              </button>
            </div>
          )}

          {/* NEW: Redirect to Terminal after upgrade */}
          <div className="mt-6 p-4 rounded-xl bg-[#49EACB]/[0.03] border border-[#49EACB]/10 text-center">
            <p className="text-xs text-gray-400">After payment confirmation, you will be directed to the <span className="text-[#49EACB] font-semibold">Covex Terminal</span> to configure your covenant's interactive UI and game templates.</p>
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
        <button onClick={() => setStep('select')} className="flex items-center gap-2 text-gray-400 hover:text-[#49EACB] mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Selection
        </button>
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 shadow-2xl text-center">
          <h2 className="text-xl font-bold text-white mb-6">Complete Upgrade</h2>

          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 mb-8 text-left">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Target Covenant</p>
            <p className="text-white font-medium">{selectedCovenant?.name || selectedCovenant?.covenant_type || 'Unnamed Covenant'}</p>
            <p className="text-[10px] text-gray-600 font-mono mt-0.5">{TRUNC(selectedCovenant?.tx_id)}</p>
            <div className="border-t border-[#1f1f1f] my-3"></div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">{selectedTier?.name} Tier Upgrade</p>
              <p className="text-lg font-bold" style={{ color: selectedTier?.color }}>{selectedTier?.price.toLocaleString()} KAS</p>
            </div>
            <p className="text-[10px] text-gray-600 mt-2 text-center">
              Send exactly {selectedTier?.price.toLocaleString()} KAS to Covex Treasury
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCheckout}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-4 font-bold rounded-xl transition-all disabled:opacity-70"
              style={{
                backgroundColor: selectedTier?.color,
                color: '#000',
                boxShadow: `0 0 20px ${selectedTier?.color}30`,
              }}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Awaiting Transaction...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trophy size={20} />
                  Pay {selectedTier?.price.toLocaleString()} KAS
                </span>
              )}
            </button>
            <button
              disabled={isProcessing}
              onClick={() => {
                const cleanTreasury = treasury.replace('kaspatest:', '');
                window.open(`kaspatest:${cleanTreasury}?amount=${selectedTier?.price}`, '_blank');
              }}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#111111] border border-[#1f1f1f] hover:border-white/20 text-white font-medium rounded-xl transition-all"
            >
              <Gem size={20} className="text-gray-400" /> Open in External Wallet
            </button>
          </div>

          <p className="text-[10px] text-gray-600 mt-4 text-center">
            The Covex payment verifier will auto-detect your payment (requires 6 confirmations).
            Treasury: {treasury.slice(0, 20)}...
          </p>
        </div>
      </div>
    );
  }

  // ─── VIEW: 4. SUCCESS ───────────────────────────────
  if (step === 'success') {
    return (
      <div className="relative z-10 max-w-md mx-auto px-6 py-16 animate-in zoom-in-95 duration-500">
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border rounded-2xl p-10 shadow-2xl text-center"
          style={{ borderColor: selectedTier?.color + '40' }}>
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6"
            style={{ backgroundColor: selectedTier?.color + '15' }}>
            <CheckCircle size={40} style={{ color: selectedTier?.color }} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Upgrade Initiated</h2>
          <p className="text-gray-400 text-sm mb-8">
            Payment sent for <span className="text-white font-medium">{selectedCovenant?.name || 'covenant'}</span> to <span className="font-semibold" style={{ color: selectedTier?.color }}>{selectedTier?.name}</span> tier.
          </p>
          <p className="text-[10px] text-gray-600 mb-6">
            The payment verifier will auto-confirm after 6 confirmations on the Kaspa BlockDAG.
          </p>

          {/* NEW: Direct to Terminal */}
          <div className="p-4 rounded-xl bg-[#49EACB]/[0.04] border border-[#49EACB]/20 mb-6 text-sm text-gray-300">
            <p className="mb-1"><span className="text-[#49EACB] font-semibold">Next step:</span> Configure your covenant in the Covex Terminal.</p>
            <p className="text-xs text-gray-500">Paste your custom UI code, select game templates, and deploy your interactive covenant page.</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                if (selectedCovenant?.tx_id) {
                  navigate(`/covenant/${encodeURIComponent(selectedCovenant.tx_id)}`);
                } else {
                  navigate('/');
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-4 font-bold rounded-xl shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all"
              style={{
                backgroundColor: '#49EACB',
                color: '#000',
              }}
            >
              <Sparkles size={20} /> Open in Covex Terminal
            </button>
            <button
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#111111] border border-[#1f1f1f] hover:border-white/20 text-gray-400 text-sm rounded-xl transition-all"
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
