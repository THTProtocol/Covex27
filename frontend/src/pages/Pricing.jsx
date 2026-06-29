import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, Loader2, ArrowLeft, Terminal, Star, Crown, Eye, Copy, ShieldCheck } from '../lib/routeIcons.js';
import QRCodeSVG from '../components/LazyQRCode';
import { useWallet } from '../components/WalletContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { toast } from '../components/ToastContext';
import { TIER_COLOR as TIER_PALETTE_COLOR } from '../lib/tierPalette';

// Copyable address pill - same honest clipboard pattern as EnforcedDeploy's CopyBtn:
// only reports "copied" on a real successful write, surfaces a toast on failure.
function CopyBtn({ text, label = 'copy' }) {
  const [done, setDone] = useState(false);
  async function onCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable in this context.');
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.', { title: 'Copy failed' });
    }
  }
  return (
    <button
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/5 border border-white/10 hover:text-[#49EACB] hover:border-[#49EACB]/40 transition-colors light:text-slate-600 light:bg-slate-100 light:border-slate-200"
      aria-label="Copy treasury address"
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? 'copied' : label}
    </button>
  );
}

const TIERS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    desc: 'Almost everything is here: build and deploy ANY covenant - escrows, ZK proofs, vesting, custom logic, conditional payments - and give it a custom website. No cap, ever.',
    features: [
      'Build any covenant type (all builders free)',
      'Lock any amount, no maximum',
      'Build a custom website in Covenant Studio',
      'Base UI website template set',
      'Non-custodial deploy and offline claim',
      'Browse all indexed covenants',
      'On-chain status verification',
    ],
    missing: [
      'Premium UI website templates and priority placement (the paid add-ons)',
    ],
    cta: 'Explore Covenants',
    ctaAction: 'explore',
    accent: TIER_PALETTE_COLOR.FREE,
    variant: 'outline',
  },
  {
    id: 'BUILDER',
    name: 'Builder',
    price: 100,
    desc: 'Unlock the full premium UI website template library for your covenant page. The Studio and base templates are already free.',
    features: [
      'Full premium UI website template library',
      'Everything in the free tier',
      'Publish your design to the marketplace',
      'Standard Explorer placement',
    ],
    missing: [],
    cta: 'Pay 100 KAS',
    ctaAction: 'pay',
    accent: TIER_PALETTE_COLOR.BUILDER,
    variant: 'builder',
  },
  {
    id: 'PRO',
    name: 'PRO',
    price: 500,
    desc: 'Featured placement and better visibility on the Explorer, plus the full premium template library.',
    features: [
      'Everything in Builder tier',
      'Featured placement on Explorer',
      'Higher ranking in lists',
    ],
    missing: [],
    cta: 'Pay 500 KAS',
    ctaAction: 'pay',
    accent: TIER_PALETTE_COLOR.PRO,
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
    accent: TIER_PALETTE_COLOR.MAX,
    variant: 'max',
  },
];

// One-line tagline per tier for the simplified price cards (the detail lives in
// the "How it works" explanations below, so the cards stay scannable).
const TAGLINES = {
  FREE: 'Build and deploy any covenant, with a custom website. No limits.',
  BUILDER: 'The full premium website template library.',
  PRO: 'Featured placement on the Explorer.',
  MAX: 'Top placement, plus a TVL-weighted ranking boost.',
};

const MAINNET_TREASURY = 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2';

const getTreasuryAddress = () => MAINNET_TREASURY;

const Pricing = () => {
  const navigate = useNavigate();
  const { address, sendPayment, DevConnectPanel } = useWallet();
  const TREASURY = getTreasuryAddress();

  // Server-confirmed tier sync only - no localStorage pre-write
  // The auth-session endpoint is the only source of truth for paid access

  const [, setProcessing] = useState(null);
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
        // Payment broadcast. Server-side payment verifier will detect it.
        // The server auth-session endpoint confirms real on-chain payment.
        // Save txid so the premium builder knows to poll for confirmation (not instant).
        // For the dev wallet we also set a local marker so the robust unlock fires immediately.
        if (result.txid) {
          sessionStorage.setItem('payment_broadcast_tx', JSON.stringify({ 
            tier: payingTier.name, 
            id: payingTier.id, 
            address,
            txid: result.txid,
            broadcastAt: Date.now()
          }));
        } else {
          sessionStorage.setItem('payment_broadcast_tx', JSON.stringify({ 
            tier: payingTier.name, 
            id: payingTier.id, 
            address,
            txid: 'pricing-dev-' + Date.now(),
            broadcastAt: Date.now()
          }));
        }
        // NOTE: we intentionally do NOT write a paid tier to localStorage here.
        // localStorage is attacker-writable, so trusting it for tier = a self-grant hole.
        // Tier access is decided ONLY by the backend (/api/auth-session, /api/paid-status),
        // which confirms the real on-chain payment. The sessionStorage 'payment_broadcast_tx'
        // marker above is just a same-session hint that a real tx was broadcast (so the dev
        // wallet can skip the indexer confirmation wait); it never grants tier by itself.
        setAwaitingConfirmation(null);
        setPayingTier(null);
        setPaymentStatus(null);
        // Honesty: do NOT write a "payment_just_confirmed" marker here. The tx has only
        // been BROADCAST; the chain has not confirmed it yet. The 'payment_broadcast_tx'
        // marker written above already encodes that exact meaning (broadcast, pending),
        // and the Sandbox surface reads it to show an honest "awaiting on-chain
        // confirmation" banner. Tier access is decided only by the backend
        // (/api/paid-status) once the funding tx is on-chain. /premium is a Navigate to
        // /sandbox?paid=1, where the banner lives.
        navigate('/premium');
      } else {
        setPaymentStatus({ type: 'error', message: 'Payment failed: ' + (result.error || 'Unknown error') });
      }
    } catch (err) {
      setPaymentStatus({ type: 'error', message: 'Payment failed: ' + (err.message || 'Network error') });
    }
  }, [awaitingConfirmation, payingTier, sendPayment, navigate, TREASURY, address]);

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
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="covex-aurora" aria-hidden="true" style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 'min(520px, 90vw)', height: 300 }} />
        <button onClick={cancelPayment} className="flex items-center gap-2 text-gray-300 light:text-slate-600 hover:text-[#49EACB] light:hover:text-[#0f766e] transition-colors mb-8 text-sm font-medium mx-auto w-fit">
          <ArrowLeft size={16} /> Cancel
        </button>
        <div className="mb-8">
          <div className="mx-auto mb-6">
            {p.id === 'BUILDER' && <Terminal size={48} style={{ color: p.accent }} />}
            {p.id === 'PRO' && <Star size={48} style={{ color: p.accent }} />}
            {p.id === 'MAX' && <Crown size={48} style={{ color: p.accent }} />}
            {p.id === 'FREE' && <Eye size={48} style={{ color: p.accent }} />}
          </div>
          <h1 className="text-3xl font-black text-white light:text-slate-900 mb-3">Payment Required</h1>
          <p className="text-lg text-gray-300 light:text-slate-600 max-w-xl mx-auto">
            Send exactly {p.price.toLocaleString()} KAS to unlock {p.name} tier access.
          </p>
        </div>
        {needWallet && (
          <div className="mb-8 max-w-md mx-auto">
            <div className="p-4 rounded-xl bg-amber-500/[0.04] light:bg-amber-50 border border-amber-500/20 light:border-amber-300 text-center mb-4">
              <p className="text-sm text-amber-400 light:text-amber-700 font-semibold mb-1">Connect Your Wallet First</p>
            </div>
            <DevConnectPanel compact />
          </div>
        )}
        {/* One premium card: order summary, copyable treasury, framed QR, and the
            Send CTA - all on a single glass-panel + hero surface with a 3px accent
            bar matching the CovenantCard vocabulary, so there is no layout jitter
            between stacked wrappers and the QR no longer crowds the button. */}
        <Card hero accent={p.accent} className="max-w-md mx-auto text-left">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Order summary */}
            <div className="space-y-3">
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-sm text-gray-300 light:text-slate-500">Tier</span>
                <span className={`font-bold tier-text-${p.id}`}>{p.name}</span>
              </div>
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-sm text-gray-300 light:text-slate-500">Send exactly</span>
                <span className="text-lg font-black text-white tabular-nums light:text-slate-900">{p.price.toLocaleString()} KAS</span>
              </div>
            </div>

            {/* Copyable treasury pill - replaces the cramped overflowing readout */}
            <div>
              <div className="text-xs text-gray-400 light:text-slate-500 mb-1.5">Treasury address</div>
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 light:bg-slate-50 light:border-slate-200">
                <span className="font-mono text-[11px] leading-snug text-gray-200 light:text-slate-700 break-all min-w-0 flex-1">{TREASURY}</span>
                <CopyBtn text={TREASURY} />
              </div>
            </div>

            <div className="h-px bg-white/10 light:bg-slate-200" aria-hidden="true" />

            {/* QR code for easy payment. The tier is granted by the backend to the
                PAYER address (the from_address of the funding tx), so payment must
                come from the wallet you will deploy with, not just any wallet.
                Rendered locally with qrcode.react so the payment URI never leaves the
                browser - encodes the exact same kaspa: string the old external image
                did. Framed on a white rounded chip; level H for damage resilience. */}
            <div className="flex flex-col items-center text-center">
              <div className="text-xs text-gray-400 light:text-slate-500 mb-4">Or scan to pay exactly {p.price.toLocaleString()} KAS from the wallet you will use to deploy</div>
              <div className="rounded-2xl bg-white p-3 sm:p-4 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] light:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] ring-1 ring-black/5 light:ring-slate-200">
                <QRCodeSVG
                  value={`${TREASURY}?amount=${p.price}&message=COVEX-${p.id}`}
                  size={typeof window !== 'undefined' && window.innerWidth < 640 ? 160 : 180}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  aria-label={`QR code to pay ${p.price} KAS for ${p.name} tier`}
                />
              </div>
            </div>

            {/* Subtle divider so the QR block and the Send CTA never crowd */}
            <div className="h-px bg-white/10 light:bg-slate-200" aria-hidden="true" />

            {/* Send CTA + error + cancel, with generous rhythm */}
            <div className="space-y-4">
              {paymentStatus?.type === 'error' && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-left light:bg-red-50 light:text-red-700 light:border-red-200">
                  {paymentStatus.message}
                </div>
              )}
              <Button
                onClick={doActualPayment}
                disabled={paymentStatus?.type === 'sending'}
                className="w-full py-4 text-lg btn-shimmer"
              >
                {paymentStatus?.type === 'sending' ? (
                  <>
                    <Loader2 size={20} className="animate-spin" /> Broadcasting...
                  </>
                ) : (
                  `Send ${p.price.toLocaleString()} KAS Now`
                )}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 light:text-slate-500">
                <ShieldCheck size={13} className="text-[#49EACB] light:text-[#0f766e]" /> Pay the treasury directly. The tier unlocks for the address you pay from.
              </p>
              <button
                onClick={cancelPayment}
                disabled={paymentStatus?.type === 'sending'}
                className="block mx-auto text-xs text-gray-400 hover:text-gray-200 light:text-slate-500 light:hover:text-slate-700 underline-offset-4 hover:underline transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Honest, simple explanations shown BELOW the prices so the page leads with the
  // numbers. These carry the same claims the old banner/transparency block did:
  // building is free, paid only adds visibility, and there is no cap.
  const EXPLAIN = [
    { icon: Eye, title: 'Free to build, free to ship', body: 'Build and deploy any covenant - escrows, ZK proofs, vesting, custom logic - give it a custom website in the Studio, and claim non-custodially. No account, no cap.' },
    { icon: Star, title: 'Pay only for the spotlight', body: 'Builder unlocks the full premium website template library. PRO adds featured placement on the Explorer. MAX adds top placement and a TVL-weighted ranking boost.' },
    { icon: ShieldCheck, title: 'No cap. Ever.', body: 'Any covenant on any tier, including free, can lock any amount. Tiers only change how visible your covenant is, never how much you can lock.' },
    { icon: Crown, title: 'One payment, one wallet', body: 'A one-time KAS payment to the treasury. The tier unlocks for the wallet address you pay from, so pay from the wallet you will deploy with.' },
  ];

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 golden-section--tight">
      <div className="covex-aurora" aria-hidden="true" style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 660, height: 300, maxWidth: '90vw' }} />

      {/* Short header: one line, then straight to the prices. */}
      <header className="relative z-10 text-center max-w-2xl mx-auto mb-10">
        <h1 className="h-display text-white light:text-slate-900 mb-3">Pricing</h1>
        <p className="lede text-gray-300 light:text-slate-600">
          One-time payment. Building and shipping any covenant is free, the website builder included. Paid tiers only add visibility, never a higher limit.
        </p>
      </header>

      {/* PRICES - listed first, at the top. */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
        {TIERS.map((tier) => {
          const isFree = tier.id === 'FREE';
          return (
            <Card key={tier.id} accent={!isFree ? tier.accent : undefined} className={`relative overflow-hidden flex flex-col h-full pricing-tier-card hover-lift ${!isFree ? 'border-2' : ''}`}
              style={!isFree ? { borderColor: tier.accent + '40', boxShadow: tier.id === 'PRO' ? `0 0 0 1px ${tier.accent}55, 0 22px 55px -24px ${tier.accent}77` : undefined } : {}}>
              <CardHeader>
                {/* Icon + full tier name. No duplicate badge, so the name never
                    truncates (this was clipping "Builder" to "Bu..."). */}
                <div className="flex items-center gap-2.5">
                  {tier.id === 'FREE' && <Eye size={20} className="text-gray-400 light:text-slate-500 shrink-0" />}
                  {tier.id === 'BUILDER' && <Terminal size={20} className="shrink-0" style={{ color: tier.accent }} />}
                  {tier.id === 'PRO' && <Star size={20} className="shrink-0" style={{ color: tier.accent }} />}
                  {tier.id === 'MAX' && <Crown size={20} className="shrink-0" style={{ color: tier.accent }} />}
                  <CardTitle>{tier.name}</CardTitle>
                </div>
                {/* Price = the hero. The unit and cadence sit on their own lines so
                    nothing overflows a narrow card (this was clipping "one-time"). */}
                <div className="mt-4">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-4xl sm:text-5xl font-black tracking-[-0.03em] leading-[0.95] text-white light:text-slate-900 tabular-nums">
                      {isFree ? 'Free' : tier.price.toLocaleString()}
                    </span>
                    {!isFree && <span className={`text-base font-bold tier-text-${tier.id}`}>KAS</span>}
                  </div>
                  <div className="text-[11px] text-gray-500 light:text-slate-500 mt-1.5">{isFree ? 'free forever' : 'one-time payment'}</div>
                </div>
                <p className="text-sm text-gray-400 light:text-slate-600 mt-3 leading-relaxed">{TAGLINES[tier.id]}</p>
              </CardHeader>
              <div className="mt-auto p-6 pt-0">
                <Button
                  onClick={() => handlePay(tier)}
                  variant={isFree ? 'outline' : 'default'}
                  className={`w-full ${isFree ? '' : 'btn-shimmer'}`}
                >
                  {tier.cta}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* SIMPLE EXPLANATIONS - below the prices. */}
      <section className="relative z-10 max-w-4xl mx-auto">
        <h2 className="h-section text-white light:text-slate-900 text-center mb-6">How it works</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {EXPLAIN.map((x, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:border-slate-200 light:bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-kaspa-green/10 text-kaspa-green light:bg-emerald-50 light:text-[#0f766e] shrink-0"><x.icon size={16} aria-hidden="true" /></span>
                <h3 className="text-base font-bold text-white light:text-slate-900">{x.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-gray-300 light:text-slate-600">{x.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-gray-400 light:text-slate-500">
          <Link to="/kaspa" className="text-kaspa-green light:text-[#0f766e] underline underline-offset-4">Learn about Kaspa</Link>
          <span className="mx-2 text-gray-600 light:text-slate-600">|</span>
          <Link to="/treasury" className="text-kaspa-green light:text-[#0f766e] underline underline-offset-4">Treasury and ranking transparency</Link>
        </p>
      </section>
    </div>
  );
};

export default Pricing;