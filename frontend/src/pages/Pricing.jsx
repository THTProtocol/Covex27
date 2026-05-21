import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { QRCodeCanvas as QRCode } from 'qrcode.react';

const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

const TIERS = [
  {
    id: 'explorer',
    name: 'Explorer',
    subtitle: 'Free Read-Only Access',
    priceKAS: 0,
    period: 'free forever',
    color: 'border-gray-500/30 bg-gray-500/5',
    accent: '#6B7280',
    desc: 'Browse all indexed covenants on the Kaspa BlockDAG. Read-only contract view with script display, parameters, and on-chain status verification.',
    features: [
      'Browse all indexed covenants',
      'Public read-only contract view',
      'Script display and parameters',
      'On-chain status verification',
      'Search and filter capabilities',
    ],
    missing: ['No interactive UI generation', 'No featured placement', 'No custom forms'],
  },
  {
    id: 'creator',
    name: 'Creator',
    subtitle: 'Custom Interactive UI',
    priceKAS: 100,
    period: 'one-time',
    color: 'border-blue-500/30 bg-blue-500/5',
    accent: '#3B82F6',
    popular: false,
    desc: 'Generate a fully interactive UI for your covenant with drag-and-drop forms, wallet integration, and a public listing. One-time payment for permanent listing.',
    features: [
      'Everything in Explorer',
      'Automatic interactive UI generation',
      'Form builder with parameter inputs',
      'Wallet-integrated interact buttons',
      'Shareable/embeddable view',
      'Standard registry listing',
    ],
    missing: ['No featured placement', 'No PRO-level tools', 'No top placement'],
  },
  {
    id: 'pro',
    name: 'PRO',
    subtitle: 'Better Visibility + Advanced Tools',
    priceKAS: 500,
    period: 'one-time',
    color: 'border-kaspa-gold/30 bg-kaspa-gold/5',
    accent: '#E8AF34',
    popular: true,
    desc: 'Everything in Creator plus better visibility with featured listings, higher search ranking, and advanced UI customization tools.',
    features: [
      'Everything in Creator',
      'Featured listings placement',
      'Higher search ranking',
      'Suggested covenant placement',
      'Custom covenant image upload',
      'Advanced UI tools',
    ],
    missing: [],
  },
  {
    id: 'max',
    name: 'MAX',
    subtitle: 'Maximum Visibility + Full Suite',
    priceKAS: 1000,
    period: 'one-time',
    color: 'border-purple-500/30 bg-purple-500/5',
    accent: '#A855F7',
    popular: false,
    desc: 'The ultimate tier. Everything in PRO plus maximum visibility with top placement everywhere, a full UI design suite, and maximum configuration power.',
    features: [
      'Everything in PRO',
      'Top placement on explorer',
      'Premium branding options',
      'Custom domain embedding',
      'Dedicated indexer priority',
      'Full UI design suite',
      'Custom color palette',
    ],
    missing: [],
  },
];

export default function Pricing() {
  const { address, sendPayment, connecting } = useWallet();
  const [paying, setPaying] = useState(null);
  const [paid, setPaid] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);

  const handlePay = async (tier) => {
    if (tier.priceKAS === 0) return;
    setPaying(tier.id);
    try {
      if (address) {
        const result = await sendPayment(TREASURY, tier.priceKAS, { memo: `covex:${tier.id}` });
        if (result.success) {
          setPaid(tier.id);
        }
      } else {
        window.location.href = `kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.priceKAS}`;
      }
    } catch (e) {
      // URI fallback handled in sendPayment
    }
    setPaying(null);
  };

  const handleQRPay = (tier) => {
    setSelectedTier(tier);
    setShowQRModal(true);
  };

  const getPaymentURI = (tier) => {
    return `kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.priceKAS}`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">Pricing</h1>
        <p className="text-sm text-gray-400 mt-3 max-w-xl mx-auto">
          One-time KAS payment. Your covenant gets a permanent interactive UI and visibility boost.
          No subscriptions. No recurring charges.
        </p>
      </div>

      {/* Value props */}
      <div className="glass-panel p-6 mb-10 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            ['Pay for Visibility', 'Your covenant appears prominently. Users interact via their own wallet.'],
            ['Automatic UI Generation', 'Paid listings get custom interactive panels with forms, validation, and wallet integration.'],
            ['One-Time Fee, Forever', 'Pay once, listed permanently. No subscriptions. No recurring billing.'],
          ].map(([t, d]) => (
            <div key={t} className="space-y-1">
              <p className="text-sm font-semibold text-white">{t}</p>
              <p className="text-xs text-gray-500">{d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {TIERS.map((t) => (
          <div
            key={t.id}
            className={`glass-panel p-6 flex flex-col border ${t.color} ${t.popular ? 'ring-1 ring-kaspa-gold/50' : ''}`}
          >
            {t.popular && (
              <div className="text-center mb-3">
                <span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold bg-kaspa-gold/20 text-kaspa-gold">
                  RECOMMENDED
                </span>
              </div>
            )}

            <div className="text-center mb-5">
              <h3 className="text-lg font-semibold text-white">{t.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{t.subtitle}</p>
              <div className="mt-3">
                <div className="space-y-1">
                  <span className="text-3xl font-bold text-white tabular-nums">
                    {t.priceKAS === 0 ? 'Free' : t.priceKAS.toLocaleString()}
                  </span>
                  {t.priceKAS > 0 && <span className="text-sm text-kaspa-green font-medium ml-1">KAS</span>}
                  <p className="text-xs text-gray-500">{t.period}</p>
                </div>
              </div>
            </div>

            <ul className="space-y-2 text-sm flex-1">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <svg className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-gray-300 text-xs">{f}</span>
                </li>
              ))}
            </ul>

            {t.missing.length > 0 && (
              <ul className="space-y-2 text-sm mt-4 pt-4 border-t border-white/5">
                {t.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2 opacity-40">
                    <svg className="h-3.5 w-3.5 text-gray-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span className="text-gray-600 text-xs">{f}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 space-y-3">
              {t.priceKAS === 0 ? (
                <Link
                  to="/"
                  className="block w-full text-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 bg-white/5 text-white border border-white/10 hover:bg-white/10 active:scale-[0.97]"
                >
                  Explore Covenants
                </Link>
              ) : paid === t.id ? (
                <div className="block w-full text-center px-4 py-3 rounded-xl text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Payment Sent - Verifying...
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handlePay(t)}
                    disabled={paying === t.id || connecting}
                    className={`block w-full text-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      t.popular
                        ? 'bg-kaspa-green text-black shadow-[0_0_20px_rgba(73,234,203,0.2)] hover:shadow-[0_0_40px_rgba(73,234,203,0.3)]'
                        : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                    } active:scale-[0.97] disabled:opacity-50`}
                  >
                    {paying === t.id ? 'Processing...' : `Pay ${t.priceKAS.toLocaleString()} KAS`}
                  </button>
                  <button
                    onClick={() => handleQRPay(t)}
                    className="block w-full text-center px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 active:scale-[0.97] mt-2"
                  >
                    Pay with QR Code
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Treasury info + disclaimers */}
      <div className="glass-panel p-6 mt-10 text-center max-w-3xl mx-auto space-y-4">
        <p className="text-sm text-gray-400">
          All on-chain covenants are visible in the public registry. Paying for a tier adds an
          interactive UI and visibility boost. All payments are one-time and non-refundable.
        </p>
        <p className="text-xs text-gray-600 font-mono break-all">
          Treasury: {TREASURY}
        </p>
        <div className="text-xs text-gray-600 space-y-1">
          <p>Payments are processed on-chain in KAS only. No fiat, no subscriptions, no recurring billing.</p>
          <p>Covex never stores private keys. All transactions are signed in your own wallet.</p>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQRModal && selectedTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
          <div className="w-full max-w-md glass-panel rounded-3xl p-8 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">Pay with QR Code</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Scan this QR code with your Kaspa wallet to pay {selectedTier.priceKAS} KAS
                </p>
              </div>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-500 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-white rounded-xl">
                <QRCode 
                  value={getPaymentURI(selectedTier)} 
                  size={200} 
                  level="H"
                  includeMargin={true}
                />
              </div>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-300">
                  Pay exactly <span className="font-bold text-kaspa-green">{selectedTier.priceKAS} KAS</span>
                </p>
                <p className="text-xs text-gray-500 break-all font-mono">
                  {getPaymentURI(selectedTier)}
                </p>
              </div>
              
              <div className="pt-4 border-t border-white/10 w-full">
                <p className="text-xs text-gray-500 text-center">
                  After payment, your covenant will be upgraded automatically within 6 confirmations.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
