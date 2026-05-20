import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import LegalModal from '../components/LegalModal';

const DEPLOYER = 'kaspatest:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq';

export default function CreateCovenant() {
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { address, sendPayment, connecting, buildUri } = useWallet();

  const compile = async () => {
    if (!code.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/compile', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({code}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
      setResult(d);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const deployUri = useMemo(() => result?.script_template_hash ? buildUri(DEPLOYER, 1, {scriptHash:result.script_template_hash}) : null, [result,buildUri]);

  const handleDeploy = async () => {
    if (!result?.script_template_hash) return;
    if (address) { try { await sendPayment(DEPLOYER, 1e8, {scriptHash:result.script_template_hash}); } catch(_) { if(deployUri) window.location.href=deployUri; } }
    else if (deployUri) window.location.href=deployUri;
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      {!accepted && <LegalModal onAccept={()=>setAccepted(true)}/>}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-kaspa-green transition-colors">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg> Explorer
      </Link>
      <div className="glass p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-kaspa-gold/10 border border-kaspa-gold/30 flex items-center justify-center">
            <svg className="h-5 w-5 text-kaspa-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div><h1 className="text-2xl font-semibold text-white tracking-tight">Create Covenant</h1><p className="text-sm text-gray-500">Write SilverScript and deploy to Kaspa</p></div>
        </div>
      </div>
      <div className="glass p-8 space-y-6">
        <textarea value={code} onChange={e=>{setCode(e.target.value);setResult(null);setError(null);}} spellCheck={false}
          placeholder="// SilverScript covenant\ncovenant TransferWithTimeout {\n    payer: Address;\n    payee: Address;\n    amount: u64;\n    timeout: DaaScore;\n}"
          className="w-full h-72 px-5 py-4 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-sm leading-relaxed placeholder:text-gray-700 focus:outline-none focus:border-kaspa-gold/50 focus:ring-1 focus:ring-kaspa-gold/20 transition-colors resize-y"/>
        <button onClick={compile} disabled={!code.trim()||loading}
          className={`w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${code.trim()&&!loading?'bg-kaspa-gold text-black shadow-[0_0_30px_rgba(232,175,52,0.25)] hover:shadow-[0_0_50px_rgba(232,175,52,0.4)] active:scale-[0.97]':'bg-white/[0.04] text-gray-600 border border-white/5 cursor-not-allowed'}`}>
          {loading?<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Compiling</>:<><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Compile Covenant</>}
        </button>
      </div>
      {error && <div className="glass p-6 border-red-500/30"><div className="flex items-start gap-3"><svg className="h-5 w-5 text-red-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><div><p className="text-sm font-semibold text-red-400">Compilation Failed</p><p className="text-xs text-red-300/80 mt-1 font-mono whitespace-pre-wrap">{error}</p></div></div></div>}
      {result && <div className="glass p-8 space-y-6">
        <div className="flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"><svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div><h2 className="text-lg font-semibold text-white">Compilation Successful</h2></div>
        <div><p className="text-xs text-gray-500 mb-1.5">Script Template Hash</p><div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-sm text-kaspa-green break-all">{result.script_template_hash}</div></div>
        {result.bytecode && <div><p className="text-xs text-gray-500 mb-1.5">Bytecode <span className="text-gray-600">({result.bytecode.length} hex)</span></p><div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-xs text-gray-400 break-all max-h-32 overflow-y-auto">{result.bytecode}</div></div>}
        <div className="space-y-3">
          {deployUri && (<>
            <button onClick={handleDeploy} disabled={connecting} className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm shadow-[0_0_30px_rgba(73,234,203,0.25)] hover:shadow-[0_0_50px_rgba(73,234,203,0.4)] hover:brightness-110 active:scale-[0.97] transition-all duration-200 disabled:opacity-50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2l3 7 7 1-5 4 2 7-7-4-7 4 2-7-5-4 7-1z"/></svg>
              {address ? (connecting?'Sending':'Deploy via Wallet') : 'Deploy (Open Wallet)'}
            </button>
            <div className="p-4 rounded-xl bg-black/30 border border-white/5 font-mono text-xs text-gray-400 break-all"><span className="text-gray-600">URI: </span>{deployUri}</div>
          </>)}
        </div>
      </div>}
    </div>
  );
}
