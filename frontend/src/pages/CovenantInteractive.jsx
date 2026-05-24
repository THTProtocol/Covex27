import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import { Terminal, Lock, ArrowLeft, Cpu, ShieldCheck, ExternalLink, AlertTriangle, BadgeCheck, Palette, LayoutTemplate, Eye, EyeOff, ImagePlus, Monitor, Code, Paintbrush, Check, ArrowUp, QrCode, Zap, Type, Ruler, Save, CheckCircle2, MessageSquare, ShieldBan, Copy, FileJson, MapPin, Activity, ScrollText, Hash } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import UiBuilder from '../components/UiBuilder';
import PremiumBuilder from '../components/PremiumBuilder';

const DEPLOYER = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
const TRUNC = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-4)}` : s);

const isVerified = (c) => c?.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER';
const tierValue = (t) => ({ MAX: 3, PRO: 2, CREATOR: 1, FREE: 0, EXPLORER: 0 }[t] || 0);

const DEFAULT_UI_CONFIG = {
  primaryColor: '#49EACB',
  bgStyle: 'glass',
  layout: 'card',
  showWalletButton: true,
  showParamForm: true,
  showFeaturedBanner: false,
  customLogoUrl: '',
};

function ColorSwatch({ color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 w-8 rounded-full border-2 transition-all ${
        active ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

export default function CovenantInteractive() {
  const { id } = useParams();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const { address, balance, sendPayment, connecting, buildUri, signMessage, wallets, connect, disconnect } = useWallet();

  // UI Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [config, setConfig] = useState(DEFAULT_UI_CONFIG);
  const [activeTab, setActiveTab] = useState('interact');

  // Upgrade payment state
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState(null);
  const [upgradeQr, setUpgradeQr] = useState(false);
  const [upgradePaid, setUpgradePaid] = useState(false);

  // Anti-bypass: paid tier from localStorage
  const [covexPaidTier, setCovexPaidTier] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('covex_paid_tier') : null
  );
  const [toast, setToast] = useState(null);
  const [interactResult, setInteractResult] = useState(null);
  const [interacting, setInteracting] = useState(false);
  const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
  const TIER_OPTIONS = [
    { id: 'CREATOR', price: 100, label: 'Creator', color: '#3B82F6', desc: 'Interactive UI generation, standard listing, verified badge.' },
    { id: 'PRO', price: 500, label: 'PRO', color: '#E8AF34', desc: 'Featured placement, advanced UI tools, covenant images.' },
    { id: 'MAX', price: 1000, label: 'MAX', color: '#A855F7', desc: 'Top placement, full UI suite, custom branding.' },
  ];

  const handleUpgrade = async (tier) => {
    setUpgradeTier(tier);
    setShowUpgrade(true);
    setUpgradeQr(false);
    setUpgradePaid(false);
  };

  const handleUpgradePay = async (tier) => {
    try {
      if (address) {
        // Use the unified sendPayment from context — handles all wallet providers
        const result = await sendPayment(TREASURY, tier.price, { memo: `covex-upgrade:${id}:${tier.id}` });

        // POST to backend for verification
        if (result.txid) {
          try {
            await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tx_id: result.txid,
                covenant_address: covenant?.address || covenant?.tx_id || id,
                tier: tier.id,
              }),
            });
          } catch (_) {}
        }

        setUpgradePaid(true);
        if (result.txid) {
          setToast({ type: 'success', msg: `Payment sent! TXID: ${TRUNC(result.txid, 10)}` });
        }
      } else {
        window.open(`kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.price}`, '_blank');
        setUpgradePaid(true);
      }
    } catch (err) {
      setToast({ type: 'error', msg: `Payment failed: ${err.message || 'Unknown error'}` });
    }
  };

  const getUpgradeUri = (tier) => `kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.price}`;

  const handleSimulatePayment = (tier) => {
    localStorage.setItem('covex_paid_tier', tier.label);
    setCovexPaidTier(tier.label);
    setShowUpgrade(false);
    setToast({ type: 'success', msg: `${tier.label} tier unlocked! UI Builder is now available.` });
  };

  // STEP 4: Covenant Interaction Proof — sign via connected wallet
  const handleInteract = async () => {
    if (!address) {
      setToast({ type: 'error', msg: 'Connect your wallet first to prove covenant interaction.' });
      return;
    }
    const covenantAddr = covenant?.address || covenant?.tx_id || id;
    const message = `Interact with Covenant: ${covenantAddr}`;
    setInteracting(true);
    setInteractResult(null);
    try {
      const sig = await signMessage(message);
      setInteractResult({
        success: true,
        message,
        signature: sig,
        timestamp: new Date().toISOString(),
      });
      setToast({ type: 'success', msg: 'Covenant interaction proven! Message signed.' });
    } catch (err) {
      setInteractResult({
        success: false,
        message,
        error: err.message || 'User rejected signature',
        timestamp: new Date().toISOString(),
      });
      setToast({ type: 'error', msg: `Interaction failed: ${err.message || 'User rejected'}` });
    } finally {
      setInteracting(false);
    }
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    fetch('/api/covenants')
      .then((r) => r.json())
      .then((d) => {
        const found = (d.covenants || []).find((c) => c.tx_id === id) || null;
        setCovenant(found);
        // Load custom UI config if present in the covenant data
        if (found?.custom_ui_config) {
          try {
            const cfg = typeof found.custom_ui_config === 'string'
              ? JSON.parse(found.custom_ui_config)
              : found.custom_ui_config;
            if (cfg && Object.keys(cfg).length > 0) {
              setConfig(prev => ({ ...prev, ...cfg }));
            }
          } catch {}
        } else if (found?.tx_id) {
          // Fetch separately if not included in the list response
          fetch(`/api/covenants/${found.tx_id}/custom-ui`)
            .then(r => r.json())
            .then(d => {
              if (d.success && d.custom_ui_config) {
                const cfg = typeof d.custom_ui_config === 'string'
                  ? JSON.parse(d.custom_ui_config)
                  : d.custom_ui_config;
                if (cfg && Object.keys(cfg).length > 0) {
                  setConfig(prev => ({ ...prev, ...cfg }));
                }
              }
            })
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const deployUri = useMemo(
    () =>
      covenant
        ? buildUri(covenant.address || DEPLOYER, amount || '0', {
            scriptHash: covenant.script_hash,
          })
        : null,
    [covenant, amount, buildUri]
  );

  const handleExecute = useCallback(async () => {
    if (!covenant || !amount) return;
    if (address) {
      try {
        await sendPayment(covenant.address || DEPLOYER, amount, {
          scriptHash: covenant.script_hash,
        });
      } catch {
        if (deployUri) window.open(deployUri, '_blank');
      }
    } else if (deployUri) {
      window.open(deployUri, '_blank');
    }
  }, [covenant, amount, address, deployUri, sendPayment]);

  const covenantTierVal = tierValue(covenant?.verified_tier || covenant?.tier || 'FREE');

  if (loading) {
    return (
      <div className="p-20 text-center text-kaspa-green animate-pulse font-mono tracking-widest text-lg">
        INITIALIZING PROTOCOL SEQUENCE...
      </div>
    );
  }

  if (!covenant) {
    return (
      <div className="p-20 text-center">
        <p className="text-gray-500 text-lg">Covenant not found.</p>
        <Link to="/" className="text-kaspa-green hover:underline mt-4 inline-block">
          Return to Explorer
        </Link>
      </div>
    );
  }

  const verified = isVerified(covenant);
  const effectiveTierVal = Math.max(covenantTierVal, covexPaidTier ? tierValue(covexPaidTier) : 0);
  const canCustomize = effectiveTierVal >= 1;
  const canBrand = effectiveTierVal >= 2;
  const canMaxLayout = effectiveTierVal >= 3;

  // Preview style based on config — shared by builder preview and public page
  const borderRadiusMap = { none: '0', sm: '0.375rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', '2xl': '2rem', full: '9999px' };
  const previewStyle = {
    primaryColor: config.primaryColor,
    background: config.bgColor || (config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : config.bgStyle === 'dark' ? '#0A0A0D' : '#111116'),
    borderColor: config.bgStyle === 'glass' ? `${config.primaryColor}${config.borderOpacity || '20'}` : config.bgStyle === 'dark' ? '#222' : '#1a1a2e',
    borderRadius: borderRadiusMap[config.borderRadius] || '0.75rem',
    fontFamily: config.font === 'mono' ? 'monospace' : config.font === 'serif' ? 'serif' : 'sans-serif',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-8 font-mono text-sm uppercase tracking-wider"
      >
        <ArrowLeft size={16} /> Return to Registry
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Covenant metadata */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-8 sm:p-10 flex flex-col"
          style={{
            background: previewStyle.background,
            border: `1px solid ${previewStyle.borderColor}`,
            borderRadius: config.borderRadius === 'none' ? '0' :
              config.borderRadius === 'sm' ? '0.375rem' :
              config.borderRadius === 'md' ? '0.75rem' :
              config.borderRadius === 'lg' ? '1rem' :
              config.borderRadius === 'xl' ? '1.5rem' :
              config.borderRadius === '2xl' ? '2rem' :
              config.borderRadius === 'full' ? '9999px' : '1.5rem',
            fontFamily: previewStyle.fontFamily,
            boxShadow: config.showGlow ? `0 0 20px ${config.primaryColor}15` : undefined,
            backdropFilter: config.backdropBlur && config.backdropBlur !== 'none' ?
              `blur(${{sm:'4px',md:'8px',lg:'16px'}[config.backdropBlur] || '8px'})` : undefined,
            WebkitBackdropFilter: config.backdropBlur && config.backdropBlur !== 'none' ?
              `blur(${{sm:'4px',md:'8px',lg:'16px'}[config.backdropBlur] || '8px'})` : undefined,
          }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-kaspa-green/10 rounded-2xl border border-kaspa-green/30 text-kaspa-green">
              <Cpu size={32} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {covenant.name || TRUNC(covenant.tx_id)}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-kaspa-gold/10 text-kaspa-gold border border-kaspa-gold/20 uppercase tracking-widest">
                  {covenant.tier || covenant.verified_tier || 'FREE'} TIER
                </span>
                <span className="text-sm text-gray-500 font-mono">{covenant.category || 'General'}</span>
              </div>
            </div>
          </div>

          {/* Verification badge */}
          {verified ? (
            <div className="mb-6 px-5 py-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex items-center gap-3">
              <BadgeCheck size={20} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">
                  VERIFIED COVENANT ({covenant.verified_tier} tier)
                </p>
                <p className="text-xs text-emerald-400/70">
                  Full transparency. All fields, logic summary, and receiving addresses disclosed.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-6 px-5 py-4 rounded-xl bg-red-500/[0.06] border border-red-500/25 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">DANGER / UNVERIFIED COVENANT</p>
                <p className="text-xs text-red-400/70">
                  Limited disclosure: tx_id, script_hash, amount only. Use at your own risk. Full details require verified payment by covenant creator.
                </p>
              </div>
            </div>
          )}

          <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-6">
            <h3 className="text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">
              Logic Summary (Full On-Chain Data)
            </h3>
            <p className="text-gray-300 leading-relaxed">
              {covenant.description || covenant.desc || covenant.full_logic_summary || 'Covenant description extracted from the Kaspa BlockDAG.'}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 mt-auto">
            {[
              ['Covenant Type', covenant.covenant_type || 'Unknown'],
              ['Script Hash', (covenant.script_hash || '').slice(0, 20) + '...'],
              ['Locked KAS', `${(covenant.amount_kaspa || 0).toLocaleString()} KAS`],
              ['Category', covenant.category || 'General'],
            ].map(([label, value]) => (
              <div key={label} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-sm font-mono text-white truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Creator & Receiving Addresses */}
          {covenant.creator_addr && (
            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-xs text-gray-500 mb-1">Creator Address</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-kaspa-green truncate flex-1">{covenant.creator_addr}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(covenant.creator_addr)}
                  className="text-[10px] text-gray-600 hover:text-[#49EACB] shrink-0"
                  title="Copy"
                >📋</button>
              </div>
            </div>
          )}

          {/* TXID */}
          <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
            <p className="text-xs text-gray-500 mb-1">TXID</p>
            <p className="text-xs font-mono text-kaspa-green break-all">{covenant.tx_id}</p>
          </div>

          {/* Upgrade this Covenant button for FREE/EXPLORER tier */}
          {!verified && (
            <div className="mt-6 space-y-3">
              <button
                onClick={() => handleUpgrade(TIER_OPTIONS[0])}
                className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:shadow-[0_0_30px_rgba(73,234,203,0.4)] active:scale-[0.97] transition-all"
              >
                <ArrowUp size={18} />
                Upgrade this Covenant
              </button>

              {/* STEP 3: Direct SaaS tier buttons */}
              <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleUpgrade(TIER_OPTIONS[1])}
                className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
              >
                <ArrowUp size={14} />
                Upgrade to PRO (500 KAS)
              </button>
              <button
                onClick={() => handleUpgrade(TIER_OPTIONS[2])}
                className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
              >
                <ArrowUp size={14} />
                Upgrade to MAX (1000 KAS)
              </button>
              </div>
            </div>
          )}

          {/* STEP 4: Covenant Interaction Proof */}
          <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-widest">Bi-Directional Proof</p>
            <button
              onClick={handleInteract}
              disabled={interacting}
              className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
            >
              <MessageSquare size={16} />
              {interacting ? 'SIGNING...' : 'Interact — Sign Proof Message'}
            </button>
            {interactResult && (
              <div className={`mt-3 p-3 rounded-lg text-xs font-mono break-all border ${
                interactResult.success
                  ? 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/[0.06] border-red-500/20 text-red-400'
              }`}>
                <p className="font-semibold mb-1">{interactResult.success ? '✓ SIGNED' : '✗ REJECTED'}</p>
                <p className="text-gray-500">Msg: {interactResult.message.slice(0, 60)}...</p>
                {interactResult.success && <p>Sig: {interactResult.signature.slice(0, 50)}...</p>}
                {!interactResult.success && <p>Error: {interactResult.error}</p>}
              </div>
            )}
          </div>

          {/* Customize UI button for paid tiers */}
          {canCustomize && (
            <button
              onClick={() => setShowBuilder((s) => !s)}
              className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/10 transition-all text-sm font-semibold"
            >
              <Palette size={16} />
              {showBuilder ? 'Hide UI Builder' : 'Customize Interactive UI'}
            </button>
          )}
        </motion.div>

        {/* Right: Tabs - Interact / Customize */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="overflow-hidden flex flex-col"
          style={{
            background: config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' :
                       config.bgStyle === 'dark' ? '#0A0A0D' : '#111116',
            border: `1px solid ${config.bgStyle === 'glass' ? config.primaryColor + (config.borderOpacity || '20') : '#1f1f1f'}`,
            borderRadius: previewStyle.borderRadius,
            fontFamily: previewStyle.fontFamily,
          }}
        >
          <div className="flex items-center border-b border-white/5 flex-wrap">
            {[
              { id: 'interact', icon: Terminal, label: 'Interact' },
              { id: 'raw', icon: FileJson, label: 'Raw Data' },
              { id: 'addresses', icon: MapPin, label: 'Addresses' },
              { id: 'script', icon: ScrollText, label: 'Script' },
              { id: 'trust', icon: ShieldCheck, label: 'Trust' },
              ...(canCustomize ? [{ id: 'builder', icon: Paintbrush, label: 'Builder' }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-kaspa-green bg-kaspa-green/[0.04] border-kaspa-green'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
              </button>
            ))}
            {/* Copy All Data */}
            <button
              onClick={() => {
                const copy = JSON.stringify(covenant, null, 2);
                navigator.clipboard.writeText(copy);
                setToast({ type: 'success', msg: 'Full covenant data copied to clipboard' });
              }}
              className="ml-auto mr-2 px-2 py-3 text-[10px] text-gray-500 hover:text-[#49EACB] transition-colors flex items-center gap-1 border-b-2 border-transparent"
              title="Copy all fields as JSON"
            >
              <Copy size={12} />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto max-h-[55vh]">
            {activeTab === 'interact' && (
              <div className="space-y-8">
                <div>
                  <label className="block text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">
                    Amount to Lock (KAS)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.00000001"
                    min="0"
                    className="w-full cyber-input text-4xl p-6 rounded-2xl font-mono placeholder:text-kaspa-green/20"
                  />
                </div>

                {address ? (
                  <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                    <p className="text-xs text-emerald-400 font-mono mb-1">CONNECTED WALLET</p>
                    <p className="text-sm font-mono text-white truncate">{address}</p>
                    {balance !== null && (
                      <p className="text-xs text-gray-400 mt-1">
                        Balance: {(balance / 1e8).toFixed(4)} KAS
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                    <p className="text-xs text-amber-400 font-mono mb-1">WALLET NOT CONNECTED</p>
                    <p className="text-sm text-gray-400">
                      Connect your Kaspa wallet to interact with this covenant, sign proof messages, and pay for premium upgrades.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Click "CONNECT WALLET" in the top navigation bar to get started.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleExecute}
                  disabled={connecting || !amount}
                  className="w-full bg-kaspa-green text-black font-extrabold py-5 rounded-2xl text-lg hover:shadow-[0_0_40px_rgba(73,234,203,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-wide"
                >
                  {address ? <ShieldCheck size={24} /> : <Lock size={24} />}
                  {connecting ? 'PROCESSING...' : address ? 'Sign & Execute' : 'Connect Wallet to Execute'}
                </button>

                {deployUri && (
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                    <p className="text-xs text-gray-600 font-mono break-all">
                      URI: {deployUri.slice(0, 60)}...
                    </p>
                  </div>
                )}

                <p className="text-center text-xs text-gray-600 font-mono">
                  DIRECT wRPC CONNECTION / NO MIDDLEMEN / NON-CUSTODIAL
                </p>

                <a
                  href={`https://explorer.kaspa.org/tx/${covenant.tx_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-kaspa-green transition-colors font-mono"
                >
                  <ExternalLink size={12} />
                  View on Kaspa Explorer
                </a>
              </div>
            )}
            {activeTab === 'raw' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                    <FileJson size={13} className="text-kaspa-green" /> Raw JSON
                  </h4>
                  <button
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(covenant, null, 2)); setToast({ type: 'success', msg: 'JSON copied' }); }}
                    className="text-[10px] text-gray-500 hover:text-[#49EACB] flex items-center gap-1"
                  ><Copy size={10} /> Copy</button>
                </div>
                <pre className="p-3 rounded-lg bg-black/60 border border-white/5 font-mono text-[10px] text-gray-300 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed whitespace-pre">
                  {JSON.stringify(covenant, null, 2)}
                </pre>
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {[
                    ['Block DAA', covenant.block_daa_score?.toLocaleString() || '—'],
                    ['Timestamp', covenant.timestamp ? new Date(covenant.timestamp * 1000).toLocaleString() : '—'],
                    ['Active', covenant.is_active ? '✓ Yes' : '✗ No'],
                    ['Custom UI', covenant.custom_ui_enabled ? '✓ Enabled' : '✗ Not enabled'],
                    ['Verified At', covenant.verified_at ? new Date(covenant.verified_at * 1000).toLocaleString() : '—'],
                    ['Payment TX', covenant.verified_payment_tx ? (covenant.verified_payment_tx.slice(0, 14) + '...') : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="p-2 rounded bg-white/[0.02] border border-white/5">
                      <p className="text-[9px] text-gray-500">{k}</p>
                      <p className="text-[10px] text-white font-mono truncate">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'addresses' && (
              <div className="space-y-4 text-xs">
                <h4 className="text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <MapPin size={13} className="text-kaspa-green" /> Addresses & Status
                </h4>
                {/* Creator */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase">Creator Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] text-[#49EACB] break-all flex-1">{covenant.creator_addr || 'N/A'}</code>
                    <button onClick={() => { navigator.clipboard.writeText(covenant.creator_addr); setToast({ type: 'success', msg: 'Creator address copied' }); }} className="text-gray-500 hover:text-[#49EACB] shrink-0"><Copy size={11} /></button>
                  </div>
                </div>
                {/* Covenant address */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase">Covenant Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] text-amber-400 break-all flex-1">{covenant.address || 'N/A'}</code>
                    <button onClick={() => { navigator.clipboard.writeText(covenant.address); setToast({ type: 'success', msg: 'Address copied' }); }} className="text-gray-500 hover:text-[#49EACB] shrink-0"><Copy size={11} /></button>
                  </div>
                </div>
                {/* Receiving addresses */}
                {covenant.receiving_addresses && (() => {
                  try {
                    const addrs = typeof covenant.receiving_addresses === 'string'
                      ? JSON.parse(covenant.receiving_addresses)
                      : covenant.receiving_addresses;
                    if (Array.isArray(addrs) && addrs.length > 0) {
                      return (
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-[10px] text-gray-500 mb-2 uppercase">Receiving Addresses ({addrs.length})</p>
                          <div className="space-y-1.5">
                            {addrs.map((a, i) => (
                              <div key={i} className="flex items-center gap-1.5 bg-black/30 p-1.5 rounded">
                                <span className="text-[9px] text-gray-600 w-4">{i + 1}</span>
                                <code className="text-[10px] text-gray-300 break-all flex-1">{a}</code>
                                <button onClick={() => { navigator.clipboard.writeText(a); setToast({ type: 'success', msg: `Address ${i+1} copied` }); }} className="text-gray-600 hover:text-[#49EACB]"><Copy size={10} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  } catch(_) {}
                  return null;
                })()}
                {/* Status */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] text-gray-500 mb-2 uppercase">UTXO Status</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${covenant.is_active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-400'}`} />
                    <span className={`text-[10px] font-semibold ${covenant.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                      {covenant.is_active ? 'ACTIVE — Unspent UTXO' : 'INACTIVE — Spent or expired'}
                    </span>
                  </div>
                </div>
                {/* TXID */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase">Transaction ID</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] text-gray-300 break-all flex-1 font-mono">{covenant.tx_id}</code>
                    <button onClick={() => { navigator.clipboard.writeText(covenant.tx_id); setToast({ type: 'success', msg: 'TXID copied' }); }} className="text-gray-500 hover:text-[#49EACB] shrink-0"><Copy size={11} /></button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'script' && (
              <div className="space-y-4 text-xs">
                <h4 className="text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <ScrollText size={13} className="text-kaspa-green" /> Script Analysis
                </h4>
                {/* Auto-detected type */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase">Auto-Detected Type</p>
                  <p className="text-sm font-bold text-white">{covenant.covenant_type || 'Unknown'}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Category: {covenant.category || 'General'}</p>
                </div>
                {/* Script Hash */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase">Script Hash (SHA256)</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] text-[#49EACB] break-all flex-1 font-mono">{covenant.script_hash || 'N/A'}</code>
                    <button onClick={() => { navigator.clipboard.writeText(covenant.script_hash); setToast({ type: 'success', msg: 'Hash copied' }); }} className="text-gray-500 hover:text-[#49EACB] shrink-0"><Copy size={11} /></button>
                  </div>
                </div>
                {/* Full Script Hex */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-gray-500 uppercase">Full Script Hex</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(covenant.script_hex || ''); setToast({ type: 'success', msg: 'Script hex copied' }); }}
                      className="text-[10px] text-gray-500 hover:text-[#49EACB] flex items-center gap-1"
                    ><Copy size={10} /> Copy</button>
                  </div>
                  <pre className="text-[9px] font-mono text-gray-400 break-all whitespace-pre-wrap max-h-48 overflow-y-auto p-2 rounded bg-black/60">
                    {covenant.script_hex || 'No script hex available'}
                  </pre>
                </div>
                {/* Simple opcode breakdown */}
                {covenant.script_hex && (() => {
                  const hex = covenant.script_hex;
                  const parts = [];
                  for (let i = 0; i < hex.length; i += 2) {
                    const byte = hex.substring(i, i + 2);
                    const opCode = parseInt(byte, 16);
                    let label = '';
                    if (opCode === 0xaa) label = byte === 'aa' ? 'IF_COVENANT' : 'ELSE_COVENANT';
                    else if (opCode === 0x20) label = 'PUSH32';
                    else if (opCode === 0x7b) label = 'COVENANT_OP';
                    else if (opCode >= 0x01 && opCode <= 0x4e) label = `PUSH${opCode}`;
                    else if (opCode === 0x51) label = 'OP_1';
                    else if (opCode === 0x52) label = 'OP_2';
                    else if (opCode === 0x00) label = 'OP_0';
                    else if (opCode === 0x88) label = 'EQUALVERIFY';
                    else if (opCode === 0xac) label = 'CHECKSIG';
                    else if (opCode === 0x87) label = 'EQUAL';
                    else if (opCode === 0x76) label = 'DUP';
                    else if (opCode === 0xa9) label = 'HASH160';
                    else if (opCode === 0xae) label = 'CHECKMULTISIG';
                    parts.push({ offset: i / 2, hex: byte, label });
                  }
                  return (
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] text-gray-500 mb-2 uppercase">Opcode Breakdown</p>
                      <div className="space-y-0.5 max-h-48 overflow-y-auto">
                        {parts.filter(p => p.label).slice(0, 40).map((p, i) => (
                          <div key={i} className="flex items-center gap-2 text-[9px]">
                            <span className="text-gray-600 w-8 text-right">{p.offset}</span>
                            <code className="text-[#E8AF34] w-6">{p.hex}</code>
                            <span className="text-gray-300">{p.label}</span>
                          </div>
                        ))}
                        {parts.filter(p => p.label).length > 40 && (
                          <p className="text-[9px] text-gray-600 italic">+{parts.filter(p => p.label).length - 40} more opcodes</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {activeTab === 'trust' && (
              <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-1">
                <UiBuilder
                  covenant={covenant}
                  walletAddress={address}
                  onSaved={(cfg) => setToast({ type: 'success', msg: 'Trust configuration published!' })}
                />
              </div>
            )}
            {activeTab === 'builder' && canCustomize && (
              <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-1">
                <PremiumBuilder
                  covenant={covenant}
                  walletAddress={address}
                  onSave={(cfg) => setToast({ type: 'success', msg: 'UI configuration published!' })}
                  onChange={(cfg) => setConfig(cfg)}
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Live Preview */}
      {activeTab === 'builder' && canCustomize && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 glass-panel rounded-3xl p-8 sm:p-10"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Monitor size={18} className="text-kaspa-green" />
              Live Preview
            </h3>
            <span className="text-xs text-gray-500">Updated in real time</span>
          </div>
          <div
            className="rounded-2xl border p-6 max-w-xl mx-auto"
            style={{
              background: previewStyle.background,
              borderColor: previewStyle.borderColor,
            }}
          >
            {config.showFeaturedBanner && (
              <div
                className="text-center py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest mb-4"
                style={{ backgroundColor: `${config.primaryColor}20`, color: config.primaryColor, border: `1px solid ${config.primaryColor}40` }}
              >
                FEATURED COVENANT
              </div>
            )}
            {config.customLogoUrl && (
              <div className="flex justify-center mb-4">
                <img src={config.customLogoUrl} alt="Logo" className="h-8 object-contain rounded" onError={(e) => (e.target.style.display='none')} />
              </div>
            )}
            <h4 className="text-white font-bold text-lg mb-1">{config.titleOverride || covenant.name || TRUNC(covenant.tx_id)}</h4>
            <p className="text-sm text-gray-400 mb-4">{config.descOverride || covenant.description || covenant.desc || 'Covenant deployed on Kaspa BlockDAG.'}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-500">Locked</p>
                <p className="text-sm font-mono text-white">{(covenant.amount_kaspa || 0).toFixed(2)} KAS</p>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-500">Type</p>
                <p className="text-sm font-mono text-white truncate">{covenant.covenant_type || 'P2SH'}</p>
              </div>
            </div>
            {config.showParamForm && (
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1.5 block">Amount (KAS)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  disabled
                  className="w-full px-3 py-2 rounded-lg border bg-black/30 text-white text-sm placeholder:text-gray-600"
                  style={{ borderColor: `${config.primaryColor}40` }}
                />
              </div>
            )}
            {config.showWalletButton && (
              <button
                disabled
                className="w-full py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide"
                style={{ backgroundColor: config.primaryColor, color: '#000' }}
              >
                Connect Wallet to Execute
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Disclaimer */}
      <div className="glass-panel p-6 mt-8 text-xs text-gray-600 leading-relaxed max-w-3xl mx-auto">
        <p className="text-gray-500 font-semibold mb-2">Transparency Notice</p>
        <p>
          This covenant is immutable on the Kaspa BlockDAG. Covex does not create, modify, or control
          it. We only index publicly available data. All interactions occur
          non-custodially through your own wallet. You bear full responsibility for verifying all transaction details before signing.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-4 duration-300">
          <div className={`px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300'
              : 'bg-gray-900/40 border-gray-500/30 text-gray-300'
          }`}>
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="text-sm font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgrade && upgradeTier && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
          <div className="w-full max-w-lg bg-[#0f0f14] rounded-3xl border border-white/[0.06] shadow-2xl p-7 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white tracking-tight">
                Upgrade Covenant: {covenant.name || TRUNC(covenant.tx_id)}
              </h3>
              <button onClick={() => setShowUpgrade(false)} className="text-gray-500 hover:text-white transition-colors text-2xl leading-none">
                &times;
              </button>
            </div>

            {upgradeQr ? (
              <div className="flex flex-col items-center space-y-5">
                <div className="p-4 bg-white rounded-xl">
                  <QRCodeCanvas value={getUpgradeUri(upgradeTier)} size={200} level="H" includeMargin={false} />
                </div>
                <p className="text-sm text-gray-300 text-center">
                  Pay exactly <span className="font-bold text-kaspa-green">{upgradeTier.price} KAS</span>
                </p>
                <p className="text-xs text-gray-500 break-all font-mono">{getUpgradeUri(upgradeTier)}</p>
                <button onClick={() => setUpgradeQr(false)} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm hover:bg-white/10 transition-colors">
                  Back to Payment Options
                </button>
              </div>
            ) : upgradePaid ? (
              <div className="text-center space-y-5">
                <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <Check size={28} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">Payment Sent</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your payment of {upgradeTier.price} KAS is being processed. After 6 confirmations (approximately 1-2 minutes), your covenant will be upgraded to {upgradeTier.label} tier and unlock the interactive UI builder.
                  </p>
                </div>
                <button onClick={() => setShowUpgrade(false)} className="w-full py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm active:scale-[0.97] transition-all">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Select a tier to upgrade this covenant. After payment, you will unlock the interactive UI builder, full disclosure, and a verified badge.
                </p>
                <div className="space-y-2">
                  {TIER_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setUpgradeTier(t)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                        upgradeTier.id === t.id
                          ? 'border-kaspa-green/40 bg-kaspa-green/[0.04] ring-1 ring-kaspa-green/30'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${t.color}15`, borderColor: `${t.color}40` }}>
                        <span className="text-sm font-bold" style={{ color: t.color }}>{t.label.slice(0, 1)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{t.label}</p>
                        <p className="text-xs text-gray-500">{t.desc}</p>
                      </div>
                      <span className="text-sm font-bold text-kaspa-green tabular-nums">{t.price} KAS</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleUpgradePay(upgradeTier)}
                    className="flex-1 py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm active:scale-[0.97] transition-all"
                  >
                    Pay {upgradeTier.price} KAS
                  </button>
                  <button
                    onClick={() => setUpgradeQr(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/[0.04] transition-colors"
                  >
                    <QrCode size={16} />
                    QR Code
                  </button>
                </div>
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink-0 mx-3 text-[10px] text-gray-600 uppercase">Testnet Faucet</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>
                <button
                  onClick={() => handleSimulatePayment(upgradeTier)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-kaspa-gold/40 bg-kaspa-gold/[0.05] text-kaspa-gold font-semibold text-sm hover:bg-kaspa-gold/10 hover:border-kaspa-gold/60 transition-all"
                >
                  <Zap size={16} />
                  Simulate tKAS Payment (Faucet)
                </button>
                <p className="text-[11px] text-gray-600 text-center">All payments are one-time and non-refundable. Processing takes 6 confirmations.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
