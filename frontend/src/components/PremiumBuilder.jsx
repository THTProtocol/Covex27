import { useState, useEffect, useCallback } from 'react';
import {
  Paintbrush, Palette, LayoutTemplate, Type, Ruler, Save, CheckCircle2,
  Monitor, Eye, Layers, Zap, Image, ChevronDown, ChevronRight,
  Brush, Globe, Box, Frame, Sparkles, Droplets, Cpu, Terminal,
  Shield, Clock, Hash
} from 'lucide-react';

const NEON_COLORS = ['#49EACB', '#E8AF34', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#FF6B6B', '#00D2FF', '#FF00FF', '#C084FC'];
const LAYOUTS = ['card', 'terminal', 'floating', 'minimal', 'editorial'];
const BG_STYLES = ['glass', 'dark', 'solid', 'gradient'];
const ANIMATIONS = ['none', 'pulse', 'shimmer', 'float', 'glitch'];
const BUTTON_STYLES = ['solid', 'outline', 'ghost', 'pill'];
const BORDER_STYLES = ['none', 'thin', 'normal', 'thick'];
const PADDING = ['compact', 'normal', 'spacious'];
const SHADOWS = ['none', 'soft', 'neon', 'elevated'];
const FONTS = ['mono', 'sans', 'serif'];
const BADGE_STYLES = ['pill', 'banner', 'tag'];
const GRADIENT_DIRS = ['none', 'to-r', 'to-bl', 'to-br'];

function Section({ icon: Icon, title, expanded, onToggle, children }) {
  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-[#49EACB]" />
          <span className="text-xs text-gray-300 uppercase tracking-wider font-semibold">{title}</span>
        </div>
        {expanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
      </button>
      {expanded && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function OptionGrid({ options, selected, onSelect, cols = 3 }) {
  return (
    <div className={`grid grid-cols-${cols} gap-2`}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.val;
        const label = typeof opt === 'string' ? opt : opt.label;
        const desc = typeof opt === 'string' ? null : opt.desc;
        const locked = opt.lock;
        return (
          <button
            key={val}
            disabled={locked}
            onClick={() => onSelect(val)}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              selected === val
                ? 'border-[#49EACB]/50 bg-[#49EACB]/[0.08] ring-1 ring-[#49EACB]/20'
                : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
            } ${locked ? 'opacity-30 cursor-not-allowed' : ''}`}
          >
            <p className="text-xs font-medium text-white capitalize">{label || val}</p>
            {desc && <p className="text-[9px] text-gray-500 mt-0.5">{desc}</p>}
            {locked && <span className="text-[9px] text-[#E8AF34] mt-0.5 block">MAX</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function PremiumBuilder({ covenant, walletAddress, onSave }) {
  const [config, setConfig] = useState({
    primaryColor: '#49EACB',
    gradientColor: '#3B82F6',
    gradientDir: 'none',
    bgStyle: 'glass',
    layout: 'card',
    animation: 'none',
    buttonStyle: 'solid',
    font: 'mono',
    borderStyle: 'normal',
    padding: 'normal',
    shadow: 'soft',
    badgeStyle: 'pill',
    titleOverride: '',
    descOverride: '',
    featureBadge: '',
    logoUrl: '',
    customCSS: '',
    showGlow: true,
    showQR: false,
    showScriptHash: true,
    showCreator: true,
    showBlockDaa: false,
    showTimestamp: false,
    glowIntensity: 'medium',
    expanded: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [expandedSection, setExpandedSection] = useState('colors');

  const tier = (covenant?.verified_tier || covenant?.tier || 'FREE').toUpperCase();
  const isCreator = walletAddress && covenant?.creator_addr &&
    walletAddress.toLowerCase() === covenant.creator_addr.toLowerCase();
  const canCustomize = ['CREATOR', 'PRO', 'MAX'].includes(tier);
  const isMax = tier === 'MAX';

  // Load saved config from backend on mount
  useEffect(() => {
    if (!covenant?.tx_id) return;
    fetch(`/api/covenants/${covenant.tx_id}/custom-ui`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.custom_ui_config) {
          setConfig(prev => ({ ...prev, ...d.custom_ui_config }));
        }
      })
      .catch(() => {});
  }, [covenant?.tx_id]);

  const handleSave = useCallback(async () => {
    if (!covenant?.tx_id || !walletAddress) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/covenants/${covenant.tx_id}/custom-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_addr: walletAddress, config_json: config }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (onSave) onSave(config);
    } catch (err) {
      console.warn('Custom UI save failed:', err.message);
    } finally {
      setSaving(false);
    }
  }, [config, covenant?.tx_id, walletAddress, onSave]);

  if (!isCreator || !canCustomize) {
    return (
      <div className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] text-center">
        <Palette size={24} className="text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-amber-400 font-semibold mb-1">UI Builder Locked</p>
        <p className="text-xs text-gray-500">
          {!isCreator
            ? 'Only the covenant creator can customize the UI.'
            : `Upgrade to CREATOR tier or above to unlock. Current: ${tier}`}
        </p>
      </div>
    );
  }

  // Live Preview styles
  const previewBg = config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' :
                    config.bgStyle === 'dark' ? '#0A0A0D' :
                    config.bgStyle === 'gradient' ? `linear-gradient(${config.gradientDir === 'to-r' ? 'to right' : config.gradientDir === 'to-bl' ? 'to bottom left' : config.gradientDir === 'to-br' ? 'to bottom right' : 'to bottom'}, ${config.primaryColor}10, ${config.gradientColor}10)` : '#111116';
  const glowIntensityMap = { low: '15', medium: '30', high: '60' };
  const glowVal = glowIntensityMap[config.glowIntensity] || '30';
  const borderWidthMap = { none: '0px', thin: '1px', normal: '2px', thick: '3px' };
  const borderW = borderWidthMap[config.borderStyle] || '2px';
  const paddingMap = { compact: '12px', normal: '20px', spacious: '32px' };
  const padVal = paddingMap[config.padding] || '20px';
  const shadowMap = {
    none: 'none',
    soft: '0 4px 12px rgba(0,0,0,0.3)',
    neon: `0 0 20px ${config.primaryColor}${glowVal}, inset 0 0 30px ${config.primaryColor}05`,
    elevated: '0 8px 32px rgba(0,0,0,0.4)',
  };
  const fontMap = { mono: 'font-mono', sans: 'font-sans', serif: 'font-serif' };
  const animClass = {
    none: '', pulse: 'animate-pulse', shimmer: 'animate-pulse',
    float: '', glitch: ''
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-[#49EACB]/5 border border-[#49EACB]/10">
        <Paintbrush size={18} className="text-[#49EACB]" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-widest">Covenant UI Builder</h3>
        <span className="ml-auto px-2 py-0.5 text-[10px] font-bold rounded bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20">{tier}</span>
      </div>

      {/* ─── Sections ──────────────────────────────────── */}

      {/* Colors & Gradients */}
      <Section icon={Palette} title="Colors & Gradients" expanded={expandedSection === 'colors'} onToggle={() => setExpandedSection(s => s === 'colors' ? '' : 'colors')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Neon Accent (12 presets)</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {NEON_COLORS.map((c) => (
            <button key={c}
              onClick={() => setConfig((s) => ({ ...s, primaryColor: c }))}
              className={`h-7 w-7 rounded-full border-2 transition-all ${config.primaryColor === c ? 'border-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: c }} title={c} />
          ))}
          <input type="color" value={config.primaryColor}
            onChange={(e) => setConfig((s) => ({ ...s, primaryColor: e.target.value }))}
            className="h-7 w-7 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Gradient Direction</p>
        <OptionGrid options={GRADIENT_DIRS} selected={config.gradientDir} onSelect={(v) => setConfig(s => ({ ...s, gradientDir: v }))} cols={4} />
        {config.gradientDir !== 'none' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Gradient Color</span>
            <input type="color" value={config.gradientColor}
              onChange={(e) => setConfig((s) => ({ ...s, gradientColor: e.target.value }))}
              className="h-6 w-6 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
          </div>
        )}
      </Section>

      {/* Layout & Style */}
      <Section icon={LayoutTemplate} title="Layout & Style" expanded={expandedSection === 'layout'} onToggle={() => setExpandedSection(s => s === 'layout' ? '' : 'layout')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Layout (5 styles)</p>
        <OptionGrid options={LAYOUTS} selected={config.layout} onSelect={(v) => setConfig(s => ({ ...s, layout: v }))} cols={3} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Background Style</p>
        <OptionGrid options={BG_STYLES} selected={config.bgStyle} onSelect={(v) => setConfig(s => ({ ...s, bgStyle: v }))} cols={2} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Border (4 widths)</p>
        <OptionGrid options={BORDER_STYLES} selected={config.borderStyle} onSelect={(v) => setConfig(s => ({ ...s, borderStyle: v }))} cols={4} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Padding Scale</p>
        <OptionGrid options={PADDING} selected={config.padding} onSelect={(v) => setConfig(s => ({ ...s, padding: v }))} cols={3} />
      </Section>

      {/* Typography */}
      <Section icon={Type} title="Typography" expanded={expandedSection === 'typo'} onToggle={() => setExpandedSection(s => s === 'typo' ? '' : 'typo')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Font Family</p>
        <OptionGrid options={FONTS} selected={config.font} onSelect={(v) => setConfig(s => ({ ...s, font: v }))} cols={3} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Title Override</p>
        <input type="text" value={config.titleOverride}
          onChange={(e) => setConfig((s) => ({ ...s, titleOverride: e.target.value }))}
          placeholder={covenant?.name || covenant?.covenant_type || 'Covenant Title'}
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50" />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Description Override</p>
        <textarea rows="2" value={config.descOverride}
          onChange={(e) => setConfig((s) => ({ ...s, descOverride: e.target.value }))}
          placeholder={covenant?.description || 'Describe your covenant...'}
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50 resize-none" />
      </Section>

      {/* Animations & Effects */}
      <Section icon={Sparkles} title="Animations & Effects" expanded={expandedSection === 'anim'} onToggle={() => setExpandedSection(s => s === 'anim' ? '' : 'anim')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Animation Style</p>
        <OptionGrid options={ANIMATIONS.map(a => ({ val: a, lock: (a === 'glitch' || a === 'shimmer') && !isMax }))} selected={config.animation} onSelect={(v) => setConfig(s => ({ ...s, animation: v }))} cols={3} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Shadow Style</p>
        <OptionGrid options={SHADOWS} selected={config.shadow} onSelect={(v) => setConfig(s => ({ ...s, shadow: v }))} cols={2} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Glow Intensity</p>
        <OptionGrid options={['low', 'medium', 'high']} selected={config.glowIntensity} onSelect={(v) => setConfig(s => ({ ...s, glowIntensity: v }))} cols={3} />
      </Section>

      {/* Components & Widgets */}
      <Section icon={Box} title="Components & Widgets" expanded={expandedSection === 'components'} onToggle={() => setExpandedSection(s => s === 'components' ? '' : 'components')}>
        <div className="space-y-2">
          {[
            { key: 'showGlow', label: 'Neon Glow Border', icon: Eye },
            { key: 'showQR', label: 'Show QR Code', icon: Frame },
            { key: 'showScriptHash', label: 'Show Script Hash', icon: Hash },
            { key: 'showCreator', label: 'Show Creator Address', icon: Cpu },
            { key: 'showBlockDaa', label: 'Show Block DAA Score', icon: Shield },
            { key: 'showTimestamp', label: 'Show Timestamp', icon: Clock },
          ].map(({ key, label, icon: Icon }) => (
            <label key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]">
              <span className="text-xs text-white flex items-center gap-2"><Icon size={12} className="text-[#49EACB]" />{label}</span>
              <input type="checkbox" checked={config[key]} onChange={(e) => setConfig((s) => ({ ...s, [key]: e.target.checked }))} className="w-4 h-4 accent-[#49EACB]" />
            </label>
          ))}
        </div>
      </Section>

      {/* Button Style */}
      <Section icon={Brush} title="Button & Badge Styling" expanded={expandedSection === 'button'} onToggle={() => setExpandedSection(s => s === 'button' ? '' : 'button')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Button Style</p>
        <OptionGrid options={BUTTON_STYLES} selected={config.buttonStyle} onSelect={(v) => setConfig(s => ({ ...s, buttonStyle: v }))} cols={2} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Badge Style</p>
        <OptionGrid options={BADGE_STYLES} selected={config.badgeStyle} onSelect={(v) => setConfig(s => ({ ...s, badgeStyle: v }))} cols={3} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Featured Badge Text</p>
        <input type="text" value={config.featureBadge}
          onChange={(e) => setConfig((s) => ({ ...s, featureBadge: e.target.value }))}
          placeholder="FEATURED COVENANT"
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50" />
      </Section>

      {/* Branding (MAX only) */}
      <Section icon={Globe} title="Branding & Advanced" expanded={expandedSection === 'branding'} onToggle={() => setExpandedSection(s => s === 'branding' ? '' : 'branding')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Logo URL (MAX tier)</p>
        <input type="text" value={config.logoUrl} disabled={!isMax}
          onChange={(e) => setConfig((s) => ({ ...s, logoUrl: e.target.value }))}
          placeholder="https://example.com/logo.png"
          className={`w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50 ${!isMax ? 'opacity-30 cursor-not-allowed' : ''}`} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Custom CSS (MAX tier)</p>
        <textarea rows="3" value={config.customCSS} disabled={!isMax}
          onChange={(e) => setConfig((s) => ({ ...s, customCSS: e.target.value }))}
          placeholder=".my-covenant { border: 1px solid neon; }"
          className={`w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-[#49EACB] text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50 resize-none ${!isMax ? 'opacity-30 cursor-not-allowed' : ''}`} />
      </Section>

      {/* Live Preview Toggle */}
      <button onClick={() => setShowPreview(p => !p)} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors">
        <Monitor size={14} className="text-[#49EACB]" />
        {showPreview ? 'Hide Live Preview' : 'Show Live Preview'}
      </button>

      {/* ─── LIVE PREVIEW ─────────────────────────────── */}
      {showPreview && (
        <div
          className={`rounded-xl overflow-hidden transition-all ${animClass[config.animation]}`}
          style={{
            background: config.bgStyle === 'gradient' && config.gradientDir !== 'none'
              ? (config.gradientDir === 'to-r' ? `linear-gradient(to right, ${config.primaryColor}05, ${config.gradientColor}10)` :
                 config.gradientDir === 'to-bl' ? `linear-gradient(to bottom left, ${config.primaryColor}05, ${config.gradientColor}10)` :
                 `linear-gradient(to bottom right, ${config.primaryColor}05, ${config.gradientColor}10)`)
              : previewBg,
            border: borderW === '0px' ? 'none' : `${borderW} solid ${config.borderStyle === 'none' ? 'transparent' : config.primaryColor + '30'}`,
            boxShadow: config.showGlow ? shadowMap[config.shadow] : shadowMap.soft,
            padding: padVal,
            fontFamily: config.font === 'mono' ? 'monospace' : config.font === 'serif' ? 'serif' : 'sans-serif',
          }}
        >
          {/* Feature Badge */}
          {config.featureBadge && (
            <div className={`text-center py-1.5 rounded mb-3 text-[10px] font-bold uppercase tracking-widest ${
              config.badgeStyle === 'banner' ? 'rounded-none -mx-[' + padVal + ']' :
              config.badgeStyle === 'tag' ? 'inline-block px-3' : 'rounded-lg'
            }`}
            style={{ backgroundColor: `${config.primaryColor}20`, color: config.primaryColor, border: `1px solid ${config.primaryColor}40` }}>
              {config.featureBadge}
            </div>
          )}

          {/* Logo */}
          {config.logoUrl && (
            <div className="flex justify-center mb-3">
              <img src={config.logoUrl} alt="Logo" className="h-8 object-contain rounded" onError={(e) => (e.target.style.display='none')} />
            </div>
          )}

          {/* Title */}
          <h4 className="font-bold text-sm text-white mb-1">
            {config.titleOverride || covenant?.name || covenant?.covenant_type || 'Covenant'}
          </h4>
          <p className="text-[10px] text-gray-500 mb-2" style={{ fontFamily: 'monospace' }}>
            {(covenant?.tx_id || '').slice(0, 16)}...
          </p>

          {/* Description */}
          <p className="text-xs text-gray-400 mb-3">
            {config.descOverride || covenant?.description || 'No description provided.'}
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <p className="text-[9px] text-gray-500">Locked KAS</p>
              <p className="text-xs font-bold" style={{ color: config.primaryColor, fontFamily: 'monospace' }}>
                {(covenant?.amount_kaspa || 0).toLocaleString()} KAS
              </p>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <p className="text-[9px] text-gray-500">Type</p>
              <p className="text-xs text-gray-300">{covenant?.covenant_type || 'P2SH'}</p>
            </div>
          </div>

          {/* Extra stats */}
          {(config.showScriptHash || config.showCreator || config.showBlockDaa || config.showTimestamp) && (
            <div className={`mb-3 p-2 rounded-lg border border-white/5 space-y-1 ${config.font === 'mono' ? 'font-mono' : ''}`}>
              {config.showScriptHash && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-gray-500">Script Hash</span>
                  <span style={{ color: config.primaryColor }}>{(covenant?.script_hash || '').slice(0, 14)}...</span>
                </div>
              )}
              {config.showCreator && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-gray-500">Creator</span>
                  <span className="text-gray-400">{(covenant?.creator_addr || '').slice(0, 14)}...</span>
                </div>
              )}
              {config.showBlockDaa && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-gray-500">Block DAA</span>
                  <span className="text-gray-400">{covenant?.block_daa_score || 0}</span>
                </div>
              )}
              {config.showTimestamp && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-400">{covenant?.timestamp ? new Date(covenant.timestamp * 1000).toLocaleDateString() : 'N/A'}</span>
                </div>
              )}
            </div>
          )}

          {/* Terminal layout */}
          {config.layout === 'terminal' && (
            <div className="p-3 rounded-lg bg-black/60 border border-[#49EACB]/20 font-mono text-xs mb-3">
              <p style={{ color: config.primaryColor }}>$ covenant --query {covenant?.tx_id?.slice(0, 8)}...</p>
              <p style={{ color: config.primaryColor }}>$ locked: {(covenant?.amount_kaspa || 0).toFixed(2)} KAS</p>
              <p className="animate-pulse" style={{ color: config.primaryColor }}>█</p>
            </div>
          )}

          {/* Floating layout elevation */}
          {config.layout === 'floating' && (
            <div className="mb-3" style={{ boxShadow: `0 8px 32px ${config.primaryColor}15` }}>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-[10px] text-gray-400">
                Floating panel — elevated UI for premium covenants.
              </div>
            </div>
          )}

          {/* QR Code */}
          {config.showQR && (
            <div className="mb-3 p-3 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/10 rounded flex items-center justify-center text-[9px] text-gray-500">QR</div>
            </div>
          )}

          {/* Button preview */}
          <button
            className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wide ${
              config.buttonStyle === 'outline' ? 'bg-transparent border-2' :
              config.buttonStyle === 'ghost' ? 'bg-transparent' :
              config.buttonStyle === 'pill' ? 'rounded-full' : ''
            }`}
            style={config.buttonStyle === 'outline' || config.buttonStyle === 'ghost'
              ? { border: config.buttonStyle === 'outline' ? `2px solid ${config.primaryColor}` : 'none', color: config.primaryColor }
              : { backgroundColor: config.primaryColor, color: '#000' }}
          >
            Execute Covenant
          </button>
        </div>
      )}

      {/* ─── SAVE BUTTON ─────────────────────────────── */}
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
      >
        {saving ? (
          <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Saving...</span>
        ) : saved ? (
          <span className="flex items-center gap-2"><CheckCircle2 size={16} />Saved & Published</span>
        ) : (
          <span className="flex items-center gap-2"><Save size={16} />Save UI Configuration</span>
        )}
      </button>
    </div>
  );
}
