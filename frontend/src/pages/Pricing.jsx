import { useWallet } from '../components/WalletContext';

const TREASURY = 'kaspatest:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq';

const TIERS = [
  { id:'explorer', name:'Explorer', priceKAS:0, period:'forever', color:'border-gray-500/30 bg-gray-500/5',
    desc:'Browse the public covenant registry. All on-chain covenants are visible to everyone.',
    features:['Public covenant registry','Basic search and filtering','Community support'],
    missing:['No interactive covenant UI','No featured placement','No SilverScript compiler'] },
  { id:'creator', name:'Creator', priceKAS:500, period:'one-time', color:'border-kaspa-gold/30 bg-kaspa-gold/5', popular:true,
    desc:'Get a custom interactive UI for your covenant with featured visibility on the explorer.',
    features:['Everything in Explorer','Custom interactive covenant UI','Featured placement','Wallet deep-link generation','SilverScript compiler','Priority API access'],
    missing:[] },
  { id:'enterprise', name:'Enterprise', priceKAS:5000, period:'one-time', color:'border-purple-500/30 bg-purple-500/5',
    desc:'Branded UI, dedicated indexing, and priority support for your covenant.',
    features:['Everything in Creator','Branded interactive UI','Top placement','Dedicated indexing','Service Level Agreement','Priority support'],
    missing:[] },
];

export default function Pricing() {
  const { address, sendPayment, buildUri, connecting } = useWallet();
  const handlePay = async (tier) => {
    if (!address) { window.location.href = buildUri(TREASURY, tier.priceKAS); return; }
    await sendPayment(TREASURY, tier.priceKAS * 1e8);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-white tracking-tight">Pricing</h1>
        <p className="text-sm text-gray-400 mt-2">One-time KAS payment for a custom interactive UI and featured visibility on Covex.</p>
      </div>
      <div className="glass p-6 mb-10 text-center">
        <div className="grid grid-cols-3 gap-6">
          {[['Pay for Visibility','Your covenant appears prominently. Users interact with it via their wallet.'],['Interactive UI','Paid listings get custom panels: amount inputs, wallet deep-links, live data.'],['One-Time Fee','Pay once, listed permanently. No subscriptions. No recurring charges.']].map(([t,d])=>(
            <div key={t} className="space-y-1"><p className="text-sm font-semibold text-white">{t}</p><p className="text-xs text-gray-500">{d}</p></div>))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
        {TIERS.map(t=>(
          <div key={t.name} className={`glass p-8 flex flex-col border ${t.color} ${t.popular?'ring-1 ring-kaspa-gold/50':''}`}>
            {t.popular && <div className="text-center mb-4"><span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold bg-kaspa-gold/20 text-kaspa-gold">RECOMMENDED</span></div>}
            <div className="text-center mb-6"><h3 className="text-xl font-semibold text-white">{t.name}</h3><p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
              <div className="mt-4">{t.priceKAS===0?<span className="text-3xl font-bold text-white">Free</span>:<div className="space-y-1"><span className="text-4xl font-bold text-white tabular-nums">{t.priceKAS.toLocaleString()}</span><span className="text-sm text-kaspa-green font-medium ml-0.5">KAS</span><p className="text-xs text-gray-500">{t.period}</p></div>}</div>
            </div>
            <ul className="space-y-3 text-sm flex-1">{t.features.map(f=><li key={f} className="flex items-start gap-2"><svg className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span className="text-gray-300">{f}</span></li>)}</ul>
            {t.missing.length>0 && <ul className="space-y-2 text-sm mt-6 pt-6 border-t border-white/5">{t.missing.map(f=><li key={f} className="flex items-start gap-2 opacity-40"><svg className="h-4 w-4 text-gray-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span className="text-gray-600">{f}</span></li>)}</ul>}
            <div className="mt-8">{t.priceKAS===0?<button className="block w-full text-center px-4 py-3 rounded-xl text-sm font-semibold bg-white/10 text-white border border-white/20 opacity-50 cursor-default" disabled>Always Free</button>:<button onClick={()=>handlePay(t)} disabled={connecting} className={`block w-full text-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${t.popular?'bg-kaspa-green text-black shadow-[0_0_20px_rgba(73,234,203,0.2)] hover:shadow-[0_0_40px_rgba(73,234,203,0.3)]':'bg-white/10 text-white border border-white/20 hover:bg-white/20'} active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed`}>{connecting?'Processing':address?`Pay ${t.priceKAS.toLocaleString()} KAS`:'Connect Wallet'}</button>}</div>
          </div>
        ))}
      </div>
      <div className="glass p-6 mt-10 text-center max-w-3xl mx-auto space-y-3">
        <p className="text-sm text-gray-400">All on-chain covenants are visible in the public registry. Paying for Creator or Enterprise adds an interactive UI panel and featured placement.</p>
        <p className="text-xs text-gray-600">Treasury: {TREASURY}</p>
      </div>
    </div>
  );
}
