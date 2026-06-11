import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  Cpu, Zap, Code, Layers, Palette, ShieldCheck, Sparkles, Send, ArrowRight,
  Gamepad2, Wallet, Timer, Scale, Users, TrendingUp, FileText, Check, Crown,
  ChevronDown, Image, Type, Layout, Eye, Lock, Unlock, Plus
} from 'lucide-react';

const CATEGORIES = [
  { key: 'games', label: 'Games & Matches', icon: Gamepad2, desc: 'Chess, poker, connect4, RPS, skill duels', color: '#A855F7' },
  { key: 'escrow', label: 'Escrow & Milestone', icon: Lock, desc: 'Conditional release, milestone payments, multisig', color: '#3B82F6' },
  { key: 'predictive', label: 'Prediction Markets', icon: TrendingUp, desc: 'Binary options, event outcomes, betting pools', color: '#EC4899' },
  { key: 'tournament', label: 'Tournaments', icon: Crown, desc: 'Brackets, leagues, elimination rounds', color: '#10B981' },
  { key: 'structured', label: 'Structured Products', icon: Scale, desc: 'Vesting, timelocks, collateralized loans', color: '#14B8A6' },
  { key: 'governance', label: 'Governance & DAO', icon: Users, desc: 'Voting, proposals, treasury management', color: '#EF4444' },
  { key: 'community', label: 'Community Pools', icon: Wallet, desc: 'Shared pots, crowdfunding, community stakes', color: '#F97316' },
  { key: 'oracle', label: 'Oracle & ZK Powered', icon: Zap, desc: 'ZK circuits, oracle resolution, verifiable compute', color: '#06B6D4' },
  { key: 'flash', label: 'Flash Covenants', icon: Timer, desc: 'Time-bound, rapid resolution, instant settle', color: '#EAB308' },
  { key: 'general', label: 'General / Custom', icon: FileText, desc: 'Custom logic, any covenant type', color: '#6B7280' },
];

const CIRCUIT_OPTIONS = [
  { id: 'none', label: 'None (Basic)', desc: 'Standard covenant without ZK proof requirements' },
  { id: 'merkle_membership', label: 'Merkle Membership', desc: 'Prove inclusion in a set without revealing members' },
  { id: 'range_proof', label: 'Range Proof', desc: 'Prove a value is within bounds without revealing it' },
  { id: 'chess_v1', label: 'Chess V1', desc: 'ZK-verified chess moves with FIDE rules' },
  { id: 'timelock_absolute', label: 'Absolute Timelock', desc: 'Time-based lock with ZK proof of elapsed time' },
];

const UI_PRESETS = [
  { id: 'dark', label: 'Dark Glass', desc: 'Sleek dark mode with glass effect', bg: '#0c0c12' },
  { id: 'minimal', label: 'Minimal', desc: 'Clean white space, sharp typography', bg: '#ffffff' },
  { id: 'game', label: 'Game Lobby', desc: 'Bold colors, large buttons, timer display', bg: '#1a0a2e' },
  { id: 'escrow', label: 'Escrow Panel', desc: 'Professional layout with status tracking', bg: '#0a1a2e' },
];

export default function Deploy() {
  const navigate = useNavigate();
  const { address, signMessage, sendPayment, isDevMode, devMode, DevConnectPanel } = useWallet();

  // Covenant creation state
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [circuitId, setCircuitId] = useState('none');
  const [accentColor, setAccentColor] = useState('#49EACB');
  const [uiPreset, setUiPreset] = useState('dark');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(false);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const selectedCategory = CATEGORIES.find(c => c.key === category);
  const selectedCircuit = CIRCUIT_OPTIONS.find(c => c.id === circuitId);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setStatus('creating');

    try {
      const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
      const payload = {
        name: name.trim(),
        description: description.trim() || `A ${category || 'general'} covenant on Kaspa ${net}`,
        covenant_type: category || 'general',
        category: category || 'general',
        network: net,
        creator_addr: address || 'anonymous',
        fee_percent: feePercent,
        reusable,
        allow_topups: allowTopups,
        zk_circuit: circuitId !== 'none' ? circuitId : null,
        accent: accentColor,
        ui_preset: uiPreset,
        custom_ui_config: {
          theme: { accent: accentColor, preset: uiPreset },
          category: category,
          circuit: circuitId !== 'none' ? circuitId : null,
        },
      };

      // Try creating through backend if wallet connected with dev mode
      if (address && isDevMode && devMode?.privateKeyHex) {
        const scriptHex = 'aa20' + Array.from({length: 32}, () => 
          Math.floor(Math.random() * 16).toString(16)).join('');
        
        const deployRes = await fetch('/api/sign-and-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            private_key_hex: devMode.privateKeyHex,
            deployer_addr: address,
            script_hex: scriptHex,
            tier: 'FREE',
            covenant_name: payload.name,
            description: payload.description,
            covenant_type: payload.covenant_type,
            category: payload.category,
            accent: payload.accent,
            ui_preset: payload.ui_preset,
            use_dev_mode: true,
            network: net,
            custom_ui_config: payload.custom_ui_config,
          }),
        });
        
        const deployJson = await deployRes.json();
        if (deployJson.success && deployJson.tx_id) {
          setResult({ success: true, txid: deployJson.tx_id, message: 'Covenant deployed on-chain!' });
          setStatus('success');
          setTimeout(() => navigate(`/covenant/${deployJson.tx_id}`), 2000);
          return;
        }
      }

      // Fallback: save to pending config, redirect to pricing for visibility
      sessionStorage.setItem('pending_free_covenant', JSON.stringify(payload));
      setResult({ success: true, pending: true, message: 'Covenant created! Pay a tier for on-chain visibility.' });
      setStatus('success');
      setShowUpgrade(true);
    } catch (e) {
      setResult({ success: false, error: e.message || 'Creation failed' });
      setStatus('error');
    }
  };

  if (status === 'success' && result) {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
          <Check size={36} className="text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          {result.pending ? 'Covenant Created!' : 'Deployed to Kaspa!'}
        </h1>
        <p className="text-gray-300 mb-6">{result.message}</p>
        {result.txid && (
          <div className="glass-panel rounded-xl p-4 mb-6">
            <p className="text-xs font-mono text-gray-400 break-all">{result.txid}</p>
          </div>
        )}
        {showUpgrade ? (
          <div className="space-y-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 transition-all">
              <Crown size={20} /> Pay Tier for Top Visibility
            </Link>
            <br />
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <ArrowRight size={14} /> View in Explorer (Free)
            </Link>
          </div>
        ) : (
          <Link to={`/covenant/${result.txid}`} className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 transition-all">
            <Eye size={20} /> View Your Covenant
          </Link>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
          <ShieldCheck size={36} className="text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Creation Failed</h1>
        <p className="text-red-400 mb-6">{result?.error}</p>
        <button onClick={() => { setStatus('idle'); setResult(null); }} className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* HEADER */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-400 text-xs font-mono mb-4">
          <Layers size={14} /> FREE TIER COVENANT CREATOR
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
          Create Your Covenant
        </h1>
        <p className="text-sm text-gray-400 max-w-lg mx-auto">
          Design and deploy a free covenant on the Kaspa BlockDAG.
          Pay for a tier later to unlock full visibility and custom design tools.
        </p>
      </div>

      {/* STEP INDICATOR */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step >= s ? 'bg-[#49EACB] text-black' : 'bg-white/5 text-gray-500 border border-white/10'
            }`}>{s}</div>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-[#49EACB]' : 'bg-white/5'}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-gray-500 font-mono">
          {step === 1 ? 'Name & Type' : step === 2 ? 'Configure' : 'Design'}
        </span>
      </div>

      {/* STEP 1: Name + Category + Description */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-white mb-2 block">Covenant Name *</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Kaspa Chess Duel Arena"
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#49EACB] focus:outline-none transition-all"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white mb-2 block">Description</span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your covenant rules, stakes, resolution logic..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#49EACB] focus:outline-none transition-all resize-none"
              />
            </label>
          </div>

          {/* CATEGORY SELECTION */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Layers size={16} className="text-[#49EACB]" /> Choose Category
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col items-start gap-1 ${
                    category === cat.key
                      ? 'border-[#49EACB] bg-[#49EACB]/10 ring-1 ring-[#49EACB]/20'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <cat.icon size={18} style={{ color: category === cat.key ? '#49EACB' : cat.color }} />
                  <span className="text-xs font-semibold text-white leading-tight">{cat.label}</span>
                  <span className="text-[9px] text-gray-500 leading-tight">{cat.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => { if (name.trim()) setStep(2); }}
            disabled={!name.trim()}
            className="w-full py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            Continue <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* STEP 2: ZK Circuit + Fee Config */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Zap size={16} className="text-[#49EACB]" /> ZK Circuit (Optional)
            </div>
            <p className="text-xs text-gray-400 mb-4">Select a ZK circuit for verifiable resolution. All circuits available. Paid tiers unlock the full sandbox with custom circuit composition.</p>
            <div className="grid grid-cols-2 gap-2">
              {CIRCUIT_OPTIONS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCircuitId(c.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    circuitId === c.id
                      ? 'border-[#49EACB] bg-[#49EACB]/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <div className="text-xs font-semibold text-white">{c.label}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{c.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/15 flex items-start gap-2">
              <Lock size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-300/80">
                <strong>Full ZK sandbox + custom circuit composer</strong> locked behind paid tiers.
                Pay any tier (BUILDER/PRO/MAX) for the complete experience.
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Scale size={16} className="text-[#49EACB]" /> Fee & Resolution Config
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>
                <span className="text-xs text-gray-400 block mb-1">Platform Fee (%)</span>
                <input type="number" value={feePercent} onChange={e => setFeePercent(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm focus:border-[#49EACB] focus:outline-none" />
              </label>
              <div className="flex flex-col gap-2 justify-end">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={reusable} onChange={e => setReusable(e.target.checked)} className="accent-[#49EACB]" /> Reusable (multi-round)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={allowTopups} onChange={e => setAllowTopups(e.target.checked)} className="accent-[#49EACB]" /> Allow Top-Ups
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">
              Back
            </button>
            <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-2xl bg-[#49EACB] text-black font-extrabold hover:brightness-110 transition-all">
              Next: Design UI
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: UI Design + Color */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Palette size={16} className="text-[#49EACB]" /> Visual Design (Free Tier)
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Choose a color and preset. Paid tiers unlock the full Canva-like design sandbox with custom layouts, images, fonts, and interactive components.
            </p>

            {/* Color picker */}
            <label className="block mb-4">
              <span className="text-xs text-gray-400 block mb-2">Accent Color</span>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  className="w-12 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer" />
                <div className="flex gap-1.5">
                  {['#49EACB', '#A855F7', '#E8AF34', '#3B82F6', '#EF4444', '#22C55E', '#F97316', '#EC4899'].map(c => (
                    <button key={c} onClick={() => setAccentColor(c)}
                      className="w-8 h-8 rounded-lg border transition-all" style={{
                        backgroundColor: c + '20',
                        borderColor: accentColor === c ? c : 'transparent',
                        boxShadow: accentColor === c ? `0 0 8px ${c}40` : 'none',
                      }} />
                  ))}
                </div>
              </div>
            </label>

            {/* UI Presets */}
            <label className="block">
              <span className="text-xs text-gray-400 block mb-2">UI Preset</span>
              <div className="grid grid-cols-2 gap-2">
                {UI_PRESETS.map(p => (
                  <button key={p.id} onClick={() => setUiPreset(p.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      uiPreset === p.id
                        ? 'border-[#49EACB] bg-[#49EACB]/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}>
                    <div className="text-xs font-semibold text-white">{p.label}</div>
                    <div className="text-[9px] text-gray-500 mt-0.5">{p.desc}</div>
                  </button>
                ))}
              </div>
            </label>

            {/* Live preview */}
            <div className="mt-4 p-4 rounded-xl border border-white/10" style={{ background: `${accentColor}08` }}>
              <div className="text-xs text-gray-500 mb-2 font-mono uppercase tracking-wider">LIVE PREVIEW</div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: accentColor + '20', border: `1px solid ${accentColor}40`, color: accentColor }}>
                  {(name || 'C')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{name || 'Your Covenant'}</div>
                  <div className="text-[10px] text-gray-400">{category || 'general'} · {feePercent}% fee</div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/15 flex items-start gap-2">
              <Crown size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-300/80">
                <strong>Full Canva-like design sandbox</strong> (custom images, drag-and-drop layouts, font selection, interactive components, device preview) unlocked with any paid tier.
              </div>
            </div>
          </div>

          {!address && (
            <div className="glass-panel rounded-2xl p-4 text-center">
              <p className="text-sm text-gray-400 mb-3">Connect a wallet to deploy on-chain</p>
              <DevConnectPanel compact />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={status === 'creating' || !name.trim()}
              className="flex-1 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 disabled:opacity-30 transition-all flex items-center justify-center gap-2"
            >
              {status === 'creating' ? (
                <><span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Creating...</>
              ) : (
                <><Send size={18} /> Create Covenant</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* PAY TO UPGRADE BANNER */}
      <div className="mt-8 text-center">
        <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/10 transition-all">
          <Crown size={16} /> Pay a Tier for Full Visibility + Sandbox
        </Link>
        <p className="text-[10px] text-gray-600 mt-2">
          Higher tiers = more visibility on Explorer + full Canva-like design tools + ZK circuit composition
        </p>
      </div>
    </div>
  );
}
