import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X as XIcon, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import { useWallet } from '../components/WalletContext';

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

const Pricing = () => {
  const navigate = useNavigate();
  const { address, sendPayment, connecting, DevConnectPanel } = useWallet();

  // Auto-detect previous payment from backend when wallet connects
  useEffect(() => {
    if (!address) return;

    fetch(`/api/paid-status?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.highest_tier) {
          const current = localStorage.getItem('covex_paid_tier');
          // Only upgrade, never downgrade
          const tierOrder = { FREE: 0, CREATOR: 1, PRO: 2, MAX: 3 };
          if (!current || (tierOrder[data.highest_tier] || 0) > (tierOrder[current] || 0)) {
            localStorage.setItem('covex_paid_tier', data.highest_tier);
          }
        }
      })
      .catch(() => {});
  }, [address]);
  const [processing, setProcessing] = useState(null);           // tier id being processed
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(null); // {id, name, price, accent}
  const [paymentStatus, setPaymentStatus] = useState(null);     // 'sending' | 'success' | 'error' + message
  const [payingTier, setPayingTier] = useState(null);           // {id, name, price, accent}

  const handlePay = useCallback((tier) => {
    if (tier.id === 'FREE') {
      navigate('/');
      return;
    }

    setPaymentStatus(null);

    // If wallet is connected, go straight to confirmation screen
    if (address) {
      setPayingTier({ id: tier.id, name: tier.name, price: tier.price, accent: tier.accent });
      setAwaitingConfirmation({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        accent: tier.accent,
      });
      return;
    }

    // No wallet connected, show connect prompt first, then go to confirmation
    setPayingTier({ id: tier.id, name: tier.name, price: tier.price, accent: tier.accent });
    // Show confirmation screen with wallet connect
    setAwaitingConfirmation({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      accent: tier.accent,
      needWallet: true,
    });
  }, [address, navigate]);

  const doActualPayment = useCallback(async () => {
    if (!awaitingConfirmation || !payingTier) return;

    setPaymentStatus({ type: 'sending', message: 'Sending payment...' });

    try {
      const result = await sendPayment(TREASURY, payingTier.price, { memo: `covex-upgrade:${payingTier.id}` });

      if (result.success) {
        // Payment broadcast (including via wallet deep link / URI)
        // Optimistically unlock the tier so the user can immediately access the Terminal.
        // The backend Payment Verifier will later upgrade any covenants for visibility/ranking.
        localStorage.setItem('covex_paid_tier', payingTier.id);
        sessionStorage.setItem('payment_just_confirmed', JSON.stringify({ tier: payingTier.name, id: payingTier.id }));

        setAwaitingConfirmation(null);
        setPayingTier(null);
        setPaymentStatus(null);

        // If it was a URI deep link, the user still needs to approve in their wallet.
        // We still let them proceed with a clear message.
        if (result.method === 'uri') {
          sessionStorage.setItem('payment_pending_uri', 'true');
        }

        navigate('/paid-builder');
      } else {
        setPaymentStatus({ type: 'error', message: 'Payment failed: ' + (result.error || 'Unknown error') });
      }
    } catch (err) {
      setPaymentStatus({ type: 'error', message: 'Payment failed: ' + (err.message || 'Network error') });
    }
  }, [awaitingConfirmation, payingTier, sendPayment, navigate]);

  const cancelPayment = () => {
    setAwaitingConfirmation(null);
    setPayingTier(null);
    setPaymentStatus(null);
    setProcessing(null);
  };

  // ─── Payment Confirmation Screen ───
  if (awaitingConfirmation) {
    const p = awaitingConfirmation;
    const needWallet = p.needWallet && !address;

    return (
      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16 text-center">
        <button onClick={cancelPayment} className="flex items-center gap-2 text-gray-300 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium mx-auto w-fit">
          <ArrowLeft size={16} /> Cancel
        </button>

        <div className="mb-8">
          <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: p.accent + '15', border: `2px solid ${p.accent}30` }}>
            <ShieldCheck size={44} style={{ color: p.accent }} />
          </div>
          <h1 className="text-3xl font-black text-white mb-3">Payment Required</h1>
          <p className="text-lg text-gray-300 max-w-xl mx-auto">
            Send exactly {p.price.toLocaleString()} KAS to the Covex Treasury to unlock {p.name} tier access.
          </p>
        </div>

        {/* Need wallet first */}
        {needWallet && (
          <div className="mb-8 max-w-md mx-auto">
            <div className="p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/20 text-center mb-4">
              <p className="text-sm text-amber-400 font-semibold mb-1">Connect Your Wallet First</p>
              <p className="text-xs text-gray-300">Your wallet must be connected to send the payment.</p>
            </div>
            <DevConnectPanel compact />
          </div>
        )}

        {/* Payment details card */}
        <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 mb-8 text-left max-w-xl mx-auto">
          <div className="flex justify-between py-3 border-b border-white/10">
            <span className="text-gray-300">Tier</span>
            <span className="font-bold" style={{ color: p.accent }}>{p.name}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-white/10">
            <span className="text-gray-300">Amount to send</span>
            <span className="font-mono font-bold text-white">{p.price.toLocaleString()} KAS</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-gray-300">Treasury address</span>
            <span className="font-mono text-[10px] text-gray-200 break-all text-right max-w-[280px]">{TREASURY}</span>
          </div>
        </div>

        {/* Payment button */}
        <div className="space-y-4 max-w-md mx-auto">
          <button
            onClick={doActualPayment}
            disabled={paymentStatus?.type === 'sending'}
            className="w-full py-4 rounded-2xl bg-[#49EACB] text-black font-black text-lg shadow-[0_0_30px_rgba(73,234,203,0.3)] hover:shadow-[0_0_50px_rgba(73,234,203,0.5)] transition-all active:scale-[0.985] disabled:opacity-60"
          >
            {paymentStatus?.type === 'sending' ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin" />
                Sending {p.price} KAS...
              </span>
            ) : (
              `Send ${p.price.toLocaleString()} KAS Now`
            )}
          </button>

          {/* Status messages */}
          {paymentStatus && paymentStatus.type !== 'sending' && (
            <div className={`p-3 rounded-xl text-sm ${
              paymentStatus.type === 'info' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' :
              paymentStatus.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
              'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              {paymentStatus.message}
            </div>
          )}

          <button
            onClick={cancelPayment}
            className="w-full py-3 text-sm text-gray-200 hover:text-white transition"
          >
            Cancel, choose different tier
          </button>

          <p className="text-[11px] text-gray-300 pt-2 leading-relaxed">
            {needWallet
              ? 'Connect your wallet first, then click Send to pay securely through your Kaspa wallet.'
              : 'Click Send to open your connected wallet and approve the payment. After sending, you will land on your covenants page with Terminal access.'
            }
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
          return (
            <div
              key={tier.id}
              className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border rounded-2xl p-7 flex flex-col transition-all duration-300 hover:scale-[1.02]"
              style={{
                borderColor: isPaid ? tier.accent + '40' : 'rgba(255,255,255,0.08)',
                boxShadow: isPaid ? `0 0 30px ${tier.accent}08` : 'none',
              }}
            >
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
                disabled={processing === tier.id}
                className="w-full mt-6 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 border-none disabled:opacity-60"
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
                {processing === tier.id ? 'Redirecting...' : tier.cta}
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
          Treasury: <code className="text-gray-300 text-[10px] break-all">{TREASURY}</code>
        </p>
      </div>
    </div>
  );
};

export default Pricing;
