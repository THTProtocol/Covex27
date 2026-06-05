import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, X as XIcon, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import { useWallet } from '../components/WalletContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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
    variant: 'outline',
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
    variant: 'builder',
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
    variant: 'pro',
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
    variant: 'max',
  },
];

const TESTNET_TREASURY_TN12 = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
// TN10 uses the same treasury address (same private key, valid on both testnet chains).
// Backend monitors this address independently on each network via network-tagged verifiers.
const TESTNET_TREASURY_TN10 = TESTNET_TREASURY_TN12;
const MAINNET_TREASURY = 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2';

const getTreasuryAddress = () => {
  if (typeof window === 'undefined') return TESTNET_TREASURY_TN12;
  const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
  if (net === 'mainnet' || net === 'mainnet-1') return MAINNET_TREASURY;
  if (net === 'testnet-10') return TESTNET_TREASURY_TN10;
  return TESTNET_TREASURY_TN12;
};

const Pricing = () => {
  const navigate = useNavigate();
  const { address, sendPayment, connecting, DevConnectPanel } = useWallet();
  const [currentNetwork, setCurrentNetwork] = useState(() => {
    if (typeof window === 'undefined') return 'testnet-12';
    return localStorage.getItem('kaspaNetwork') || 'testnet-12';
  });
  const isMainnet = currentNetwork === 'mainnet' || currentNetwork === 'mainnet-1';
  const TREASURY = getTreasuryAddress();

  useEffect(() => {
    const handler = () => {
      const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
      setCurrentNetwork(net);
    };
    window.addEventListener('kaspa-network-change', handler);
    return () => window.removeEventListener('kaspa-network-change', handler);
  }, []);

  useEffect(() => {
    if (!address) return;
    const net = currentNetwork || 'testnet-12';
    fetch(`/api/paid-status?address=${encodeURIComponent(address)}&network=${net}`)
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
            Send exactly {p.price.toLocaleString()} KAS to unlock {p.name} tier access.
          </p>
          {isMainnet && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium">
              MAINNET: You are sending REAL KAS. There are no refunds or testnet do-overs.
            </div>
          )}
        </div>
        {needWallet && (
          <div className="mb-8 max-w-md mx-auto">
            <div className="p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/20 text-center mb-4">
              <p className="text-sm text-amber-400 font-semibold mb-1">Connect Your Wallet First</p>
            </div>
            <DevConnectPanel compact />
          </div>
        )}
        <Card className="max-w-xl mx-auto mb-8">
          <CardContent className="p-6">
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
          </CardContent>
        </Card>

        {/* QR code for easy payment from any wallet (will be matched to your address by indexer) */}
        <div className="max-w-md mx-auto mt-4">
          <div className="text-xs text-gray-400 mb-1 text-center">Scan to pay exactly {p.price} KAS (from the wallet you will use to deploy)</div>
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`kaspa:${TREASURY.replace(/^kaspa:|^kaspatest:/i,'')}?amount=${p.price}&message=COVEX-${p.id}`)}`}
            alt="QR to pay tier"
            className="mx-auto rounded border border-white/10 bg-white p-1"
          />
        </div>
        <div className="space-y-4 max-w-md mx-auto">
          <Button onClick={doActualPayment} disabled={paymentStatus?.type === 'sending'} className="w-full py-4 text-lg">
            {paymentStatus?.type === 'sending' ? 'Sending...' : `Send ${p.price.toLocaleString()} KAS Now`}
          </Button>
          <button onClick={cancelPayment} className="w-full py-3 text-sm text-gray-200 hover:text-white transition">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Deploy Interactive Covenants</h1>
        <p className="text-base md:text-lg text-gray-300 leading-relaxed">
          One-time payment. Full Terminal access on all paid tiers. Higher tiers = better visibility on the Explorer.
        </p>
        <p className="mt-3 text-sm"><Link to="/kaspa" className="text-kaspa-green underline">Learn about Kaspa</Link></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {TIERS.map((tier) => {
          const isFree = tier.id === 'FREE';
          return (
            <Card key={tier.id} className={`flex flex-col pricing-tier-card ${!isFree ? 'border-2' : ''}`} style={!isFree ? { borderColor: tier.accent + '40' } : {}}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  <Badge variant={tier.variant}>{isFree ? 'FREE' : tier.price + ' KAS'}</Badge>
                </div>
                <p className="text-sm text-gray-400 mt-1">{tier.desc}</p>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2.5 mb-6">
                  {tier.features.map((feature, i) => (
                    <div key={i} className="flex gap-2.5 text-sm text-gray-300">
                      <Check size={16} className="shrink-0 mt-0.5 text-[#49EACB]" />
                      <span>{feature}</span>
                    </div>
                  ))}
                  {tier.missing.map((feature, i) => (
                    <div key={i} className="flex gap-2.5 text-sm text-gray-300 opacity-60">
                      <XIcon size={16} className="shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Button 
                  onClick={() => handlePay(tier)} 
                  variant={isFree ? 'outline' : 'default'}
                  className="w-full"
                >
                  {tier.cta}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="text-center mt-10 text-sm text-gray-400 max-w-xl mx-auto">
        All paid tiers include the full Covex Terminal for deploying custom interactive UIs. The only difference is your covenant's visibility ranking on the Explorer.
      </div>
    </div>
  );
};

export default Pricing;