import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import CovexTerminal from '../components/CovexTerminal';
import { ArrowLeft, Code2, Paintbrush, Palette, Save, Crown, Star, Eye, Monitor } from 'lucide-react';

const isVerified = (c) => c?.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER';
const tierValue = (t) => ({ MAX: 3, PRO: 2, BUILDER: 1, FREE: 0 }[t] || 0);

const DEFAULT_UI_CONFIG = {
  primaryColor: '#49EACB', bgStyle: 'glass', layout: 'card',
  showWalletButton: true, showParamForm: true, showFeaturedBanner: false,
  customLogoUrl: '', titleOverride: '', descOverride: ''
};

export default function CovenantFix() {
  const { id } = useParams();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('terminal');
  const [config, setConfig] = useState(DEFAULT_UI_CONFIG);
  const [toast, setToast] = useState(null);
  const { address, balance, sendPayment, connecting, buildUri } = useWallet();
  const [covexPaidTier] = useState(() => localStorage.getItem('covex_paid_tier'));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/covenants?network=${localStorage.getItem('kaspaNetwork') || 'testnet-12'}`)
      .then(r => r.json()).then(d => {
        const found = (d.covenants || []).find(c => c.tx_id === id) || null;
        setCovenant(found);
      }).finally(() => setLoading(false));
  }, [id]);

  const isCreator = !!(address && covenant?.creator_addr && address === covenant.creator_addr);
  const effectiveTierVal = Math.max(
    tierValue(covenant?.verified_tier || 'FREE'), tierValue(covexPaidTier || 'FREE')
  );
  const canCustomize = isCreator && effectiveTierVal >= 1;
  const canBrand = isCreator && effectiveTierVal >= 2;
  const canMaxLayout = isCreator && effectiveTierVal >= 3;

  const buildTransparentUI = (cov, cfg) => {
    const primary = cfg.primaryColor || '#49EACB';
    const title = cfg.titleOverride || cov.name || 'Covenant';
    const desc = cfg.descOverride || cov.description || 'Fully transparent on-chain covenant.';
    const logic = cov.full_logic_summary || cov.description || 'Full on-chain logic and parameters disclosed.';
    const creator = cov.creator_addr || 'Unknown';
    const locked = (cov.amount_kaspa || 0).toLocaleString();
    const script = (cov.script_hash || '').slice(0,24)+'...';
    const tx = cov.tx_id || '';
    const cat = cov.category || 'General';
    const tier = cov.verified_tier || 'FREE';
    const ts = cov.timestamp ? new Date(cov.timestamp*1000).toLocaleString() : 'recent';
    const css = `:root{--primary:${primary}}body{font-family:system-ui,sans-serif;background:#0A0A0D;color:#E5E7EB;margin:0;padding:0}.glass{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px}.section{padding:18px 20px;margin-bottom:14px}.label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9CA3AF;font-weight:600}.mono{font-family:monospace;font-size:12px;word-break:break-all}.fact{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(255,255,255,.06);font-size:13px}h1{font-size:22px;margin:0 0 4px;color:#fff}.sub{color:#9CA3AF;font-size:12px}.stitle{font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-weight:600}.btn{background:var(--primary);color:#000;border:none;padding:12px 20px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body style="padding:16px;max-width:860px;margin:0 auto;background:#0A0A0D">
<div class="glass section"><div style="display:flex;align-items:center;gap:14px;margin-bottom:10px"><div style="width:42px;height:42px;border-radius:12px;background:${primary}22;color:${primary};display:flex;align-items:center;justify-content:center;font-weight:800">C</div><div><h1>${title}</h1><div class="sub">${cat} · ${tier} TIER</div></div></div><p>${desc}</p></div>
<div class="glass section"><div class="stitle">On-Chain Transparency</div><div class="fact"><span class="label">Creator</span><span class="mono">${creator}</span></div><div class="fact"><span class="label">Locked</span>${locked} KAS</div><div class="fact"><span class="label">Script Hash</span><span class="mono">${script}</span></div><div class="fact"><span class="label">TXID</span><span class="mono">${tx}</span></div><div class="fact"><span class="label">Deployed</span>${ts}</div></div>
<div class="glass section"><div class="stitle">Logic</div>${logic}</div>
<div class="glass section"><div class="stitle">Interact</div><button onclick="window.parent.postMessage({type:'COVENANT_EXECUTE'},'*')" class="btn" style="width:100%">Connect Wallet & Execute</button></div>
</body></html>`;
  };

  const publishCustomUI = async (useDefault=false) => {
    if (!isCreator || !covenant || !address) {
      setToast({type:'error',msg:'Only the creator can publish custom UI.'}); return;
    }
    const cfg = useDefault ? {...DEFAULT_UI_CONFIG,titleOverride:covenant.name,descOverride:'Fully transparent public view.'} : config;
    const html = buildTransparentUI(covenant, cfg);
    try {
      const payload = { custom_ui_code:html, signer_address:address, name:cfg.titleOverride||covenant.name,
        description:cfg.descOverride||covenant.description||'', game_type:cfg.game_type||'custom',
        fee_percent:cfg.fee_percent||2, pot_return_percent:cfg.pot_return_percent||98,
        reusable:cfg.reusable!==false, allow_topups:cfg.allow_topups||false,
        resolution_mode:'oracle', zk_circuit:cfg.zk_circuit||null };
      const res = await fetch(`/api/terminal-config/${covenant.tx_id}`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      if (res.ok) { setToast({type:'success',msg:'UI published! Refresh the covenant page to see it.'});
        window.dispatchEvent(new CustomEvent('covenant-ui-updated',{detail:id}));
      } else { setToast({type:'error',msg:'Failed to publish UI.'}); }
    } catch(e) { setToast({type:'error',msg:e.message}); }
  };

  if (loading) return <div className="p-20 text-center text-kaspa-green animate-pulse font-mono">LOADING...</div>;
  if (!covenant) return <div className="p-20 text-center"><p className="text-gray-300">Covenant not found.</p><Link to="/" className="text-kaspa-green mt-4 inline-block">Return to Explorer</Link></div>;
  if (!isCreator) return <div className="p-20 text-center"><p className="text-white text-lg font-bold">ACCESS DENIED</p><p className="text-gray-300 mt-2">Only the covenant creator can access the Fix editor.</p><p className="text-gray-300">Connect your creator wallet to continue.</p><Link to={`/covenant/${encodeURIComponent(id)}`} className="text-kaspa-green mt-4 inline-block">View Covenant</Link></div>;

  const previewStyle = { primaryColor:config.primaryColor, background:config.bgStyle==='glass'?'rgba(255,255,255,.03)':'#0A0A0D', borderColor:config.bgStyle==='glass'?'rgba(255,255,255,.08)':'#222' };

  return (<div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
    <Link to={`/covenant/${encodeURIComponent(id)}`} className="inline-flex items-center gap-2 text-gray-300 hover:text-white mb-6 font-mono text-sm uppercase"><ArrowLeft size={16}/>Back to Covenant</Link>
    
    <div className="flex items-center gap-4 mb-8">
      <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/30"><Paintbrush size={24} className="text-purple-400"/></div>
      <div><h1 className="text-2xl font-bold text-white">Fix UI</h1><p className="text-sm text-gray-300">{covenant.name||covenant.covenant_type||'Covenant'} — Creator Edit Mode</p></div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex items-center border-b border-white/5 mb-4">
          {[{id:'terminal',icon:Code2,label:'Terminal'},{id:'builder',icon:Paintbrush,label:'UI Builder'}].map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab===tab.id?'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green':'text-gray-300'}`}><tab.icon size={14}/>{tab.label}</button>
          ))}
        </div>
        
        {activeTab==='terminal' && <CovexTerminal covenantId={id} playMode={null} embedded />}
        
        {activeTab==='builder' && (<div className="space-y-4">
          <div className="space-y-2"><p className="text-xs text-gray-300 uppercase">Title Override</p><input value={config.titleOverride} onChange={e=>setConfig(s=>({...s,titleOverride:e.target.value}))} placeholder={covenant.name||'Covenant Name'} className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-kaspa-green/50"/></div>
          <div className="space-y-2"><p className="text-xs text-gray-300 uppercase">Description</p><input value={config.descOverride} onChange={e=>setConfig(s=>({...s,descOverride:e.target.value}))} placeholder={covenant.description||'Description'} className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-kaspa-green/50"/></div>
          <div className="space-y-2"><p className="text-xs text-gray-300 uppercase">Accent Color</p><div className="flex gap-2">{[{c:'#49EACB',n:'Green'},{c:'#8B5CF6',n:'Purple'},{c:'#F59E0B',n:'Gold'},{c:'#EF4444',n:'Red'},{c:'#3B82F6',n:'Blue'}].map(clr=>(<button key={clr.c} onClick={()=>setConfig(s=>({...s,primaryColor:clr.c}))} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-white"><span className="w-4 h-4 rounded-full" style={{backgroundColor:clr.c,boxShadow:`0 0 8px ${clr.c}40`}}/>{clr.n}</button>))}</div></div>
          <div className="space-y-2"><p className="text-xs text-gray-300 uppercase">Background Style</p><div className="flex gap-2">{[{v:'glass',n:'Glass'},{v:'dark',n:'Dark'},{v:'solid',n:'Solid'}].map(s=>(<button key={s.v} onClick={()=>setConfig(c=>({...c,bgStyle:s.v}))} className={`px-4 py-2 rounded-lg border text-xs font-bold ${config.bgStyle===s.v?'bg-kaspa-green/10 border-kaspa-green/30 text-kaspa-green':'border-white/10 text-gray-300 hover:bg-white/5'}`}>{s.n}</button>))}</div></div>
          
          <div className="space-y-2"><p className="text-xs text-gray-300 uppercase">Quick Presets</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>{setConfig(s=>({...s,titleOverride:'Transparent Public Dashboard',descOverride:'Everything there is to know - fully on-chain, no secrets.'}));setTimeout(()=>publishCustomUI(false),50)}} className="px-3 py-2 text-[10px] rounded-xl border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/5">Beautiful Dashboard</button>
              <button onClick={()=>{setConfig(s=>({...s,titleOverride:'Full Facts + Oracle',descOverride:'Complete on-chain disclosure: logic, payments, oracle attestations.'}));setTimeout(()=>publishCustomUI(false),50)}} className="px-3 py-2 text-[10px] rounded-xl border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/5">Full Facts</button>
              <button onClick={()=>{setConfig(s=>({...s,titleOverride:'Minimal View',descOverride:'Clean, transparent public interface.'}));setTimeout(()=>publishCustomUI(false),50)}} className="px-3 py-2 text-[10px] rounded-xl border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/5">Minimal</button>
              <button onClick={()=>publishCustomUI(true)} className="px-3 py-2 text-[10px] rounded-xl border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/5">1-Click Default</button>
            </div>
          </div>
          
          <button onClick={()=>publishCustomUI(false)} className="w-full py-4 bg-kaspa-green hover:bg-[#3bc2a6] text-black font-bold rounded-2xl shadow-[0_0_20px_rgba(73,234,203,0.2)] transition-all"><Save size={18}/>Publish UI</button>
        </div>)}
      </div>
      
      <div className="glass-panel rounded-3xl p-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Monitor size={16} className="text-kaspa-green"/>Live Preview</h3>
        <div className="rounded-2xl border p-6" style={{background:previewStyle.background,borderColor:previewStyle.borderColor}}>
          <h4 className="text-white font-bold text-lg mb-1">{config.titleOverride||covenant.name||'Covenant'}</h4>
          <p className="text-sm text-gray-200 mb-4">{config.descOverride||covenant.description||'Covenant deployed on Kaspa.'}</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5"><p className="text-[10px] text-gray-300">Locked</p><p className="text-sm font-mono text-white">{(covenant.amount_kaspa||0).toFixed(2)} KAS</p></div>
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5"><p className="text-[10px] text-gray-300">Type</p><p className="text-sm font-mono text-white">{covenant.covenant_type||'P2SH'}</p></div>
          </div>
          <button disabled className="w-full py-2.5 rounded-xl text-sm font-bold uppercase" style={{backgroundColor:config.primaryColor,color:'#000'}}>Connect Wallet to Execute</button>
        </div>
        <p className="text-[10px] text-gray-500 mt-3 text-center">Only the creator sees this editor. Regular users see the published UI on the covenant page.</p>
      </div>
    </div>
    
    {toast && <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-xl text-sm font-bold ${toast.type==='success'?'bg-emerald-500 text-white':'bg-red-500 text-white'} shadow-lg`} onClick={()=>setToast(null)}>{toast.msg}</div>}
  </div>);
}
