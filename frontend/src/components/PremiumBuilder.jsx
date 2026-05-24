import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Paintbrush, Palette, LayoutTemplate, Type, Ruler, Save, CheckCircle2,
  Monitor, Eye, Layers, Zap, Image, ChevronDown, ChevronRight,
  Brush, Globe, Box, Frame, Sparkles, Droplets, Cpu, Terminal,
  Shield, Clock, Hash, MoveHorizontal, Calendar, Undo2, Redo2,
  RotateCcw, Download, Upload, History, FileCode, Edit3
} from 'lucide-react';
import DragDropPanel, { renderWidgetPreview } from './DragDropPanel';
import CovenantPreview from './CovenantPreview';

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

const GRID_COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

function OptionGrid({ options, selected, onSelect, cols = 3 }) {
  return (
    <div className={`grid ${GRID_COLS[cols] || 'grid-cols-3'} gap-2`}>
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

export default function PremiumBuilder({ covenant, walletAddress, onSave, onChange }) {
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
    widgets: [],
    // Advanced Visuals
    borderRadius: 'md',
    backdropBlur: 'sm',
    borderOpacity: '30',
    glassTint: '#49EACB',
    textGlow: false,
    gradientAnimate: false,
    hoverEffect: 'glow',
    dividerStyle: 'thin',
    maxWidth: 'medium',
    overlayOpacity: '5',
    // Data & Display
    showNetworkBadge: true,
    showCategory: true,
    showLockedSince: false,
    showConfirmations: false,
    showOutputAddresses: false,
    displayMode: 'detailed',
    buttonSecondary: '',
    loadingAnimation: 'skeleton',
    metaTitle: '',
    metaDescription: '',
    // MAX-tier only
    customJS: '',
    favicon: '',
    schemaOrg: false,
    gradientSpeed: 'normal',
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

  // ─── Undo/Redo History ────────────────────────────
  const DEFAULT_CONFIG = { ...config };
  const historyStack = useRef([{ ...DEFAULT_CONFIG }]);
  const historyIndex = useRef(0);

  const pushHistory = useCallback((cfg) => {
    historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
    historyStack.current.push({ ...cfg });
    historyIndex.current = historyStack.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndex.current > 0) {
      historyIndex.current--;
      return historyStack.current[historyIndex.current];
    }
    return config;
  }, [config]);

  const redo = useCallback(() => {
    if (historyIndex.current < historyStack.current.length - 1) {
      historyIndex.current++;
      return historyStack.current[historyIndex.current];
    }
    return config;
  }, [config]);

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG });
    pushHistory({ ...DEFAULT_CONFIG });
  }, []);

  // Auto-push config changes to history (debounced by config key)
  const configUpdate = useCallback((updater) => {
    setConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  // Export as self-contained HTML
  const handleExport = useCallback(() => {
    const name = config.titleOverride || covenant?.name || 'Covenant';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — Covex Covenant</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #05050A; color: #fff; font-family: ${config.font === 'mono' ? 'monospace' : config.font === 'serif' ? 'serif' : 'sans-serif'}; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .card { max-width: 480px; width: 100%; padding: ${config.padding === 'compact' ? '12px' : config.padding === 'spacious' ? '32px' : '20px'}; border-radius: ${config.borderRadius === 'none' ? '0' : config.borderRadius === 'sm' ? '0.375rem' : config.borderRadius === 'md' ? '0.75rem' : config.borderRadius === 'lg' ? '1rem' : '0.75rem'}; background: ${config.bgStyle === 'dark' ? '#0A0A0D' : config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : '#111116'}; border: 1px solid ${config.primaryColor || '#49EACB'}${config.borderOpacity || '30'}; box-shadow: ${config.shadow === 'neon' ? '0 0 20px ' + (config.primaryColor || '#49EACB') + '30' : config.shadow === 'elevated' ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.3)'}; }
  .title { font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem; }
  .subtitle { color: #6b7280; font-size: 0.65rem; font-family: monospace; margin-bottom: 0.5rem; }
  .desc { color: #9ca3af; font-size: 0.7rem; margin-bottom: 0.75rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem; }
  .stat { padding: 0.5rem; border-radius: 0.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); }
  .stat-label { color: #6b7280; font-size: 0.6rem; }
  .stat-val { font-size: 0.7rem; font-weight: 700; font-family: monospace; color: ${config.primaryColor || '#49EACB'}; }
  .btn { width: 100%; padding: 0.5rem; border-radius: 0.5rem; background: ${config.primaryColor || '#49EACB'}; color: #000; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; border: none; cursor: pointer; }
  .badge { text-align: center; padding: 0.25rem 0; margin-bottom: 0.5rem; border-radius: 0.5rem; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: ${(config.primaryColor || '#49EACB')}20; color: ${config.primaryColor || '#49EACB'}; border: 1px solid ${(config.primaryColor || '#49EACB')}40; }
</style>
</head>
<body>
<div class="card">
${config.featureBadge ? '<div class="badge">' + config.featureBadge + '</div>' : ''}
${config.logoUrl ? '<div style="text-align:center;margin-bottom:0.75rem"><img src="' + config.logoUrl + '" alt="logo" style="height:2rem;object-fit:contain"></div>' : ''}
<div class="title">${config.titleOverride || covenant?.name || 'Covenant'}</div>
<div class="subtitle">${(covenant?.tx_id || '').slice(0, 16)}...</div>
<div class="desc">${config.descOverride || covenant?.description || 'Covenant deployed on Kaspa BlockDAG.'}</div>
<div class="grid">
  <div class="stat"><div class="stat-label">Locked KAS</div><div class="stat-val">${(covenant?.amount_kaspa || 0).toLocaleString()} KAS</div></div>
  <div class="stat"><div class="stat-label">Type</div><div class="stat-val" style="color:#d1d5db">${covenant?.covenant_type || 'P2SH'}</div></div>
</div>
<button class="btn" onclick="window.open('${window.location.href}','_blank')">View on Covex</button>
</div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_covenant.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [config, covenant]);

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

  // Notify parent of config changes for live preview sync
  useEffect(() => {
    if (onChange) onChange(config);
  }, [config, onChange]);

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
    float: 'animate-bounce', glitch: 'animate-pulse'
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

      {/* Drag & Drop Widget Builder */}
      <Section icon={MoveHorizontal} title="Drag & Drop Widgets" expanded={expandedSection === 'dragdrop'} onToggle={() => setExpandedSection(s => s === 'dragdrop' ? '' : 'dragdrop')}>
        <DragDropPanel
          tier={tier}
          widgetIds={config.widgets || []}
          onWidgetsChange={(ids) => setConfig(s => ({ ...s, widgets: ids }))}
          primaryColor={config.primaryColor}
        />
      </Section>

      {/* Advanced Visual Effects */}
      <Section icon={Droplets} title="Advanced Visual Effects" expanded={expandedSection === 'advanced'} onToggle={() => setExpandedSection(s => s === 'advanced' ? '' : 'advanced')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Border Radius</p>
        <OptionGrid options={['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full']} selected={config.borderRadius} onSelect={(v) => setConfig(s => ({ ...s, borderRadius: v }))} cols={4} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Glass Effect — Backdrop Blur</p>
        <OptionGrid options={['none', 'sm', 'md', 'lg']} selected={config.backdropBlur} onSelect={(v) => setConfig(s => ({ ...s, backdropBlur: v }))} cols={4} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Glass Tint Color</p>
        <div className="flex items-center gap-2">
          <input type="color" value={config.glassTint}
            onChange={(e) => setConfig((s) => ({ ...s, glassTint: e.target.value }))}
            className="h-6 w-6 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
          <span className="text-[10px] text-gray-400">{config.glassTint}</span>
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Border Glow Opacity</p>
        <OptionGrid options={['10', '20', '30', '50', '70']} selected={config.borderOpacity} onSelect={(v) => setConfig(s => ({ ...s, borderOpacity: v }))} cols={5} />
        <div className="mt-3 space-y-2">
          {[
            { key: 'textGlow', label: 'Text Glow Effect', icon: Type },
            { key: 'gradientAnimate', label: 'Animated Gradient', icon: Sparkles },
          ].map(({ key, label, icon: Icon }) => (
            <label key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]">
              <span className="text-xs text-white flex items-center gap-2"><Icon size={12} className="text-[#49EACB]" />{label}</span>
              <input type="checkbox" checked={config[key]} onChange={(e) => setConfig((s) => ({ ...s, [key]: e.target.checked }))} className="w-4 h-4 accent-[#49EACB]" />
            </label>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Hover Effect</p>
        <OptionGrid options={['none', 'glow', 'lift', 'pulse', 'shimmer']} selected={config.hoverEffect} onSelect={(v) => setConfig(s => ({ ...s, hoverEffect: v }))} cols={3} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Divider Style</p>
        <OptionGrid options={['none', 'thin', 'gradient', 'neon', 'double']} selected={config.dividerStyle} onSelect={(v) => setConfig(s => ({ ...s, dividerStyle: v }))} cols={3} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Max Card Width</p>
        <OptionGrid options={['narrow', 'medium', 'wide', 'full']} selected={config.maxWidth} onSelect={(v) => setConfig(s => ({ ...s, maxWidth: v }))} cols={4} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Gradient Animation Speed (MAX)</p>
        <OptionGrid options={[
          { val: 'slow', lock: !isMax },
          { val: 'normal' },
          { val: 'fast', lock: !isMax },
        ]} selected={config.gradientSpeed} onSelect={(v) => setConfig(s => ({ ...s, gradientSpeed: v }))} cols={3} />
      </Section>

      {/* Data & Display */}
      <Section icon={Eye} title="Data & Display" expanded={expandedSection === 'data'} onToggle={() => setExpandedSection(s => s === 'data' ? '' : 'data')}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Display Mode</p>
        <OptionGrid options={['minimal', 'detailed', 'full', 'compact']} selected={config.displayMode} onSelect={(v) => setConfig(s => ({ ...s, displayMode: v }))} cols={2} />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Loading Animation</p>
        <OptionGrid options={['skeleton', 'pulse', 'spinner', 'none']} selected={config.loadingAnimation} onSelect={(v) => setConfig(s => ({ ...s, loadingAnimation: v }))} cols={2} />
        <div className="mt-3 space-y-2">
          {[
            { key: 'showNetworkBadge', label: 'Network Badge (TN-12)', icon: Globe },
            { key: 'showCategory', label: 'Show Category Tag', icon: Hash },
            { key: 'showLockedSince', label: 'Show Locked Since', icon: Calendar },
            { key: 'showConfirmations', label: 'Show Confirmations', icon: Shield },
            { key: 'showOutputAddresses', label: 'Show Output Addresses', icon: Database },
          ].map(({ key, label, icon: Icon }) => (
            <label key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]">
              <span className="text-xs text-white flex items-center gap-2"><Icon size={12} className="text-[#49EACB]" />{label}</span>
              <input type="checkbox" checked={config[key]} onChange={(e) => setConfig((s) => ({ ...s, [key]: e.target.checked }))} className="w-4 h-4 accent-[#49EACB]" />
            </label>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Secondary Button Label</p>
        <input type="text" value={config.buttonSecondary}
          onChange={(e) => setConfig((s) => ({ ...s, buttonSecondary: e.target.value }))}
          placeholder="View Details"
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50" />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Meta Title (SEO)</p>
        <input type="text" value={config.metaTitle}
          onChange={(e) => setConfig((s) => ({ ...s, metaTitle: e.target.value }))}
          placeholder={covenant?.name || 'Covenant Page'}
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50" />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Meta Description (SEO)</p>
        <textarea rows="2" value={config.metaDescription}
          onChange={(e) => setConfig((s) => ({ ...s, metaDescription: e.target.value }))}
          placeholder="View this covenant on Covex."
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50 resize-none" />
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
        <CovenantPreview config={config} covenant={covenant} />
      )}

      {/* ─── POWER TOOLS ─────────────────────────────── */}
      <Section icon={Zap} title="Power Tools & History" expanded={expandedSection === 'powertools'} onToggle={() => setExpandedSection(s => s === 'powertools' ? '' : 'powertools')}>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setConfig(undo())}
            disabled={historyIndex.current <= 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white hover:bg-white/[0.04] disabled:opacity-30 transition-all"
            title="Undo"
          >
            <Undo2 size={12} /> Undo
          </button>
          <button
            onClick={() => setConfig(redo())}
            disabled={historyIndex.current >= historyStack.current.length - 1}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white hover:bg-white/[0.04] disabled:opacity-30 transition-all"
            title="Redo"
          >
            <Redo2 size={12} /> Redo
          </button>
          <button
            onClick={() => resetConfig()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/[0.04] text-xs text-red-400 hover:bg-red-500/[0.08] transition-all ml-auto"
            title="Reset to default"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#E8AF34]/20 bg-[#E8AF34]/[0.04] text-xs text-[#E8AF34] hover:bg-[#E8AF34]/[0.08] transition-all flex-1"
          >
            <Download size={12} /> Export HTML
          </button>
          <label className="flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.04] text-xs text-blue-400 hover:bg-blue-500/[0.08] transition-all cursor-pointer flex-1">
            <Upload size={12} /> Upload Logo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => setConfig(s => ({ ...s, logoUrl: ev.target.result }));
              reader.readAsDataURL(file);
            }} />
          </label>
        </div>
        {/* Version history summary */}
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-[10px] text-gray-500">
          <p className="flex items-center gap-1 mb-1"><History size={10} className="text-[#49EACB]" /> Version History: {historyStack.current.length} snapshots • Auto-saved on each save</p>
          <p className="text-[9px] text-gray-600">Use Ctrl+Z / Ctrl+Y or the undo/redo buttons • Reset reverts to factory defaults</p>
        </div>
        {/* MAX-tier: Raw JS editor */}
        {isMax && (
          <div className="mt-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Raw JavaScript Inject (MAX)</p>
            <textarea rows="3" value={config.customJS}
              onChange={(e) => setConfig((s) => ({ ...s, customJS: e.target.value }))}
              placeholder="console.log('Custom JS runs on covenant page');"
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-[#E8AF34] text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#E8AF34]/50 resize-none" />
          </div>
        )}
      </Section>

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
