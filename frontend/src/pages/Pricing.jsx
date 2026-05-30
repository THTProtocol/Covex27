import { useState, useCallback, useEffect } from 'react';
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
    id: 'BUILDER',
    name: 'Builder',
    price: 100,
    desc: 'Unlock the full Covex Terminal. Deploy custom interactive covenants with your own UIs, fees, and resolution logic.',
    features: [
      'Full access to Covex Terminal',
      'Deploy custom UIs from Covenant Studio',
      'Configure fees, reusability & top-ups',
      'Standard Explorer placement',
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
    desc: 'Get featured placement and better visibility on the Explorer.',
    features: [
      'Everything in Builder tier',
      'Featured placement on Explorer',
      'Higher ranking in lists',
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
    desc: 'Maximum visibility with top placement and TVL-weighted ranking boost.',
    features: [
      'Everything in PRO tier',
      'Top placement on Explorer',
      'TVL-weighted ranking advantage',
    ],
    missing: [],
    cta: 'Pay 1,000 KAS',
    ctaAction: 'pay',
    accent: '#A855F7',
  },
];

const TESTNET_TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

const getTreasuryAddress = (isMainnet) => {
  return isMainnet 
    ? 'kaspa:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq'
    : TESTNET_TREASURY;
};

const Pricing = () => {
  const navigate = useNavigate();
  const { address, sendPayment, connecting, DevConnectPanel } = useWallet();
  const [isMainnet, setIsMainnet] = useState(false);
  const TREASURY = getTreasuryAddress(isMainnet);

  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(data => {
        const net = data?.network || 'testnet-12';
        setIsMainnet(net === 'mainnet' || net === 'mainnet-1');
      })
      .catch(() => setIsMainnet(false));
  }, []);

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
      })
      .catch(() => {});
  }, [address]);

  const [processing, setProcessing] = useState(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [payingTier, setPayingTier] = useState(null);

  const handlePay = useCallback((tier) => {
    if (tier.id === 'FREE') {
      navigate('/');
      return;
    }
    setPaymentStatus(null);
    const tierData = { id: tier.id, name: tier.name, price: tier.price, accent: tier.accent };
    setPayingTier(tierData);
    setAwaitingConfirmation({ ...tierData, needWallet: !address });
  }, [address, navigate]);

  const doActualPayment = useCallback(async () => {
    if (!awaitingConfirmation || !payingTier) return;
    setPaymentStatus({ type: 'sending', message: 'Sending payment...' });
    try {
      const result = await sendPayment(TREASURY, payingTier.price, { memo: `covex-upgrade:${payingTier.id}` });
      if (result.success) {
        localStorage.setItem('covex_paid_tier', payingTier.id);
        sessionStorage.setItem('payment_just_confirmed', JSON.stringify({ tier: payingTier.name, id: payingTier.id }));
        setAwaitingConfirmation(null);
        setPayingTier(null);
        setPaymentStatus(null);
        navigate('/paid-builder');
      } else {
        setPaymentStatus({ type: 'error', message: 'Payment failed: ' + (result.error || 'Unknown error') });
      }
    } catch (err) {
      setPaymentStatus({ type: 'error', message: 'Payment failed: ' + (err.message || 'Network error') });
    }
  }, [awaitingConfirmation, payingTier, sendPayment, navigate, TREASURY]);

  const cancelPayment = () => {
    setAwaitingConfirmation(null);
    setPayingTier(null);
    setPaymentStatus(null);
    setProcessing(null);
  };

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
            Send exactly {p.price.toLocaleString()} KAS to unlock {p.name} tier.
          </p>
        </div>
        {needWallet && (
          <div className="mb-8 max-w-md mx-auto">
            <div className="p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/20 text-center mb-4">
              <p className="text-sm text-amber-400 font-semibold mb-1">Connect Your Wallet First</p>
            </div>
            <DevConnectPanel compact />
          </div>
        )}
        <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 mb-8 text-left max-w-xl mx-auto">
          <div className="flex justify-between py-3 border-b border-white/10">
            <span className="text-gray-300">Tier</span>
            <span className="font-bold" style={{ color: p.accent }}>{p.name}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-white/10">
            <span className="text-gray-300">Amount</span>
            <span className="font-mono font-bold text-white">{p.price.toLocaleString()} KAS</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-gray-300">Treasury</span>
            <span className="font-mono text-[10px] text-gray-200 break-all">{TREASURY}</span>
          </div>
        </div>
        <div className="space-y-4 max-w-md mx-auto">
          <button onClick={doActualPayment} disabled={paymentStatus?.type === 'sending'} className="w-full py-4 rounded-2xl bg-[#49EACB] text-black font-black text-lg shadow-[0_0_30px_rgba(73,234,203,0.3)] hover:shadow-[0_0_50px_rgba(73,234,203,0.5)] transition-all active:scale-[0.985] disabled:opacity-60">
            {paymentStatus?.type === 'sending' ? 'Sending...' : `Send ${p.price.toLocaleString()} KAS Now`}
          </button>
          <button onClick={cancelPayment} className="w-full py-3 text-sm text-gray-200 hover:text-white transition">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">Deploy Interactive Covenants</h1>
        <p className="text-sm md:text-base text-gray-200">One-time payment. Full Terminal access on all paid tiers. Higher tiers = better visibility.</p>
        <p className="mt-2 text-xs text-gray-400"><Link to="/how-covex-works" className="underline">How Covex Works →</Link></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {TIERS.map((tier) => {
          const isFree = tier.id === 'FREE';
          return (
            <div key={tier.id} className="relative bg-[#0a0a0a]/95 border rounded-2xl p-7 flex flex-col" style={{ borderColor: isFree ? 'rgba(255,255,255,0.08)' : tier.accent + '40' }}>
              <div className="mb-5">
                <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                <p className="text-xs text-gray-300 mt-1.5">{tier.desc}</p>
              </div>
              <div className="mb-5">
                {isFree ? <span className="text-3xl font-black text-white">Free</span> : <span className="text-3xl font-black" style={{ color: tier.accent }}>{tier.price.toLocaleString()} KAS</span>}
                <p className="text-[11px] text-gray-300 mt-1">one-time</p>
              </div>
              <div className="space-y-2.5 flex-1">
                {tier.features.map((f, i) => (<div key={i} className="flex gap-2.5 text-xs text-gray-300"><Check size={14} className="mt-0.5" style={{ color: tier.accent }} />{f}</div>))}
                {tier.missing.map((f, i) => (<div key={i} className="flex gap-2.5 text-xs text-gray-300 opacity-60"><XIcon size={14} className="mt-0.5" />{f}</div>))}
              </div>
              <button onClick={() => handlePay(tier)} className="w-full mt-6 px-5 py-3 rounded-xl text-sm font-bold transition-all" style={{ backgroundColor: isFree ? 'rgba(255,255,255,0.06)' : '#49EACB', color: isFree ? '#fff' : '#000' }}>
                {tier.cta}
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-center mt-10 text-xs text-gray-400">
        All paid tiers include the full Terminal. Only visibility ranking changes.
      </div>
    </div>
  );
};

export default Pricing;