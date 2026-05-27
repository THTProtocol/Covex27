import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X as XIcon } from 'lucide-react';

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
    cta: 'Pay 100 KAS',
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
    cta: 'Pay 500 KAS',
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
    cta: 'Pay 1,000 KAS',
    ctaAction: 'pay',
    accent: '#A855F7',
  },
];

const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
const cleanTreasury = TREASURY.replace('kaspatest:', '');

const Pricing = () => {
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(null); // {id, name, price, accent}

  const handlePay = (tier) => {
    if (tier.id === 'FREE') {
      navigate('/');
      return;
    }

    // Open the exact payment request in the user's wallet (TN12 deep link or extension on mainnet)
    window.open(`kaspatest:${cleanTreasury}?amount=${tier.price}`, '_blank');

    // Enter "approval" stage — this is the smoother payment experience
    setAwaitingConfirmation({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      accent: tier.accent,
    });
  };

  const confirmPaymentSent = () => {
    if (!awaitingConfirmation) return;

    const { id, name } = awaitingConfirmation;

    // Mark the paid tier — this unlocks the entire paid area
    localStorage.setItem('covex_paid_tier', id);

    // Show success notification feel (we'll redirect with a flag the next page can read)
    sessionStorage.setItem('payment_just_confirmed', JSON.stringify({ tier: name, id }));

    // Clean states
    setAwaitingConfirmation(null);
    setProcessing(null);

    // Redirect to the post-payment page focused on the user's existing covenants + Terminal access
    navigate('/paid-builder');
  };

  const cancelPayment = () => {
    setAwaitingConfirmation(null);
    setProcessing(null);
  };

  // Smooth payment approval screen (this is the "approval notification" step)
  if (awaitingConfirmation) {
    const p = awaitingConfirmation;
    return (
      <div className="relative z-10 max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="mb-8">
          <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: p.accent + '15', border: `2px solid ${p.accent}30` }}>
            <ShieldCheck size={44} style={{ color: p.accent }} />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Payment Approval Required</h1>
          <p className="text-xl text-gray-300">We opened your wallet with the exact amount. After you send it, confirm below to access your covenants + Terminal.</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 mb-8 text-left max-w-xl mx-auto">
          <div className="flex justify-between py-3 border-b border-white/10">
            <span className="text-gray-300">Tier</span>
            <span className="font-bold" style={{ color: p.accent }}>{p.name}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-white/10">
            <span className="text-gray-300">Amount to send</span>
            <span className="font-mono font-bold text-white">{p.price} KAS</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-gray-300">Treasury</span>
            <span className="font-mono text-xs text-gray-400 break-all">{TREASURY}</span>
          </div>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          <button
            onClick={confirmPaymentSent}
            className="w-full py-4 rounded-2xl bg-[#49EACB] text-black font-black text-lg shadow-[0_0_30px_rgba(73,234,203,0.3)] hover:shadow-[0_0_50px_rgba(73,234,203,0.5)] transition-all active:scale-[0.985]"
          >
            I have approved &amp; sent the payment in my wallet
          </button>

          <button
            onClick={cancelPayment}
            className="w-full py-3 text-sm text-gray-400 hover:text-white transition"
          >
            Cancel — I want to choose a different tier
          </button>

          <p className="text-xs text-gray-500 pt-2">
            On mainnet this will be a simple wallet extension approval. On TN12 you approve the deep link.<br />
            After confirmation the <strong>free deploy page will be permanently disabled</strong> for you. 
            You will land on your covenants list with direct access to the full paid Terminal.
          </p>
        </div>
      </div>
    );
  }

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
          const isBusy = processing === tier.id;
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
                onClick={() => handlePay(tier)}
                disabled={isBusy}
                className="w-full mt-6 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 border-none disabled:opacity-60"
                style={{
                  backgroundColor: isFree ? 'rgba(255,255,255,0.06)' : '#49EACB',
                  color: isFree ? '#fff' : '#000',
                }}
                onMouseEnter={e => {
                  if (isPaid && !isBusy) e.currentTarget.style.boxShadow = '0 0 30px rgba(73,234,203,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                {isBusy ? 'Redirecting...' : tier.cta}
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
          Treasury: <code className="text-gray-300">{TREASURY}</code>
        </p>
        <p className="text-[10px] text-emerald-400 mt-2">After you send the exact KAS amount from your wallet, you will land on the paid-area page with the two options (existing covenant or full premium builder with terminal + guide + script writer).</p>
      </div>
    </div>
  );
};

export default Pricing;
