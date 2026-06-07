import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import CovexTerminal from '../components/CovexTerminal';
import { Terminal, Lock, ArrowLeft, Cpu, ShieldCheck, ExternalLink, AlertTriangle, BadgeCheck, Palette, LayoutTemplate, Eye, EyeOff, ImagePlus, Monitor, Code, Code2, Paintbrush, Check, ArrowUp, QrCode, Zap, Type, Ruler, Save, CheckCircle2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const DEPLOYER = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
const TRUNC = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-4)}` : s);

const isVerified = (c) => c?.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER';
const tierValue = (t) => ({ MAX: 3, PRO: 2, BUILDER: 1, FREE: 0, EXPLORER: 0 }[t] || 0);

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
  const [searchParams] = useSearchParams();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const { address, balance, sendPayment, connecting, buildUri } = useWallet();

  // UI Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [config, setConfig] = useState(DEFAULT_UI_CONFIG);

  // Anti-bypass: paid tier from localStorage
  const [covexPaidTier, setCovexPaidTier] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('covex_paid_tier') : null
  );

  // Compute effective tier & paid status early so tab default works
  const effectiveTierLabel = covexPaidTier || 'FREE';
  const effectiveTierVal = Math.max(
    tierValue(covenant?.verified_tier || covenant?.tier || 'FREE'),
    tierValue(effectiveTierLabel)
  );
  const canCustomize = effectiveTierVal >= 1;  // BUILDER+
  const canBrand = effectiveTierVal >= 2;       // PRO+
  const canMaxLayout = effectiveTierVal >= 3;   // MAX

  // Set activeTab based on URL param (paid → terminal, free → interact)
  // Gap 4: ?play=chess/poker/bj deep-links auto-navigate to Terminal tab for paid users
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    const playParam = searchParams.get('play');
    // ?tab=terminal or ?play=chess → terminal for paid users
    if ((tabParam === 'terminal' || playParam) && (covexPaidTier || '')) return 'terminal';
    return 'interact';
  });
  // Pass play mode to CovexTerminal
  const playMode = searchParams.get('play') || null; // 'chess' | 'poker' | 'bj' | null
  const [toast, setToast] = useState(null);
  const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
  const TIER_OPTIONS = [
    { id: 'BUILDER', price: 100, label: 'Builder', color: '#3B82F6', desc: 'Interactive UI generation, standard listing, verified badge.' },
    { id: 'PRO', price: 500, label: 'PRO', color: '#E8AF34', desc: 'Featured placement, advanced UI tools, covenant images.' },
    { id: 'MAX', price: 1000, label: 'MAX', color: '#A855F7', desc: 'Top placement, full UI suite, custom branding.' },
  ];

  // Upgrade payment state
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState(null);
  const [upgradeQr, setUpgradeQr] = useState(false);
  const [upgradePaid, setUpgradePaid] = useState(false);

  const handleUpgrade = async (tier) => {
    setUpgradeTier(tier);
    setShowUpgrade(true);
    setUpgradeQr(false);
    setUpgradePaid(false);
  };

  const handleUpgradePay = async (tier) => {
    try {
      if (address) {
        const result = await sendPayment(TREASURY, tier.price, { memo: `covex-upgrade:${id}:${tier.id}` });
        if (result.success) setUpgradePaid(true);
      } else {
        window.open(`kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.price}`, '_blank');
        setUpgradePaid(true);
      }
    } catch {
      window.open(`kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.price}`, '_blank');
    }
  };

  const getUpgradeUri = (tier) => `kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.price}`;

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/covenants?network=${localStorage.getItem('kaspaNetwork') || 'testnet-12'}`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.covenants || []).find((c) => c.tx_id === id) || null;
        setCovenant(found);
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
        <p className="text-gray-300 text-lg">Covenant not found.</p>
        <Link to="/" className="text-kaspa-green hover:underline mt-4 inline-block">
          Return to Explorer
        </Link>
      </div>
    );
  }

  const verified = isVerified(covenant);

  // Preview style based on config
  const previewStyle = {
    primaryColor: config.primaryColor,
    background: config.bgColor || (config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : config.bgStyle === 'dark' ? '#0A0A0D' : '#111116'),
    borderColor: config.bgStyle === 'glass' ? 'rgba(255,255,255,0.08)' : config.bgStyle === 'dark' ? '#222' : '#1a1a2e',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-8 font-mono text-sm uppercase tracking-wider"
      >
        <ArrowLeft size={16} /> Return to Registry
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Covenant metadata */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel p-8 sm:p-10 rounded-3xl flex flex-col"
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
                <span className="text-sm text-gray-300 font-mono">{covenant.category || 'General'}</span>
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
            <h3 className="text-xs font-mono text-gray-300 mb-3 uppercase tracking-widest">
              {verified ? 'Logic Summary (Full Disclosure)' : 'Protocol Description (Limited)'}
            </h3>
            <p className="text-gray-300 leading-relaxed">
              {verified
                ? (covenant.description || covenant.desc || 'Verified covenant. Full disclosure enabled.')
                : 'Limited information available. Only tx_id, script_hash, and amount are disclosed. Upgrade to a paid tier for full transparency.'}
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
                <p className="text-xs text-gray-300 mb-1">{label}</p>
                <p className="text-sm font-mono text-white truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* TXID */}
          <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
            <p className="text-xs text-gray-300 mb-1">TXID</p>
            <p className="text-xs font-mono text-kaspa-green break-all">{covenant.tx_id}</p>
          </div>

          {/* Upgrade this Covenant button for FREE/EXPLORER tier */}
          {!verified && (
            <button
              onClick={() => handleUpgrade(TIER_OPTIONS[0])}
              className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:shadow-[0_0_30px_rgba(73,234,203,0.4)] active:scale-[0.97] transition-all"
            >
              <ArrowUp size={18} />
              Upgrade this Covenant
            </button>
          )}

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
          className="glass-panel rounded-3xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center border-b border-white/5">
            <button
              onClick={() => setActiveTab('interact')}
              className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'interact'
                  ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green'
                  : 'text-gray-300 hover:text-gray-300'
              }`}
            >
              <Terminal size={14} />
              Interact
            </button>
            {canCustomize && (
              <button
                onClick={() => setActiveTab('terminal')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'terminal'
                    ? 'text-kaspa-green bg-kaspa-green/[0.06] border-b-2 border-kaspa-green'
                    : 'text-gray-300 hover:text-gray-300'
                }`}
              >
                <Code2 size={14} />
                Terminal
              </button>
            )}
            {canCustomize && (
              <button
                onClick={() => setActiveTab('builder')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'builder'
                    ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green'
                    : 'text-gray-300 hover:text-gray-300'
                }`}
              >
                <Paintbrush size={14} />
                UI Builder
              </button>
            )}
          </div>

          <div className="p-8 flex-1">
            {activeTab === 'interact' ? (
              <div className="space-y-8">
                <div>
                  <label className="block text-xs font-mono text-gray-300 mb-3 uppercase tracking-widest">
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

                {/* Free tier: simple visual changes always available in the interact view for fresh or existing free covenants */}
                {!canCustomize && (
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-[10px] text-gray-400 mb-1.5">Simple Visual Tweaks (Free)</div>
                    <div className="flex items-center gap-2">
                      {['#49EACB', '#3B82F6', '#E8AF34', '#A855F7', '#EF4444'].map(c => (
                        <button key={c} onClick={() => setConfig(s => ({...s, primaryColor: c}))} className="h-6 w-6 rounded-full border border-white/20" style={{background: c}} />
                      ))}
                    </div>
                    <p className="text-[9px] text-gray-500 mt-1">Accent applies to this viewer. Full customization in paid Studio.</p>
                  </div>
                )}

                {address && (
                  <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                    <p className="text-xs text-emerald-400 font-mono mb-1">CONNECTED WALLET</p>
                    <p className="text-sm font-mono text-white truncate">{address}</p>
                    {balance !== null && (
                      <p className="text-xs text-gray-200 mt-1">
                        Balance: {(balance / 1e8).toFixed(4)} KAS
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleExecute}
                  disabled={connecting || !amount}
                  className="w-full bg-kaspa-green text-black font-extrabold py-5 rounded-2xl text-lg hover:shadow-[0_0_40px_rgba(73,234,203,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-wide"
                >
                  {address ? <ShieldCheck size={24} /> : <Lock size={24} />}
                  {connecting ? 'PROCESSING...' : address ? 'Sign & Execute' : 'Open Wallet to Execute'}
                </button>

                {/* Free tier full interactivity: basic claim/resolve for any freshly created or existing free covenant */}
                {!canCustomize && (
                  <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.015]">
                    <div className="text-xs uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-2">
                      <Zap size={12} /> Basic Free Interactions (fully interactable)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => alert('Claim submitted (basic free flow). In production this calls the covenant claim entrypoint or generic oracle for outcome.')} className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20">Claim as Winner</button>
                      <button onClick={() => alert('Timeout resolve triggered. Oracle or on-chain timeout will compute payout per script.')} className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20">Resolve via Timeout</button>
                      <button onClick={() => alert('View current on-chain state / logs (uses covenant metadata + explorer).')} className="px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20">View State / Logs</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">Free covenants are fully interactable via claim, timeout, and basic oracle resolution. Paid tiers unlock ZK circuits, custom UIs, and advanced timers.</p>
                  </div>
                )}

                {deployUri && (
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                    <p className="text-xs text-gray-200 font-mono break-all">
                      URI: {deployUri.slice(0, 60)}...
                    </p>
                  </div>
                )}

                <p className="text-center text-xs text-gray-200 font-mono">
                  DIRECT wRPC CONNECTION / NO MIDDLEMEN / NON-CUSTODIAL
                </p>

                <a
                  href={`https://explorer.kaspa.org/tx/${covenant.tx_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-xs text-gray-300 hover:text-kaspa-green transition-colors font-mono"
                >
                  <ExternalLink size={12} />
                  View on Kaspa Explorer
                </a>
              </div>
            ) : activeTab === 'terminal' ? (
              /* ── Terminal Tab, only for paid users with full tools ── */
              covexPaidTier ? (
                <div className="-m-8">
                  <CovexTerminal covenant={covenant} />
                </div>
              ) : (
                <div className="p-8 text-center border border-white/10 rounded-2xl bg-black/30">
                  <Lock size={32} className="mx-auto mb-4 text-amber-400" />
                  <h3 className="text-xl font-bold text-white mb-2">Terminal is a Paid Feature</h3>
                  <p className="text-gray-300 mb-6 max-w-md mx-auto">The full Covex Terminal with ZK circuits, oracles, custom UI deployment, and SilverScript generator is only available to paid tier users.</p>
                  <Link to="/pricing" className="inline-block px-6 py-3 rounded-xl bg-[#49EACB] text-black font-bold">Get Paid Access</Link>
                </div>
              )
            ) : (
              /* ── UI Builder Tab ── */
              <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-1">
                <h3 className="text-sm font-semibold text-white uppercase tracking-widest flex items-center gap-2">
                  <LayoutTemplate size={16} className="text-kaspa-green" />
                  UI Builder
                </h3>

                <div className="space-y-6">
                  {/* Title Override */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Type size={12} /> Title Override
                    </p>
                    <input
                      type="text"
                      value={config.titleOverride || ''}
                      onChange={(e) => setConfig((s) => ({ ...s, titleOverride: e.target.value }))}
                      placeholder={covenant.name || 'Covenant Title'}
                      className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 transition-colors"
                    />
                    <p className="text-[10px] text-gray-200">Leave blank to use covenant name</p>
                  </div>

                  {/* Description Override */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Ruler size={12} /> Description Override
                    </p>
                    <textarea
                      rows="3"
                      value={config.descOverride || ''}
                      onChange={(e) => setConfig((s) => ({ ...s, descOverride: e.target.value }))}
                      placeholder={covenant.description || 'Covenant description...'}
                      className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 transition-colors resize-none"
                    />
                  </div>

                  {/* Color */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Primary Color</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {['#49EACB', '#E8AF34', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'].map((c) => (
                        <ColorSwatch
                          key={c}
                          color={c}
                          active={config.primaryColor === c}
                          onClick={() => setConfig((s) => ({ ...s, primaryColor: c }))}
                        />
                      ))}
                      <input
                        type="color"
                        value={config.primaryColor}
                        onChange={(e) => setConfig((s) => ({ ...s, primaryColor: e.target.value }))}
                        className="h-8 w-8 rounded-full border-0 p-0 overflow-hidden cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Background Color */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Background Color</p>
                    <div className="grid grid-cols-4 gap-2">
                      {['#0A0A0D', '#0D1117', '#111116', '#1a1a2e'].map((bg) => (
                        <button
                          key={bg}
                          onClick={() => setConfig((s) => ({ ...s, bgColor: bg }))}
                          className="h-10 rounded-lg border-2 transition-all"
                          style={{
                            backgroundColor: bg,
                            borderColor: config.bgColor === bg ? '#49EACB' : 'rgba(255,255,255,0.08)'
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Background Style */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Background Style</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: 'glass', label: 'Glass', desc: 'Frosted' },
                        { val: 'dark', label: 'Dark', desc: 'Solid' },
                        { val: 'light', label: 'Light', desc: 'Contrast' },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => setConfig((s) => ({ ...s, bgStyle: opt.val }))}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            config.bgStyle === opt.val
                              ? 'border-kaspa-green/50 bg-kaspa-green/[0.04]'
                              : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}
                        >
                          <p className="text-sm font-medium text-white">{opt.label}</p>
                          <p className="text-[10px] text-gray-300">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Layout Toggle: Compact / Expanded */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Card Layout</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['Compact', 'Expanded'].map((lyt) => (
                        <button
                          key={lyt}
                          onClick={() => setConfig((s) => ({ ...s, cardLayout: lyt }))}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            (config.cardLayout || 'Compact') === lyt
                              ? 'border-kaspa-green/50 bg-kaspa-green/[0.04]'
                              : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}
                        >
                          <p className="text-sm font-medium text-white">{lyt}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Layout Style */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Layout Style</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: 'card', label: 'Card', lock: false },
                        { val: 'terminal', label: 'Terminal', lock: false },
                        { val: 'minimal', label: 'Minimal', lock: false },
                        { val: 'editorial', label: 'Editorial', lock: !canMaxLayout },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          disabled={opt.lock}
                          onClick={() => setConfig((s) => ({ ...s, layout: opt.val }))}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            config.layout === opt.val
                              ? 'border-kaspa-green/50 bg-kaspa-green/[0.04]'
                              : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                          } ${opt.lock ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                          <p className="text-sm font-medium text-white">{opt.label}</p>
                          {opt.lock && <span className="text-[10px] text-kaspa-gold">MAX tier</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Button Styling */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Button Style</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['Solid', 'Outline', 'Ghost', 'Pill'].map((bs) => (
                        <button
                          key={bs}
                          onClick={() => setConfig((s) => ({ ...s, buttonStyle: bs }))}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            (config.buttonStyle || 'Solid') === bs
                              ? 'border-kaspa-green/50 bg-kaspa-green/[0.04]'
                              : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}
                        >
                          <p className="text-sm font-medium text-white">{bs}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-3">
                    <p className="text-xs text-gray-300 uppercase tracking-wider">Components</p>
                    {[
                      { key: 'showWalletButton', label: 'Show Wallet Button', icon: Lock, tierReq: 1 },
                      { key: 'showParamForm', label: 'Show Parameter Form', icon: Code, tierReq: 1 },
                      { key: 'showFeaturedBanner', label: 'Featured Banner', icon: ImagePlus, tierReq: 2 },
                    ].map((opt) => {
                      const locked = effectiveTierVal < opt.tierReq;
                      return (
                        <button
                          key={opt.key}
                          disabled={locked}
                          onClick={() =>
                            setConfig((s) => ({ ...s, [opt.key]: !s[opt.key] }))
                          }
                          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                            config[opt.key] && !locked
                              ? 'border-kaspa-green/40 bg-kaspa-green/[0.04]'
                              : 'border-white/5 bg-white/[0.02]'
                          } ${locked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/[0.04]'}`}
                        >
                          <div className="flex items-center gap-3">
                            <opt.icon size={16} className={locked ? 'text-gray-200' : 'text-kaspa-green'} />
                            <span className={`text-sm ${locked ? 'text-gray-200' : 'text-white'}`}>{opt.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {locked && <span className="text-[10px] text-kaspa-gold border border-kaspa-gold/30 px-1.5 py-0.5 rounded">PRO+</span>}
                            {config[opt.key] && !locked ? <Check size={14} className="text-kaspa-green" /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Logo (MAX) */}
                  {canMaxLayout && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-300 uppercase tracking-wider">Custom Logo URL</p>
                      <input
                        type="text"
                        value={config.customLogoUrl}
                        onChange={(e) => setConfig((s) => ({ ...s, customLogoUrl: e.target.value }))}
                        placeholder="https://example.com/logo.png"
                        className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 transition-colors"
                      />
                    </div>
                  )}

                  {/* Apply & Publish */}
                  <button
                    onClick={() => {
                      localStorage.setItem(`covex_ui_config_${id}`, JSON.stringify(config));
                      setToast({ type: 'success', msg: 'UI configuration saved & published!' });
                    }}
                    className="w-full flex items-center justify-center gap-2 py-4 mt-4 bg-kaspa-green hover:bg-[#3bc2a6] text-black font-bold rounded-2xl shadow-[0_0_20px_rgba(73,234,203,0.2)] transition-all active:scale-[0.97]"
                  >
                    <Save size={18} />
                    Apply &amp; Publish
                  </button>
                </div>
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
            <span className="text-xs text-gray-300">Updated in real time</span>
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
            <p className="text-sm text-gray-200 mb-4">{config.descOverride || covenant.description || covenant.desc || 'Covenant deployed on Kaspa BlockDAG.'}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-300">Locked</p>
                <p className="text-sm font-mono text-white">{(covenant.amount_kaspa || 0).toFixed(2)} KAS</p>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-300">Type</p>
                <p className="text-sm font-mono text-white truncate">{covenant.covenant_type || 'P2SH'}</p>
              </div>
            </div>
            {config.showParamForm && (
              <div className="mb-4">
                <label className="text-xs text-gray-300 mb-1.5 block">Amount (KAS)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  disabled
                  className="w-full px-3 py-2 rounded-lg border bg-black/30 text-white text-sm placeholder:text-gray-200"
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

      {/* Custom UI Rendering, show saved custom UI from Terminal/Studio on the public page */}
      {covenant?.custom_ui_html && covenant.custom_ui_html.length > 10 && (
        <div className="mt-8 glass-panel rounded-3xl p-8 sm:p-10 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30">
              <Code2 size={18} className="text-kaspa-green" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Custom Interactive UI</h3>
              <p className="text-xs text-gray-300 font-mono">GENERATED BY COVENANT STUDIO</p>
            </div>
          </div>
          <div className="rounded-2xl border border-kaspa-green/20 bg-black/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-white/5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-[10px] text-gray-200 font-mono ml-2">Custom Covenant UI</span>
            </div>
            <div className="p-4">
              <iframe
                srcDoc={covenant.custom_ui_html}
                title="Custom Covenant UI"
                className="w-full min-h-[400px] rounded-lg bg-white/[0.02] border border-white/5"
                sandbox="allow-scripts"
              />
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="glass-panel p-6 mt-8 text-xs text-gray-200 leading-relaxed max-w-3xl mx-auto">
        <p className="text-gray-300 font-semibold mb-2">Transparency Notice</p>
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
              <button onClick={() => setShowUpgrade(false)} className="text-gray-300 hover:text-white transition-colors text-2xl leading-none">
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
                <p className="text-xs text-gray-300 break-all font-mono">{getUpgradeUri(upgradeTier)}</p>
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
                  <p className="text-sm text-gray-200 mt-1">
                    Your payment of {upgradeTier.price} KAS is being processed. After 6 confirmations (approximately 1-2 minutes), your covenant will be upgraded to {upgradeTier.label} tier and unlock the interactive UI builder.
                  </p>
                </div>
                <button onClick={() => setShowUpgrade(false)} className="w-full py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm active:scale-[0.97] transition-all">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-200">
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
                        <p className="text-xs text-gray-300">{t.desc}</p>
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
                  <span className="flex-shrink-0 mx-3 text-[10px] text-gray-200 uppercase">Testnet Faucet</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>
                <button
                  onClick={() => handleSimulatePayment(upgradeTier)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-kaspa-gold/40 bg-kaspa-gold/[0.05] text-kaspa-gold font-semibold text-sm hover:bg-kaspa-gold/10 hover:border-kaspa-gold/60 transition-all"
                >
                  <Zap size={16} />
                  Simulate tKAS Payment (Faucet)
                </button>
                <p className="text-[11px] text-gray-200 text-center">All payments are one-time and non-refundable. Processing takes 6 confirmations.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
