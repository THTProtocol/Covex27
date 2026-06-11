import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  Cpu, Zap, Code, Layers, Palette, ShieldCheck, Sparkles, Send, ArrowRight, ArrowLeft,
  Gamepad2, Wallet, Timer, Scale, Users, TrendingUp, FileText, Check, Crown,
  ChevronDown, Image, Type, Layout, Eye, Lock, Unlock, Plus, RefreshCw, Monitor,
  DollarSign, Coins, BarChart3, Gavel, Megaphone, Building2, Gift, Shuffle, Wrench
} from 'lucide-react';

const CATEGORIES = [
  { key: 'Predictive Markets', label: 'Predictive Markets', icon: TrendingUp, desc: 'Binary outcomes, event betting, futures', color: '#EC4899' },
  { key: 'Flash Covenants', label: 'Flash Covenants', icon: Timer, desc: 'Time-bound, rapid resolution, instant settle', color: '#EAB308' },
  { key: 'Tournaments', label: 'Tournaments', icon: Crown, desc: 'Brackets, leagues, elimination rounds', color: '#10B981' },
  { key: 'games', label: 'Games & Matches', icon: Gamepad2, desc: 'Chess, poker, connect4, skill duels', color: '#A855F7' },
  { key: 'Community Pools', label: 'Community Pools', icon: Wallet, desc: 'Shared pots, crowdfunding, community stakes', color: '#F97316' },
  { key: 'ZK Oracle Tools', label: 'ZK & Oracle Tools', icon: Zap, desc: 'ZK circuits, oracle feeds, verifiable compute', color: '#06B6D4' },
  { key: 'Escrow & Custody', label: 'Escrow & Custody', icon: Lock, desc: 'Conditional release, multisig, milestone payments', color: '#3B82F6' },
  { key: 'Structured Settlement', label: 'Structured Settlement', icon: Scale, desc: 'Vesting, timelocks, payment streams', color: '#14B8A6' },
  { key: 'Governance & DAO', label: 'Governance & DAO', icon: Users, desc: 'Voting, proposals, treasury management', color: '#EF4444' },
  { key: 'general', label: 'General / Custom', icon: FileText, desc: 'Custom logic, any covenant type', color: '#6B7280' },
];

const CIRCUIT_OPTIONS = [
  { id: 'none', label: 'None (Basic)', desc: 'Standard covenant without ZK proof requirements' },
  { id: 'merkle_membership', label: 'Merkle Membership', desc: 'Prove inclusion in a set without revealing members' },
  { id: 'range_proof', label: 'Range Proof', desc: 'Prove a value is within bounds without revealing it' },
  { id: 'chess_v1', label: 'Chess V1', desc: 'ZK-verified chess moves with FIDE rules' },
  { id: 'turn_timer', label: 'Turn Timer ZK', desc: 'ZK-verified liveness + per-turn timer validation' },
];

// Premade visual templates - like Canva presets, user cycles to preview
const VISUAL_TEMPLATES = [
  { id: 'dark-glass', name: 'Dark Glass', desc: 'Sleek dark with glass panels', bg: '#0c0c12', panel: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: '#e2e8f0', accent: '#49EACB' },
  { id: 'neon-night', name: 'Neon Night', desc: 'Purple + cyan neon glow', bg: '#0a0014', panel: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.20)', text: '#e0d4ff', accent: '#a855f7' },
  { id: 'gold-rush', name: 'Gold Rush', desc: 'Warm gold + dark wood', bg: '#1a1206', panel: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.20)', text: '#fef3c7', accent: '#f59e0b' },
  { id: 'ocean-depth', name: 'Ocean Depth', desc: 'Deep blue + teal gradients', bg: '#06121a', panel: 'rgba(20,184,166,0.08)', border: 'rgba(20,184,166,0.20)', text: '#ccfbf1', accent: '#14b8a6' },
  { id: 'blood-moon', name: 'Blood Moon', desc: 'Dark red + crimson accents', bg: '#1a0606', panel: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.20)', text: '#fecaca', accent: '#ef4444' },
  { id: 'forest', name: 'Emerald Forest', desc: 'Dark green + natural tones', bg: '#061a0f', panel: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.20)', text: '#dcfce7', accent: '#22c55e' },
  { id: 'minimal-white', name: 'Minimal White', desc: 'Clean white + thin borders', bg: '#f8fafc', panel: '#ffffff', border: 'rgba(0,0,0,0.06)', text: '#1e293b', accent: '#3b82f6' },
  { id: 'industrial', name: 'Industrial', desc: 'Steel gray + orange accents', bg: '#18181b', panel: 'rgba(161,161,170,0.06)', border: 'rgba(161,161,170,0.15)', text: '#d4d4d8', accent: '#f97316' },
];

export default function Deploy() {
  const navigate = useNavigate();
  const { address, sendPayment, isDevMode, devMode, DevConnectPanel } = useWallet();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [circuitId, setCircuitId] = useState('none');
  const [accentColor, setAccentColor] = useState('#49EACB');
  const [uiPreset, setUiPreset] = useState('dark-glass');
  const [templateIndex, setTemplateIndex] = useState(0);
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(false);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const currentTemplate = VISUAL_TEMPLATES[templateIndex];

  const cycleTemplate = (dir) => {
    setTemplateIndex((prev) => {
      const next = prev + dir;
      if (next < 0) return VISUAL_TEMPLATES.length - 1;
      if (next >= VISUAL_TEMPLATES.length) return 0;
      return next;
    });
    setAccentColor(VISUAL_TEMPLATES[(templateIndex + dir + VISUAL_TEMPLATES.length) % VISUAL_TEMPLATES.length].accent);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setStatus('creating');
    try {
      const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
      if (address && isDevMode && devMode?.privateKeyHex) {
        const scriptHex = 'aa20' + Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
        const deployRes = await fetch('/api/sign-and-broadcast', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            private_key_hex: devMode.privateKeyHex, deployer_addr: address, script_hex: scriptHex,
            tier: 'FREE', covenant_name: name.trim(), description: description.trim() || `${category || 'general'} covenant`,
            covenant_type: category || 'general', category: category || 'general', accent: accentColor,
            ui_preset: uiPreset, use_dev_mode: true, network: net,
            custom_ui_config: { theme: { accent: accentColor, preset: uiPreset }, category, circuit: circuitId !== 'none' ? circuitId : null },
          }),
        });
        const d = await deployRes.json();
        if (d.success && d.tx_id) {
          setResult({ success: true, txid: d.tx_id, message: 'Covenant deployed on-chain!' });
          setStatus('success');
          setTimeout(() => navigate(`/covenant/${d.tx_id}`), 2000);
          return;
        }
      }
      sessionStorage.setItem('pending_free_covenant', JSON.stringify({ name: name.trim(), description: description.trim(), category, network: net }));
      setResult({ success: true, pending: true, message: 'Covenant created! Pay a tier for on-chain deployment and visibility.' });
      setStatus('success');
      setShowUpgrade(true);
    } catch (e) { setResult({ success: false, error: e.message || 'Creation failed' }); setStatus('error'); }
  };

  if (status === 'success' && result) {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6"><Check size={36} className="text-emerald-400" /></div>
        <h1 className="text-2xl font-bold text-white mb-2">{result.pending ? 'Covenant Created!' : 'Deployed to Kaspa!'}</h1>
        <p className="text-gray-300 mb-6">{result.message}</p>
        {result.txid && <div className="glass-panel rounded-xl p-4 mb-6"><p className="text-xs font-mono text-gray-400 break-all">{result.txid}</p></div>}
        {showUpgrade ? (
          <div className="space-y-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 transition-all"><Crown size={20} /> Pay Tier for Top Visibility</Link>
            <br /><Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"><ArrowRight size={14} /> View in Explorer (Free)</Link>
          </div>
        ) : (
          <Link to={`/covenant/${result.txid}`} className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 transition-all"><Eye size={20} /> View Your Covenant</Link>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6"><ShieldCheck size={36} className="text-red-400" /></div>
        <h1 className="text-2xl font-bold text-white mb-2">Creation Failed</h1>
        <p className="text-red-400 mb-6">{result?.error}</p>
        <button onClick={() => { setStatus('idle'); setResult(null); }} className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold">Try Again</button>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-400 text-xs font-mono mb-4"><Layers size={14} /> FREE TIER COVENANT CREATOR</div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Create Your Covenant</h1>
        <p className="text-sm text-gray-400 max-w-lg mx-auto">Design and deploy on the Kaspa BlockDAG. Pay a tier for the full sandbox with Canva-like design tools.</p>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-[#49EACB] text-black' : 'bg-white/5 text-gray-500 border border-white/10'}`}>{s}</div>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-[#49EACB]' : 'bg-white/5'}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-gray-500 font-mono">{step === 1 ? 'Basics' : step === 2 ? 'Configure' : 'Design'}</span>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <label className="block"><span className="text-sm font-semibold text-white mb-2 block">Covenant Name *</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Kaspa Chess Duel Arena" className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#49EACB] focus:outline-none transition-all" autoFocus /></label>
            <label className="block"><span className="text-sm font-semibold text-white mb-2 block">Description</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your covenant rules, stakes, resolution logic..." rows={3} className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#49EACB] focus:outline-none transition-all resize-none" /></label>
          </div>
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Layers size={16} className="text-[#49EACB]" /> Choose Category</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setCategory(cat.key)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col items-start gap-1 ${category === cat.key ? 'border-[#49EACB] bg-[#49EACB]/10 ring-1 ring-[#49EACB]/20' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                  <cat.icon size={18} style={{ color: category === cat.key ? '#49EACB' : cat.color }} />
                  <span className="text-xs font-semibold text-white leading-tight">{cat.label}</span>
                  <span className="text-[9px] text-gray-500 leading-tight">{cat.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => { if (name.trim()) setStep(2); }} disabled={!name.trim()}
            className="w-full py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
            Continue <ArrowRight size={18} /></button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Zap size={16} className="text-[#49EACB]" /> ZK Circuit (Optional)</div>
            <p className="text-xs text-gray-400 mb-4">Select a ZK circuit for verifiable resolution. Paid tiers unlock the full sandbox with custom circuit composition.</p>
            <div className="grid grid-cols-2 gap-2">
              {CIRCUIT_OPTIONS.map(c => (
                <button key={c.id} onClick={() => setCircuitId(c.id)} className={`p-3 rounded-xl border text-left transition-all ${circuitId === c.id ? 'border-[#49EACB] bg-[#49EACB]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                  <div className="text-xs font-semibold text-white">{c.label}</div><div className="text-[9px] text-gray-500 mt-0.5">{c.desc}</div></button>))}
            </div>
            <div className="mt-4 p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/15 flex items-start gap-2">
              <Lock size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-300/80"><strong>Full ZK sandbox + custom circuit composer</strong> locked behind paid tiers. Pay any tier for the complete experience.</div></div>
          </div>
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Scale size={16} className="text-[#49EACB]" /> Fee & Resolution Config</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label><span className="text-xs text-gray-400 block mb-1">Platform Fee (%)</span><input type="number" value={feePercent} onChange={e => setFeePercent(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))} className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm focus:border-[#49EACB] focus:outline-none" /></label>
              <div className="flex flex-col gap-2 justify-end">
                <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={reusable} onChange={e => setReusable(e.target.checked)} className="accent-[#49EACB]" /> Reusable (multi-round)</label>
                <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={allowTopups} onChange={e => setAllowTopups(e.target.checked)} className="accent-[#49EACB]" /> Allow Top-Ups</label></div></div></div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">Back</button>
            <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-2xl bg-[#49EACB] text-black font-extrabold hover:brightness-110 transition-all">Next: Visual Design</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {/* PREMADE VISUAL TEMPLATE GALLERY */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Palette size={16} className="text-[#49EACB]" /> Visual Templates (Canva-Like Gallery)</div>
            <p className="text-xs text-gray-400 mb-4">Cycle through premade designs. Each template applies a complete look to your covenant. Paid tier unlocks full custom design.</p>

            {/* Template carousel with live preview */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 mb-4" style={{ background: currentTemplate.bg, minHeight: 280 }}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono uppercase tracking-wider opacity-60" style={{ color: currentTemplate.text }}>LIVE PREVIEW</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: currentTemplate.accent }} />
                    <span className="text-[10px] font-mono opacity-50" style={{ color: currentTemplate.text }}>{currentTemplate.name}</span>
                  </div>
                </div>
                {/* Preview card using template */}
                <div className="rounded-xl p-5" style={{ background: currentTemplate.panel, border: `1px solid ${currentTemplate.border}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: currentTemplate.accent + '20', color: currentTemplate.accent }}>
                      {(name || 'C')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold" style={{ color: currentTemplate.text }}>{name || 'Your Covenant'}</div>
                      <div className="text-[10px] opacity-50" style={{ color: currentTemplate.text }}>{category || 'category'} - {feePercent}% fee</div>
                    </div>
                  </div>
                  <div className="text-xs leading-relaxed mb-3 opacity-70" style={{ color: currentTemplate.text }}>
                    {description || 'Your covenant description will appear here. Stake rules, resolution logic, and payout terms are displayed clearly.'}
                  </div>
                  <div className="flex gap-2">
                    <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: currentTemplate.accent, color: currentTemplate.bg }}>INTERACT</div>
                    <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold border" style={{ borderColor: currentTemplate.border, color: currentTemplate.text }}>VIEW DETAILS</div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-between text-[9px] opacity-40 font-mono" style={{ borderColor: currentTemplate.border, color: currentTemplate.text }}>
                    <span>Kaspa BlockDAG</span>
                    <span>{feePercent}% fee - Non-custodial</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Template navigation */}
            <div className="flex items-center gap-3">
              <button onClick={() => cycleTemplate(-1)} className="p-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 transition-all"><ArrowLeft size={16} /></button>
              <div className="flex-1 grid grid-cols-4 sm:grid-cols-8 gap-2">
                {VISUAL_TEMPLATES.map((t, i) => (
                  <button key={t.id} onClick={() => { setTemplateIndex(i); setAccentColor(t.accent); }}
                    className={`h-10 rounded-lg border transition-all relative overflow-hidden ${i === templateIndex ? 'ring-2 ring-white border-white' : 'border-white/10 hover:border-white/30'}`}
                    style={{ background: t.bg }}
                    title={t.name}>
                    <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: t.accent }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold opacity-50" style={{ color: t.accent }}>
                      {i === templateIndex ? 'ACTIVE' : ''}
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={() => cycleTemplate(1)} className="p-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 transition-all"><ArrowRight size={16} /></button>
            </div>
            <div className="text-center mt-2">
              <span className="text-[10px] font-mono" style={{ color: currentTemplate.accent }}>{currentTemplate.name} - {currentTemplate.desc}</span>
            </div>
          </div>

          {/* Color + UI preset */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Layout size={16} className="text-[#49EACB]" /> Colors & Presets</div>
            <label className="block mb-3"><span className="text-xs text-gray-400 block mb-2">Accent Color</span>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-12 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer" />
                <div className="flex gap-1.5">
                  {['#49EACB', '#A855F7', '#E8AF34', '#3B82F6', '#EF4444', '#22C55E', '#F97316', '#EC4899', '#14B8A6', '#EAB308'].map(c => (
                    <button key={c} onClick={() => setAccentColor(c)} className="w-7 h-7 rounded-lg border transition-all" style={{ backgroundColor: c + '20', borderColor: accentColor === c ? c : 'transparent', boxShadow: accentColor === c ? `0 0 8px ${c}40` : 'none' }} />))}
                </div></div></label>
          </div>

          {!address && <div className="glass-panel rounded-2xl p-4 text-center"><p className="text-sm text-gray-400 mb-3">Connect a wallet to deploy on-chain</p><DevConnectPanel compact /></div>}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">Back</button>
            <button onClick={handleCreate} disabled={status === 'creating' || !name.trim()}
              className="flex-1 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 disabled:opacity-30 transition-all flex items-center justify-center gap-2">
              {status === 'creating' ? <><span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Creating...</> : <><Send size={18} /> Create Covenant</>}
            </button></div>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/10 transition-all"><Crown size={16} /> Pay a Tier for Full Sandbox</Link>
        <p className="text-[10px] text-gray-600 mt-2">Higher tiers = top visibility + full sandbox with Canva-like design tools + ZK circuit composition + custom images</p>
      </div>
    </div>
  );
}
