import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';

const KAS = (s) => (s/1e8).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:8});

export default function CovenantInteractive() {
  const { id } = useParams();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState('');
  const { address, sendPayment, connecting, buildUri } = useWallet();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/covenants');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!cancelled) { setCovenant(d.covenants.find(c=>c.tx_id===id)||null); setLoading(false); }
      } catch(e) { if (!cancelled) { setError(e.message); setLoading(false); } }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const parsedAmount = useMemo(() => {
    if (!amountInput.trim()) return { value: 0, valid: true };
    const n = parseFloat(amountInput);
    if (isNaN(n) || n<=0) return { value:0, valid:false, reason:'Enter a valid amount' };
    if (n>1e9) return { value:0, valid:false, reason:'Amount too large' };
    return { value:n, valid:true };
  }, [amountInput]);

  const walletUri = useMemo(() => {
    if (!covenant?.address || parsedAmount.value<=0||!parsedAmount.valid) return null;
    return buildUri(covenant.address, parsedAmount.value);
  }, [covenant,parsedAmount,buildUri]);

  const handleInteract = async () => {
    if (!covenant?.address||parsedAmount.value<=0) return;
    if (address) { try { await sendPayment(covenant.address, parsedAmount.value*1e8); } catch(_) { if(walletUri) window.location.href=walletUri; } }
    else if (walletUri) window.location.href=walletUri;
  };

  if (loading) return <div className="w-full max-w-3xl mx-auto px-4 py-16 animate-pulse space-y-6"><div className="h-8 bg-white/[0.06] rounded-lg w-1/2"/><div className="h-64 bg-white/[0.03] rounded-2xl"/></div>;

  if (error) return <div className="w-full max-w-3xl mx-auto px-4 py-16 text-center"><div className="glass px-10 py-12"><p className="text-red-400 text-sm">{error}</p><Link to="/" className="inline-block mt-4 text-kaspa-green text-sm hover:underline">Back to Explorer</Link></div></div>;

  if (!covenant) return <div className="w-full max-w-3xl mx-auto px-4 py-16 text-center"><div className="glass px-10 py-12"><p className="text-gray-400 text-sm">Covenant not found.</p><p className="text-gray-600 text-xs mt-1 font-mono">ID: {id}</p><Link to="/" className="inline-block mt-4 text-kaspa-green text-sm hover:underline">Back to Explorer</Link></div></div>;

  const isFunded = covenant.amount_kaspa > 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-kaspa-green transition-colors">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg> Explorer
      </Link>

      <div className="glass p-8 space-y-6">
        <div className="flex items-start gap-4">
          {covenant.image ? <img src={covenant.image} alt="" className="h-16 w-16 rounded-xl object-cover border border-white/10 shrink-0"/> : <div className="h-16 w-16 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0"><svg className="h-6 w-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>}
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{covenant.category}</p>
            <h1 className="text-2xl font-semibold text-white">{covenant.name}</h1>
            <p className="text-sm text-gray-400 mt-1">{covenant.description||covenant.desc}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[['Tier',covenant.tier||'FREE'],['Fee',`${(covenant.price_kas||covenant.tier_kas||0).toLocaleString()} KAS`],['Locked',`${KAS(covenant.amount_sompi||0)} KAS`],['Category',covenant.category]].map(([l,v])=>(<div key={l}><p className="text-xs text-gray-500 mb-0.5">{l}</p><p className="text-sm text-white font-medium">{v}</p></div>))}
        </div>
        <div><p className="text-xs text-gray-500 mb-1">Address</p><p className="font-mono text-sm text-gray-300 break-all bg-black/30 rounded-lg px-4 py-3 border border-white/5">{covenant.address}</p></div>
      </div>

      {isFunded ? (
        <div className="glass p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30 flex items-center justify-center"><svg className="h-4 w-4 text-kaspa-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z"/></svg></div>
            <div><h2 className="text-lg font-semibold text-white">Interact with Covenant</h2><p className="text-xs text-gray-500">Enter an amount and send via your connected wallet</p></div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2">Amount (KAS)</label>
            <div className="relative">
              <input type="number" min="0" step="any" value={amountInput} onChange={e=>{setAmountInput(e.target.value);setAmountError('')}} placeholder="0.00" className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white text-lg font-mono placeholder:text-gray-600 focus:outline-none focus:border-kaspa-green/50 focus:ring-1 focus:ring-kaspa-green/20 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">KAS</span>
            </div>
            {amountError && <p className="text-xs text-red-400 mt-1.5">{amountError}</p>}
          </div>
          {walletUri ? (<>
            <button onClick={handleInteract} disabled={connecting} className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm shadow-[0_0_30px_rgba(73,234,203,0.25)] hover:shadow-[0_0_50px_rgba(73,234,203,0.4)] hover:brightness-110 active:scale-[0.97] transition-all duration-200 disabled:opacity-50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              {address ? (connecting?'Sending':'Interact via Wallet') : 'Open Wallet'}
            </button>
            <div className="p-3 rounded-xl bg-black/30 border border-white/5 font-mono text-xs text-gray-400 break-all"><span className="text-gray-600">URI: </span>{walletUri}</div>
          </>) : (<button disabled className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white/[0.04] text-gray-600 font-semibold text-sm border border-white/5 cursor-not-allowed">Enter Amount to Interact</button>)}
        </div>
      ) : (
        <div className="glass p-8 text-center"><p className="text-gray-500 text-sm">This covenant is unfunded. Fund it to enable interactive execution.</p></div>
      )}
    </div>
  );
}
