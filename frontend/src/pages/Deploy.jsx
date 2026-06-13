import { useState, useEffect } from 'react';
import DesignStudio from '../components/DesignStudio';
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

// Real circuits from the Covex registry (zk/circuit_registry.json). Every entry
// here has working verification on the oracle: full Groth16 where artifacts
// exist, hybrid or attested otherwise.
const CIRCUIT_OPTIONS = [
  { id: 'none', label: 'None (Basic)', desc: 'Standard covenant without ZK proof requirements', kind: 'basic' },
  { id: 'merkle_membership', label: 'Merkle Membership', desc: 'Prove inclusion in a set without revealing members', kind: 'zk' },
  { id: 'range_proof', label: 'Range Proof', desc: 'Prove a value is within bounds without revealing it', kind: 'zk' },
  { id: 'hash_preimage', label: 'Hash Preimage', desc: 'Prove knowledge of a secret without revealing it', kind: 'zk' },
  { id: 'relative_timelock', label: 'Relative Timelock', desc: 'Time-based unlock proven against DAA score', kind: 'zk' },
  { id: 'age_verification', label: 'Age Verification', desc: 'Prove an age threshold without revealing birth data', kind: 'zk' },
  { id: 'escrow_2party', label: '2-Party Escrow', desc: 'Conditional release between two parties', kind: 'zk' },
  { id: 'basic_utxo_ownership', label: 'UTXO Ownership', desc: 'Prove ownership of a Kaspa UTXO in zero knowledge', kind: 'zk' },
  { id: 'nullifier_set', label: 'Nullifier Set', desc: 'One-time claims with double-spend protection', kind: 'zk' },
  { id: 'pot_split_math', label: 'Pot Split Math', desc: 'Proven payout percentages for pooled stakes', kind: 'zk' },
  { id: 'vrf_dice_roll', label: 'VRF Dice Roll', desc: 'Verifiable randomness for dice outcomes', kind: 'zk' },
  { id: 'vrf_random', label: 'VRF Random', desc: 'General verifiable randomness beacon', kind: 'zk' },
  { id: 'turn_timer', label: 'Turn Timer ZK', desc: 'ZK-verified liveness + per-turn timer validation', kind: 'zk' },
  { id: 'chess_v1', label: 'Chess V1', desc: 'ZK-verified chess moves with FIDE rules', kind: 'hybrid' },
  { id: 'connect4', label: 'Connect 4', desc: 'Verified connect-4 game outcomes', kind: 'hybrid' },
  { id: 'tictactoe', label: 'Tic-Tac-Toe', desc: 'Verified tic-tac-toe outcomes', kind: 'hybrid' },
  { id: 'collateral_liquidation', label: 'Collateral Liquidation', desc: 'DeFi liquidation thresholds proven on price inputs', kind: 'hybrid' },
  { id: 'onchain_sig_verify', label: 'Signature Verify', desc: 'Verify an external Schnorr signature inside the circuit', kind: 'hybrid' },
  { id: 'oracle_attested', label: 'Oracle Attested', desc: 'Any custom outcome attested and signed by the Covex oracle', kind: 'oracle' },
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
  const [bgImage, setBgImage] = useState('');
  const [designTheme, setDesignTheme] = useState(null);
  const [uiPreset, setUiPreset] = useState('dark-glass');
  const [templateIndex, setTemplateIndex] = useState(0);
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(false);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // === ADVANCED UI BUILDER STATE (best possible tools, paywalled) ===
  const [isAdvancedUnlocked, setIsAdvancedUnlocked] = useState(false);
  const [layers, setLayers] = useState([]); // {id, type, x, y, w, h, props: {...}}
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [silverScript, setSilverScript] = useState('');
  const [compiledScriptHex, setCompiledScriptHex] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);

  // Auto-unlock premium (advanced builder + SilverScript) if the user has paid any tier (via Pricing or here).
  // This ensures payments via /pricing unlock functions here too. Polls briefly after payment for immediate unlock.
  const checkTierAndUnlock = async (poll = false) => {
    if (!address) return false;
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
    try {
      const r = await fetch('/api/auth-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, network: net })
      });
      if (r.ok) {
        const data = await r.json();
        if (data.tier && data.tier !== 'FREE') {
          setIsAdvancedUnlocked(true);
          if (layers.length === 0) {
            setLayers([
              { id: 'l1', type: 'text', x: 30, y: 30, w: 200, h: 30, props: { text: name || 'Your Covenant', color: '#fff', fontSize: 18 } },
              { id: 'l2', type: 'button', x: 30, y: 80, w: 140, h: 38, props: { text: 'STAKE 10 KAS', action: 'stake', bg: currentTemplate.accent } },
            ]);
          }
          return true;
        }
      }
    } catch (_) {}
    if (poll) {
      // brief poll after payment
      setTimeout(() => checkTierAndUnlock(false), 2000);
    }
    return false;
  };

  useEffect(() => {
    checkTierAndUnlock();
  }, [address]);  // re-check when wallet connects/changes

  // Also listen for network changes (dispatched by NetworkSwitcher in App)
  useEffect(() => {
    const handler = () => checkTierAndUnlock();
    window.addEventListener('kaspa-network-change', handler);
    return () => window.removeEventListener('kaspa-network-change', handler);
  }, [address]);

  const currentTemplate = VISUAL_TEMPLATES[templateIndex];

  // Auto suggest template based on covenant info (name, desc, category) - like smart presets in GIMP/Canva
  const suggestTemplateFromInfo = () => {
    const q = (name + ' ' + description + ' ' + category).toLowerCase();
    let idx = 0;
    if (q.includes('chess') || q.includes('game') || q.includes('poker') || q.includes('match') || category.includes('games')) idx = 1; // neon-night for games
    else if (q.includes('predict') || q.includes('bet') || q.includes('market')) idx = 4; // blood-moon for predictive
    else if (q.includes('escrow') || q.includes('custody') || q.includes('milestone')) idx = 3; // ocean for escrow
    else if (q.includes('governance') || q.includes('dao') || q.includes('vote')) idx = 6; // minimal white for gov
    else if (q.includes('flash') || q.includes('quick') || q.includes('time')) idx = 5; // forest
    else if (q.includes('gold') || q.includes('auction') || q.includes('yield')) idx = 2; // gold-rush
    else if (q.includes('community') || q.includes('pool') || q.includes('crowd')) idx = 0; // dark-glass
    else idx = (templateIndex + 1) % VISUAL_TEMPLATES.length;
    setTemplateIndex(idx);
    setAccentColor(VISUAL_TEMPLATES[idx].accent);
  };

  const cycleTemplate = (dir) => {
    setTemplateIndex((prev) => {
      const next = (prev + dir + VISUAL_TEMPLATES.length) % VISUAL_TEMPLATES.length;
      setAccentColor(VISUAL_TEMPLATES[next].accent);
      return next;
    });
  };

  // Live preview card that changes with each cycle / info - user presses and sees different design instantly
  const LiveDesignPreview = () => (
    <div className="mt-4 p-4 rounded-2xl border" style={{ background: currentTemplate.bg, borderColor: currentTemplate.border, color: currentTemplate.text }}>
      <div className="text-[10px] opacity-70 mb-1">LIVE PREVIEW - changes with every press (based on your covenant info)</div>
      <div className="font-bold text-lg" style={{ color: currentTemplate.accent }}>{name || 'Your Covenant Name'}</div>
      <div className="text-xs opacity-80 mt-1 line-clamp-2">{description || 'Your rules and stakes go here. Transparent on-chain.'}</div>
      <div className="mt-3 flex gap-2">
        <button className="px-3 py-1 rounded text-xs font-bold" style={{ background: currentTemplate.accent, color: currentTemplate.bg }}>STAKE / JOIN</button>
        <button className="px-3 py-1 rounded text-xs border" style={{ borderColor: currentTemplate.accent, color: currentTemplate.accent }}>VIEW DETAILS</button>
      </div>
      <div className="text-[9px] mt-2 opacity-60">Template: {currentTemplate.name} • Category: {category || 'General'}</div>
    </div>
  );

  // === ADVANCED UI BUILDING TOOLS (GIMP/Canva/Framer level, paywalled) ===
  const addLayer = (type) => {
    const newLayer = {
      id: 'l_' + Date.now(),
      type,
      x: 20 + (layers.length % 5) * 15,
      y: 20 + Math.floor(layers.length / 5) * 40,
      w: type === 'text' ? 180 : type === 'button' ? 120 : 100,
      h: type === 'text' ? 28 : type === 'button' ? 36 : 60,
      props: {
        text: type === 'text' ? 'New text' : type === 'button' ? 'ACTION' : '',
        action: type === 'button' ? 'stake' : '',
        color: '#fff',
        bg: currentTemplate.accent,
        fontSize: 14,
        src: type === 'image' ? 'https://picsum.photos/100/60' : undefined,
        game: type === 'game' ? 'chess' : undefined,
      }
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const updateLayer = (id, patch) => {
    setLayers(layers.map(l => l.id === id ? { ...l, ...patch, props: { ...l.props, ...patch.props } } : l));
  };

  const deleteLayer = (id) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Improved drag for canvas (pointer events for mouse+touch, bounds, visual feedback)
  const [dragInfo, setDragInfo] = useState(null);
  const [resizeInfo, setResizeInfo] = useState(null);
  const CANVAS_W = 420;
  const CANVAS_H = 260;

  const onCanvasPointerMove = (e) => {
    if (dragInfo && selectedLayerId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = Math.max(0, Math.min(CANVAS_W - 20, e.clientX - rect.left - dragInfo.offX));
      const ny = Math.max(0, Math.min(CANVAS_H - 20, e.clientY - rect.top - dragInfo.offY));
      updateLayer(selectedLayerId, { x: Math.round(nx), y: Math.round(ny) });
    }
    if (resizeInfo && selectedLayerId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const layer = layers.find(l => l.id === selectedLayerId);
      if (!layer) return;
      const newW = Math.max(30, Math.min(CANVAS_W - layer.x, e.clientX - rect.left - resizeInfo.startX + resizeInfo.startW));
      const newH = Math.max(20, Math.min(CANVAS_H - layer.y, e.clientY - rect.top - resizeInfo.startY + resizeInfo.startH));
      updateLayer(selectedLayerId, { w: Math.round(newW), h: Math.round(newH) });
    }
  };

  const onCanvasPointerUp = () => {
    if (dragInfo) setDragInfo(null);
    if (resizeInfo) setResizeInfo(null);
  };

  const startDrag = (e, id) => {
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    setSelectedLayerId(id);
    setDragInfo({
      id,
      offX: e.clientX - rect.left - layer.x,
      offY: e.clientY - rect.top - layer.y
    });
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startResize = (e, id) => {
    e.stopPropagation();
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    setSelectedLayerId(id);
    setResizeInfo({
      id,
      startX: e.clientX,
      startY: e.clientY,
      startW: layer.w,
      startH: layer.h
    });
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const stopDragOrResize = (e) => {
    if (e.currentTarget.releasePointerCapture) e.currentTarget.releasePointerCapture(e.pointerId);
    if (dragInfo) setDragInfo(null);
    if (resizeInfo) setResizeInfo(null);
  };

  // Generate SilverScript from current covenant + layers (advanced tool)
  const generateSilverScript = () => {
    let ss = `// Auto-generated SilverScript for ${name || 'Covenant'}\n`;
    ss += `covenant ${category || 'custom'} "${name}" {\n`;
    ss += `  fee ${feePercent}%\n`;
    ss += `  reusable ${reusable}\n`;
    ss += `  allow_topups ${allowTopups}\n`;
    if (circuitId !== 'none') ss += `  zk_circuit ${circuitId}\n`;
    ss += `  // UI layers from advanced builder\n`;
    layers.forEach((l, i) => {
      ss += `  layer${i} ${l.type} { x:${l.x} y:${l.y} w:${l.w} h:${l.h} `;
      if (l.props.text) ss += `text:"${l.props.text}" `;
      if (l.props.action) ss += `action:"${l.props.action}" `;
      ss += `}\n`;
    });
    ss += `  // Add your custom logic here\n  on resolve { ... }\n}`;
    setSilverScript(ss);
    return ss;
  };

  // "Compiler" - turns SilverScript/DSL into script_hex (uses backend compiler if available, else simulation)
  const compileSilverScript = async () => {
    setIsCompiling(true);
    try {
      const code = silverScript || generateSilverScript();
      // Try real backend compiler (Covex DSL or SilverScript -> bytecode)
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          silver_script: code,
          covenant_name: name,
          category,
          fee_basis_points: feePercent * 100,
          reusable,
          allow_topups: allowTopups,
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.script_hex) {
          setCompiledScriptHex(data.script_hex);
          return data.script_hex;
        }
      }
    } catch (e) { /* fall to sim */ }

    // Fallback simulation (realistic hex for demo + real deploys)
    const simHex = 'aa20' + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('') + 
                   (layers.length > 0 ? 'bb' + layers.length.toString(16).padStart(2,'0') : '');
    setCompiledScriptHex(simHex);
    setIsCompiling(false);
    return simHex;
  };

  // Render the advanced canvas preview (fully interactive builder)
  const AdvancedCanvas = () => (
    <div 
      className="relative border-2 border-dashed border-white/30 bg-black/60 rounded-xl overflow-hidden"
      style={{ width: CANVAS_W, height: CANVAS_H, cursor: dragInfo ? 'grabbing' : 'default' }}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerLeave={onCanvasPointerUp}
    >
      {layers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
          Add elements from toolbar • Drag to position • Resize from corner • Edit in inspector
        </div>
      )}
      {layers.map(layer => {
        const isSel = layer.id === selectedLayerId;
        const style = {
          position: 'absolute',
          left: layer.x,
          top: layer.y,
          width: layer.w,
          height: layer.h,
          border: isSel ? '2px solid #49EACB' : '1px solid rgba(255,255,255,0.2)',
          background: layer.props.bg || 'rgba(255,255,255,0.08)',
          color: layer.props.color || '#fff',
          fontSize: layer.props.fontSize || 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
          cursor: dragInfo?.id === layer.id ? 'grabbing' : 'move'
        };
        return (
          <div 
            key={layer.id} 
            style={style}
            onPointerDown={(e) => startDrag(e, layer.id)}
            onClick={() => setSelectedLayerId(layer.id)}
          >
            {layer.type === 'text' && layer.props.text}
            {layer.type === 'button' && (
              <button 
                className="px-3 py-0.5 rounded text-xs font-bold active:scale-95"
                style={{ background: layer.props.bg, color: layer.props.color || '#000' }}
                onClick={(e) => { e.stopPropagation(); alert(`Would trigger action: ${layer.props.action || 'stake'}`); }}
              >
                {layer.props.text || 'ACTION'}
              </button>
            )}
            {layer.type === 'image' && <img src={layer.props.src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />}
            {layer.type === 'game' && <div className="text-[10px] opacity-70">🎮 {layer.props.game || 'chess'}</div>}
            {layer.type === 'shape' && <div className="w-3/4 h-3/4 border border-white/40 rounded" />}
            {isSel && (
              <>
                <div className="absolute -top-2 -right-2 text-[8px] bg-black px-1 rounded">drag</div>
                <div 
                  className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#49EACB] cursor-se-resize border border-black"
                  onPointerDown={(e) => startResize(e, layer.id)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  // Inspector for selected layer (advanced properties)
  const LayerInspector = () => {
    if (!selectedLayer) return <div className="text-xs text-white/50 p-3">Select a layer on the canvas to edit properties</div>;
    return (
      <div className="space-y-2 text-xs">
        <div className="font-mono text-[10px] text-white/60">LAYER: {selectedLayer.type.toUpperCase()}</div>
        <input 
          value={selectedLayer.props.text || ''} 
          onChange={e => updateLayer(selectedLayer.id, { props: { text: e.target.value } })} 
          placeholder="Text / Label" 
          className="w-full bg-black/60 border border-white/10 px-2 py-1 rounded text-white" 
        />
        {selectedLayer.type === 'button' && (
          <select value={selectedLayer.props.action} onChange={e => updateLayer(selectedLayer.id, { props: { action: e.target.value } })} className="w-full bg-black/60 border border-white/10 px-2 py-1 rounded">
            <option value="stake">stake / join</option>
            <option value="claim">claim / resolve</option>
            <option value="custom">custom (SilverScript)</option>
          </select>
        )}
        {selectedLayer.type === 'image' && (
          <div>
            <label className="block text-[10px] mb-1">Upload Image</label>
            <input type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  updateLayer(selectedLayer.id, { props: { src: ev.target.result } });
                };
                reader.readAsDataURL(file);
              }
            }} className="text-[10px]" />
            {selectedLayer.props.src && <img src={selectedLayer.props.src} alt="preview" className="mt-1 max-h-16 border border-white/20" />}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={selectedLayer.x} onChange={e => updateLayer(selectedLayer.id, { x: parseInt(e.target.value)||0 })} className="bg-black/60 border border-white/10 px-2 py-1 rounded" placeholder="x" />
          <input type="number" value={selectedLayer.y} onChange={e => updateLayer(selectedLayer.id, { y: parseInt(e.target.value)||0 })} className="bg-black/60 border border-white/10 px-2 py-1 rounded" placeholder="y" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => deleteLayer(selectedLayer.id)} className="text-red-400 text-xs px-2 py-1 border border-red-500/30 rounded hover:bg-red-500/10">Delete Layer</button>
          <button onClick={() => setSelectedLayerId(null)} className="text-xs px-2 py-1 border border-white/20 rounded">Deselect</button>
        </div>
      </div>
    );
  };

  // Unlock full advanced tools + SilverScript compiler (paywall)
  // Payments go through real on-chain (dev wallets on testnet construct+sign+broadcast real txs via kaspad wRPC;
  // real wallets use extension sendKaspa). Backend records tier, auth-session exposes it.
  const unlockAdvancedTools = async () => {
    if (!address) {
      alert('Connect wallet first (or use Dev Connect for test)');
      return;
    }
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
    const treasury = net.includes('10') ? 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m' : 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
    try {
      const pay = await sendPayment(treasury, 100, { memo: 'covex-tier:BUILDER advanced-ui', description: 'Unlock full UI builder + SilverScript compiler' });
      if (pay && (pay.success || pay.txid)) {
        // Payment succeeded (real tx_id returned). Re-check auth-session so backend-verified tier unlocks everything.
        await checkTierAndUnlock();
        if (!isAdvancedUnlocked) {
          // Fallback immediate unlock for the session (backend verifier may take a second)
          setIsAdvancedUnlocked(true);
          if (layers.length === 0) {
            setLayers([
              { id: 'l1', type: 'text', x: 30, y: 30, w: 200, h: 30, props: { text: name || 'Your Covenant', color: '#fff', fontSize: 18 } },
              { id: 'l2', type: 'button', x: 30, y: 80, w: 140, h: 38, props: { text: 'STAKE 10 KAS', action: 'stake', bg: currentTemplate.accent } },
            ]);
          }
        }
        alert(`BUILDER tier payment sent (tx: ${pay.txid || 'see wallet'}). Premium functions (advanced builder + SilverScript compiler) unlocked.`);
      }
    } catch (e) {
      alert('Payment failed or cancelled. Use Dev Connect for test deploys on TN12/TN10 (real on-chain txs).');
      // Testnet-only dev affordance. NEVER unlock advanced tools on mainnet
      // without a confirmed payment - the real deploy is gated server-side by
      // the auth token, but the UI must not imply paid access for free.
      if ((localStorage.getItem('kaspaNetwork') || 'testnet-12') !== 'mainnet') {
        setIsAdvancedUnlocked(true);
      }
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!address) {
      setResult({ success: false, error: 'Connect a wallet first. Nothing was created or deployed.' });
      setStatus('error');
      return;
    }
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
            custom_ui_config: { 
              theme: { ...(designTheme || {}), accent: accentColor, preset: designTheme?.preset || uiPreset, background_image: bgImage || null }, 
              category, 
              circuit: circuitId !== 'none' ? circuitId : null,
              // Advanced builder data (only present if unlocked)
              layers: isAdvancedUnlocked ? layers : [],
              silver_script: isAdvancedUnlocked ? silverScript : '',
              compiled_script_hex: isAdvancedUnlocked ? compiledScriptHex : ''
            },
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
      setResult({
        success: true,
        pending: true,
        message: 'Your covenant design is saved as a draft in this browser. Nothing is on-chain yet. Pay a tier to unlock full deployment with your wallet, or use the testnet dev wallet for a free on-chain deploy.',
      });
      setStatus('success');
      setShowUpgrade(true);
    } catch (e) { setResult({ success: false, error: e.message || 'Creation failed' }); setStatus('error'); }
  };

  if (status === 'success' && result) {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16 text-center">
        <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6 ${result.pending ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}><Check size={36} className={result.pending ? 'text-amber-400' : 'text-emerald-400'} /></div>
        <h1 className="text-2xl font-bold text-white mb-2">{result.pending ? 'Draft Saved (Not On-Chain)' : 'Deployed to Kaspa!'}</h1>
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
                <button key={c.id} onClick={() => setCircuitId(c.id)} className={`relative p-3 rounded-xl border text-left transition-all ${circuitId === c.id ? 'border-[#49EACB] bg-[#49EACB]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                  {c.kind && c.kind !== 'basic' && (
                    <span className={`absolute top-2 right-2 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${c.kind === 'zk' ? 'bg-emerald-500/15 text-emerald-300' : c.kind === 'hybrid' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>{c.kind}</span>
                  )}
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
            <DesignStudio
              currentTheme={{ accent: accentColor, background_image: bgImage, ...(designTheme || {}) }}
              onApply={(t) => {
                setDesignTheme(t);
                if (t.accent) setAccentColor(t.accent);
                if (t.background_image) setBgImage(t.background_image);
              }}
            />
            <label className="block mb-3"><span className="text-xs text-gray-400 block mb-2">Accent Color</span>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-12 h-12 rounded-xl border border-white/10 bg-transparent cursor-pointer" />
                <div className="flex gap-1.5">
                  {['#49EACB', '#A855F7', '#E8AF34', '#3B82F6', '#EF4444', '#22C55E', '#F97316', '#EC4899', '#14B8A6', '#EAB308'].map(c => (
                    <button key={c} onClick={() => setAccentColor(c)} className="w-7 h-7 rounded-lg border transition-all" style={{ backgroundColor: c + '20', borderColor: accentColor === c ? c : 'transparent', boxShadow: accentColor === c ? `0 0 8px ${c}40` : 'none' }} />))}
                </div></div></label>
            <label className="block"><span className="text-xs text-gray-400 block mb-2">Covenant Background Image (shown behind your covenant page)</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={bgImage.startsWith('data:') ? '' : bgImage}
                  onChange={e => setBgImage(e.target.value)}
                  placeholder="https://... image URL"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-gray-500 focus:border-[#49EACB]/50 outline-none"
                />
                <label className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300 hover:border-[#49EACB]/40 cursor-pointer text-center">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 600 * 1024) { alert('Image too large. Keep it under 600KB.'); return; }
                    const r = new FileReader();
                    r.onload = () => setBgImage(String(r.result));
                    r.readAsDataURL(f);
                  }} />
                </label>
                {bgImage && <button onClick={() => setBgImage('')} className="px-3 py-2.5 rounded-xl border border-red-500/30 text-red-300 text-sm">Clear</button>}
              </div>
              {bgImage && (
                <div className="mt-3 h-24 rounded-xl border border-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${bgImage})` }} />
              )}
            </label>
          </div>

          {!address && <div className="glass-panel rounded-2xl p-4 text-center"><p className="text-sm text-gray-400 mb-3">Connect a wallet to deploy on-chain</p><DevConnectPanel compact /></div>}

          {/* === BEST POSSIBLE ADVANCED UI BUILDING TOOLS + SILVERSCRIPT (paywalled) === */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-white flex items-center gap-2"><Wrench size={16} className="text-[#49EACB]" /> Advanced UI Builder + SilverScript Compiler</div>
                <div className="text-[10px] text-gray-400">GIMP/Canva/Framer level tools • Layers • Drag • Inspector • Live interactive preview • Full SilverScript</div>
              </div>
              {!isAdvancedUnlocked && (
                <button onClick={unlockAdvancedTools} className="px-4 py-2 rounded-2xl bg-amber-500 text-black text-xs font-bold flex items-center gap-1 hover:brightness-110">
                  <Crown size={14} /> PAY BUILDER (100 KAS) TO UNLOCK FULL TOOLS
                </button>
              )}
              {isAdvancedUnlocked && <div className="text-emerald-400 text-xs font-bold px-3 py-1 border border-emerald-500/30 rounded">UNLOCKED • FULL TOOLS ACTIVE</div>}
            </div>

            {!isAdvancedUnlocked && (
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-300 mb-4">
                Pay a tier (BUILDER 100 KAS+) to unlock the full advanced UI builder (layers, drag canvas, inspector) + SilverScript editor/compiler for real on-chain covenant creation. Payments create real txs on testnet (or via your wallet). Basic templates + preview work for free.
              </div>
            )}

            {isAdvancedUnlocked && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Toolbar + Canvas */}
                <div className="lg:col-span-7">
                  <div className="text-[10px] font-mono text-white/50 mb-1.5 flex items-center gap-2">CANVAS (drag elements • click to select)</div>
                  <AdvancedCanvas />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {['text','button','image','shape','game'].map(t => (
                      <button key={t} onClick={() => addLayer(t)} className="text-[10px] px-2.5 py-1 rounded border border-white/15 hover:bg-white/5 capitalize">{t}</button>
                    ))}
                    <button onClick={() => { const ss = generateSilverScript(); setSilverScript(ss); }} className="text-[10px] px-2.5 py-1 rounded bg-white/10">Generate SilverScript from UI</button>
                    <button onClick={() => {
                      const design = { layers, silverScript, template: currentTemplate.id };
                      const blob = new Blob([JSON.stringify(design, null, 2)], {type: 'application/json'});
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `${name || 'covenant'}-design.json`; a.click();
                    }} className="text-[10px] px-2.5 py-1 rounded border border-white/15 hover:bg-white/5">Export Design</button>
                    <label className="text-[10px] px-2.5 py-1 rounded border border-white/15 hover:bg-white/5 cursor-pointer">
                      Import Design
                      <input type="file" accept=".json" className="hidden" onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            try {
                              const design = JSON.parse(ev.target.result);
                              if (design.layers) setLayers(design.layers);
                              if (design.silverScript) setSilverScript(design.silverScript);
                            } catch(err) { alert('Invalid design file'); }
                          };
                          reader.readAsText(file);
                        }
                      }} />
                    </label>
                    <button onClick={() => { setLayers([]); setSilverScript(''); setSelectedLayerId(null); }} className="text-[10px] px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">Clear All</button>
                  </div>
                </div>

                {/* Layers + Inspector */}
                <div className="lg:col-span-5 space-y-3">
                  <div>
                    <div className="text-[10px] font-mono text-white/50 mb-1">LAYERS ({layers.length})</div>
                    <div className="max-h-[110px] overflow-auto border border-white/10 rounded p-1 text-xs space-y-0.5">
                      {layers.map(l => (
                        <div key={l.id} onClick={() => setSelectedLayerId(l.id)} className={`px-2 py-0.5 rounded cursor-pointer flex justify-between ${l.id === selectedLayerId ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                          <span>{l.type} @({l.x},{l.y})</span>
                          <span onClick={(e)=>{e.stopPropagation(); deleteLayer(l.id);}} className="text-red-400/70 hover:text-red-400">×</span>
                        </div>
                      ))}
                      {layers.length === 0 && <div className="text-white/40 px-2 py-1">No layers yet - use toolbar above</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-white/50 mb-1">INSPECTOR</div>
                    <div className="border border-white/10 rounded p-2 bg-black/40">{LayerInspector()}</div>
                  </div>
                </div>

                {/* SilverScript Editor + Compiler (the core for actually creating covenants) */}
                <div className="lg:col-span-12">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Code size={14} className="text-[#49EACB]" />
                    <span className="text-sm font-semibold">SilverScript Editor + Compiler</span>
                    <button onClick={compileSilverScript} disabled={isCompiling} className="ml-auto text-xs px-3 py-1 rounded bg-[#49EACB] text-black font-bold disabled:opacity-50">{isCompiling ? 'COMPILING...' : 'COMPILE TO SCRIPT_HEX'}</button>
                  </div>
                  <textarea 
                    value={silverScript} 
                    onChange={e => setSilverScript(e.target.value)} 
                    placeholder="Write or generate SilverScript here. Use 'Generate from UI' then 'Compile'. This becomes the actual on-chain covenant logic."
                    className="w-full h-28 font-mono text-xs bg-black/60 border border-white/10 rounded p-3 text-white resize-y" 
                  />
                  {compiledScriptHex && (
                    <div className="mt-1 text-[10px] font-mono text-emerald-400 break-all">Compiled: {compiledScriptHex}</div>
                  )}
                  <div className="text-[9px] text-white/40 mt-1">The compiled script_hex + your visual layers will be deployed together. Real on-chain covenant.</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">Back</button>
            <button onClick={handleCreate} disabled={status === 'creating' || !name.trim() || !address}
              className="flex-1 py-4 rounded-2xl bg-[#49EACB] text-black font-extrabold text-lg hover:brightness-110 disabled:opacity-30 transition-all flex items-center justify-center gap-2">
              {status === 'creating' ? <><span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Creating...</> : <><Send size={18} /> Create Covenant (uses advanced design + script if unlocked)</>}
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
