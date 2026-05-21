import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import { Terminal, Lock, ArrowLeft, Cpu, ShieldCheck, ExternalLink, AlertTriangle, BadgeCheck, Palette, LayoutTemplate, Eye, EyeOff, ImagePlus, Monitor, Code, Paintbrush, Check } from 'lucide-react';

const DEPLOYER = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

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
  const { address, balance, sendPayment, connecting, buildUri } = useWallet();

  // UI Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [config, setConfig] = useState(DEFAULT_UI_CONFIG);
  const [activeTab, setActiveTab] = useState('interact');

  useEffect(() => {
    setLoading(true);
    fetch('/api/covenants')
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
        <p className="text-gray-500 text-lg">Covenant not found.</p>
        <Link to="/" className="text-kaspa-green hover:underline mt-4 inline-block">
          Return to Explorer
        </Link>
      </div>
    );
  }

  const verified = isVerified(covenant);
  const canCustomize = covenantTierVal >= 1;
  const canBrand = covenantTierVal >= 2;
  const canMaxLayout = covenantTierVal >= 3;

  // Preview style based on config
  const previewStyle = {
    primaryColor: config.primaryColor,
    background: config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : config.bgStyle === 'dark' ? '#0A0A0D' : '#111116',
    borderColor: config.bgStyle === 'glass' ? 'rgba(255,255,255,0.08)' : config.bgStyle === 'dark' ? '#222' : '#1a1a2e',
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
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-sm font-mono text-white truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* TXID */}
          <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
            <p className="text-xs text-gray-500 mb-1">TXID</p>
            <p className="text-xs font-mono text-kaspa-green break-all">{covenant.tx_id}</p>
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
          className="glass-panel rounded-3xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center border-b border-white/5">
            <button
              onClick={() => setActiveTab('interact')}
              className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'interact'
                  ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Terminal size={14} />
              Interact
            </button>
            {canCustomize && (
              <button
                onClick={() => setActiveTab('builder')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'builder'
                    ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green'
                    : 'text-gray-500 hover:text-gray-300'
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

                {address && (
                  <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                    <p className="text-xs text-emerald-400 font-mono mb-1">CONNECTED WALLET</p>
                    <p className="text-sm font-mono text-white truncate">{address}</p>
                    {balance !== null && (
                      <p className="text-xs text-gray-400 mt-1">
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
            ) : (
              <div className="space-y-8 overflow-y-auto">
                <h3 className="text-sm font-semibold text-white uppercase tracking-widest flex items-center gap-2">
                  <LayoutTemplate size={16} className="text-kaspa-green" />
                  UI Builder
                </h3>

                <div className="space-y-6">
                  {/* Color */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Primary Color</p>
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

                  {/* Background Style */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Background Style</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: 'glass', label: 'Glass', desc: 'Frosted transparent' },
                        { val: 'dark', label: 'Dark', desc: 'Solid dark card' },
                        { val: 'light', label: 'Light', desc: 'High contrast' },
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
                          <p className="text-[10px] text-gray-500">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Layout */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Layout</p>
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

                  {/* Toggles */}
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Components</p>
                    {[
                      { key: 'showWalletButton', label: 'Show Wallet Button', icon: Lock, tierReq: 1 },
                      { key: 'showParamForm', label: 'Show Parameter Form', icon: Code, tierReq: 1 },
                      { key: 'showFeaturedBanner', label: 'Featured Banner', icon: ImagePlus, tierReq: 2 },
                    ].map((opt) => {
                      const locked = covenantTierVal < opt.tierReq;
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
                            <opt.icon size={16} className={locked ? 'text-gray-600' : 'text-kaspa-green'} />
                            <span className={`text-sm ${locked ? 'text-gray-600' : 'text-white'}`}>{opt.label}</span>
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
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Custom Logo URL</p>
                      <input
                        type="text"
                        value={config.customLogoUrl}
                        onChange={(e) => setConfig((s) => ({ ...s, customLogoUrl: e.target.value }))}
                        placeholder="https://example.com/logo.png"
                        className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-kaspa-green/50 transition-colors"
                      />
                    </div>
                  )}
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
            <h4 className="text-white font-bold text-lg mb-1">{covenant.name || TRUNC(covenant.tx_id)}</h4>
            <p className="text-sm text-gray-400 mb-4">{covenant.description || covenant.desc || 'Covenant deployed on Kaspa BlockDAG.'}</p>
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
    </div>
  );
}
