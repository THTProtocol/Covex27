import { Link } from 'react-router-dom';

const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

const TIERS = [
  { id:'basic', name:'Interactive UI', priceKAS:100, period:'one-time', color:'border-blue-500/30 bg-blue-500/5',
    desc:'Standard interactive UI for your covenant. Users can input amounts and interact via their wallet.',
    features:['Custom covenant detail page','Amount input with wallet deep-link','Public registry listing','Standard visibility'],
    missing:['No priority placement','No premium branding'] },
  { id:'pro', name:'Prioritized Visibility', priceKAS:500, period:'one-time', color:'border-kaspa-gold/30 bg-kaspa-gold/5', popular:true,
    desc:'Prioritized visibility and custom UI. Your covenant appears before free listings.',
    features:['Everything in Interactive UI','Priority registry placement','Custom covenant image','Suggested placement on homepage'],
    missing:[] },
  { id:'elite', name:'Max Visibility', priceKAS:1000, period:'one-time', color:'border-purple-500/30 bg-purple-500/5',
    desc:'Top row placement and premium branding. Maximum visibility on the Covex explorer.',
    features:['Everything in Prioritized','Top row placement','Premium branding','Custom color palette','Dedicated indexer priority'],
    missing:[] },
];

export default function Pricing() {
  const handlePay = (tier) => {
    window.location.href = `kaspatest:${TREASURY}?amount=${tier.priceKAS}`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-white tracking-tight">Pricing</h1>
        <p className="text-sm text-gray-400 mt-2">One-time KAS payment. Your covenant gets an interactive UI and visibility.</p>
      </div>

      <div className="glass-panel p-6 mb-10 text-center">
        <div className="grid grid-cols-3 gap-6">
          {[
            ['Pay for Visibility','Your covenant appears prominently on Covex. Users interact with it via their wallet.'],
            ['Interactive UI','Paid listings get custom panels: amount inputs, wallet deep-links, live data.'],
            ['One-Time Fee','Pay once, listed permanently. No subscriptions. No recurring charges.'],
          ].map(([t,d]) => (
            <div key={t} className="space-y-1"><p className="text-sm font-semibold text-white">{t}</p><p className="text-xs text-gray-500">{d}</p></div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
        {TIERS.map(t => (
          <div key={t.name} className={`glass-panel p-8 flex flex-col border ${t.color} ${t.popular?'ring-1 ring-kaspa-gold/50':''}`}>
            {t.popular && <div className="text-center mb-4"><span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold bg-kaspa-gold/20 text-kaspa-gold">RECOMMENDED</span></div>}
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white">{t.name}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
              <div className="mt-4">
                <div className="space-y-1">
                  <span className="text-4xl font-bold text-white tabular-nums">{t.priceKAS.toLocaleString()}</span>
                  <span className="text-sm text-kaspa-green font-medium ml-0.5">KAS</span>
                  <p className="text-xs text-gray-500">{t.period}</p>
                </div>
              </div>
            </div>
            <ul className="space-y-3 text-sm flex-1">
              {t.features.map(f => <li key={f} className="flex items-start gap-2"><svg className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span className="text-gray-300">{f}</span></li>)}
            </ul>
            {t.missing.length>0 && <ul className="space-y-2 text-sm mt-6 pt-6 border-t border-white/5">{t.missing.map(f => <li key={f} className="flex items-start gap-2 opacity-40"><svg className="h-4 w-4 text-gray-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span className="text-gray-600">{f}</span></li>)}</ul>}
            <div className="mt-8">
              <button onClick={()=>handlePay(t)} className={`block w-full text-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${t.popular?'bg-kaspa-green text-black shadow-[0_0_20px_rgba(73,234,203,0.2)] hover:shadow-[0_0_40px_rgba(73,234,203,0.3)]':'bg-white/10 text-white border border-white/20 hover:bg-white/20'} active:scale-[0.97]`}>
                Pay {t.priceKAS.toLocaleString()} KAS
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel p-6 mt-10 text-center max-w-3xl mx-auto space-y-3">
        <p className="text-sm text-gray-400">All on-chain covenants are visible in the public registry. Paying for a tier adds an interactive UI panel and visibility.</p>
        <p className="text-xs text-gray-600 font-mono break-all">Treasury: {TREASURY}</p>
      </div>
    </div>
  );
}
