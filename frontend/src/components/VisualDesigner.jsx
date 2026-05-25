import { useState, useRef, useCallback } from 'react';
import {
  Layers, Monitor, SlidersHorizontal, Zap, Palette, LayoutTemplate,
  Brush, Box, Sparkles, Droplets, Globe, Eye, Type, Ruler, Frame,
  Image, MoveHorizontal, Save, CheckCircle2, Undo2, Redo2,
  RotateCcw, Download, Upload, FileCode, History, Paintbrush,
  GripHorizontal, ChevronDown, ChevronRight, X, Terminal,
  ShieldCheck, Cpu, Hash, Clock, BadgeCheck, AlertTriangle
} from 'lucide-react';
import CovenantPreview from './CovenantPreview';
import DragDropPanel, { renderWidgetPreview, WIDGET_DEFS, DEFAULT_WIDGET_CONFIG } from './DragDropPanel';

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
const DISPLAY_MODES = ['minimal', 'detailed', 'full', 'compact'];
const GLOW_INTENSITY = ['low', 'medium', 'high'];
const BORDER_RADII = ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'];
const BACKDROP_BLURS = ['none', 'sm', 'md', 'lg'];
const HOVER_EFFECTS = ['none', 'glow', 'lift', 'pulse', 'shimmer'];
const DIVIDER_STYLES = ['none', 'thin', 'gradient', 'neon', 'double'];
const MAX_WIDTHS = ['narrow', 'medium', 'wide', 'full'];

// ─── Sub-components ──────────────────────────────

function OptionGrid({ options, selected, onSelect, cols = 3 }) {
  const GRID_COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };
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

function Section({ icon: Icon, title, expanded, onToggle, children }) {
  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-[#49EACB]" />
          <span className="text-[11px] text-gray-300 uppercase tracking-wider font-semibold">{title}</span>
        </div>
        {expanded ? <ChevronDown size={13} className="text-gray-500" /> : <ChevronRight size={13} className="text-gray-500" />}
      </button>
      {expanded && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────

export default function VisualDesigner({ covenant, walletAddress, onSave, onChange }) {
  const tier = (covenant?.verified_tier || covenant?.tier || 'FREE').toUpperCase();
  const tierVal = { FREE: 0, CREATOR: 1, PRO: 2, MAX: 3 }[tier] || 0;
  const canAccess = tierVal >= 1;
  const isMax = tier === 'MAX';

  // ─── Config State ──────────────────────────────
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
    widgets: [],
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
    customJS: '',
    favicon: '',
    schemaOrg: false,
    gradientSpeed: 'normal',
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedSection, setExpandedSection] = useState('colors');

  // ─── Undo/Redo History ──────────────────────────
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
      const prev = historyStack.current[historyIndex.current];
      setConfig(prev);
      if (onChange) onChange(prev);
    }
  }, [onChange]);

  const redo = useCallback(() => {
    if (historyIndex.current < historyStack.current.length - 1) {
      historyIndex.current++;
      const next = historyStack.current[historyIndex.current];
      setConfig(next);
      if (onChange) onChange(next);
    }
  }, [onChange]);

  const configUpdate = useCallback((updater) => {
    setConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pushHistory(next);
      if (onChange) onChange(next);
      return next;
    });
  }, [pushHistory, onChange]);

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG });
    pushHistory({ ...DEFAULT_CONFIG });
    if (onChange) onChange({ ...DEFAULT_CONFIG });
  }, [DEFAULT_CONFIG, pushHistory, onChange]);

  // ─── Save ──────────────────────────────────────
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

  // ─── Export as HTML ────────────────────────────
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
  .card { max-width: 480px; width: 100%; padding: ${config.padding === 'compact' ? '12px' : config.padding === 'spacious' ? '32px' : '20px'}; border-radius: ${config.borderRadius || '0.75rem'}; background: ${config.bgStyle === 'dark' ? '#0A0A0D' : config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : '#111116'}; border: 1px solid ${config.primaryColor || '#49EACB'}${config.borderOpacity || '30'}; box-shadow: ${config.shadow === 'neon' ? '0 0 20px ' + (config.primaryColor || '#49EACB') + '30' : config.shadow === 'elevated' ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.3)'}; }
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

  // ─── Tier Gate ─────────────────────────────────
  if (!canAccess) {
    return (
      <div className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] text-center">
        <Paintbrush size={24} className="text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-amber-400 font-semibold mb-1">Visual Designer Locked</p>
        <p className="text-xs text-gray-500">
          Upgrade to CREATOR tier or above to access the Visual Designer. Current tier: {tier}.
        </p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ═════ TOP BAR ═════ */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#49EACB]/[0.04] border border-[#49EACB]/[0.08]">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-[#49EACB]" />
          <span className="text-sm font-semibold text-white tracking-wide">Visual Covenant Designer</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20">{tier}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#49EACB] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#49EACB]" />
            </span>
            Live
          </span>
          <span>{WIDGET_DEFS.length} components</span>
        </div>
      </div>

      {/* ═════ 3-PANEL GRID ═════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-4 min-h-[72vh]">

        {/* ── LEFT: Component Library ───────────── */}
        <div className="flex flex-col gap-2 bg-white/[0.01] rounded-xl border border-white/[0.04] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
            <Layers size={13} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-white">Component Library</span>
            <span className="ml-auto text-[9px] text-gray-600">{WIDGET_DEFS.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <DragDropPanel
              tier={tier}
              widgetIds={config.widgets || []}
              onWidgetsChange={(ids) => configUpdate(s => ({ ...s, widgets: ids }))}
              primaryColor={config.primaryColor}
            />
          </div>
        </div>

        {/* ── CENTER: Live Preview ───────────────── */}
        <div className="flex flex-col gap-2 bg-white/[0.01] rounded-xl border border-white/[0.04] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
            <Monitor size={13} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-white">Live Preview</span>
            <span className="ml-auto text-[9px] text-gray-600">WYSIWYG</span>
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#49EACB] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#49EACB]" />
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <CovenantPreview config={config} covenant={covenant}>
              {(config.widgets || []).length > 0 && (
                <div className="mt-4 max-w-md mx-auto space-y-3">
                  {(config.widgets || []).map(wid => (
                    <div key={wid}>
                      {renderWidgetPreview(wid, DEFAULT_WIDGET_CONFIG[wid] || {}, config.primaryColor, covenant)}
                    </div>
                  ))}
                </div>
              )}
            </CovenantPreview>
          </div>
        </div>

        {/* ── RIGHT: Inspector ───────────────────── */}
        <div className="flex flex-col gap-2 bg-white/[0.01] rounded-xl border border-white/[0.04] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
            <SlidersHorizontal size={13} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-white">Inspector</span>
            <span className="ml-auto text-[9px] text-gray-600">50+ options</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Colors & Gradients */}
            <Section icon={Palette} title="Colors & Gradients" expanded={expandedSection === 'colors'} onToggle={() => setExpandedSection(s => s === 'colors' ? '' : 'colors')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Neon Accent (12 presets)</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {NEON_COLORS.map((c) => (
                  <button key={c}
                    onClick={() => configUpdate((s) => ({ ...s, primaryColor: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${config.primaryColor === c ? 'border-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c }} title={c} />
                ))}
                <input type="color" value={config.primaryColor}
                  onChange={(e) => configUpdate((s) => ({ ...s, primaryColor: e.target.value }))}
                  className="h-7 w-7 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
              </div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Gradient Direction</p>
              <OptionGrid options={GRADIENT_DIRS} selected={config.gradientDir} onSelect={(v) => configUpdate(s => ({ ...s, gradientDir: v }))} cols={4} />
              {config.gradientDir !== 'none' && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500">Gradient Color</span>
                  <input type="color" value={config.gradientColor}
                    onChange={(e) => configUpdate((s) => ({ ...s, gradientColor: e.target.value }))}
                    className="h-6 w-6 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
                </div>
              )}
            </Section>

            {/* Layout & Style */}
            <Section icon={LayoutTemplate} title="Layout & Style" expanded={expandedSection === 'layout'} onToggle={() => setExpandedSection(s => s === 'layout' ? '' : 'layout')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Layout (5 styles)</p>
              <OptionGrid options={LAYOUTS} selected={config.layout} onSelect={(v) => configUpdate(s => ({ ...s, layout: v }))} cols={3} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Background Style</p>
              <OptionGrid options={BG_STYLES} selected={config.bgStyle} onSelect={(v) => configUpdate(s => ({ ...s, bgStyle: v }))} cols={2} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Border (4 widths)</p>
              <OptionGrid options={BORDER_STYLES} selected={config.borderStyle} onSelect={(v) => configUpdate(s => ({ ...s, borderStyle: v }))} cols={4} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Padding Scale</p>
              <OptionGrid options={PADDING} selected={config.padding} onSelect={(v) => configUpdate(s => ({ ...s, padding: v }))} cols={3} />
            </Section>

            {/* Typography */}
            <Section icon={Type} title="Typography" expanded={expandedSection === 'typo'} onToggle={() => setExpandedSection(s => s === 'typo' ? '' : 'typo')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Font Family</p>
              <OptionGrid options={FONTS} selected={config.font} onSelect={(v) => configUpdate(s => ({ ...s, font: v }))} cols={3} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Title Override</p>
              <input type="text" value={config.titleOverride}
                onChange={(e) => configUpdate((s) => ({ ...s, titleOverride: e.target.value }))}
                placeholder={covenant?.name || 'Covenant Title'}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-[#49EACB]/50" />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Description Override</p>
              <textarea rows="2" value={config.descOverride}
                onChange={(e) => configUpdate((s) => ({ ...s, descOverride: e.target.value }))}
                placeholder={covenant?.description || 'Describe your covenant...'}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-[#49EACB]/50 resize-none" />
            </Section>

            {/* Animations & Effects */}
            <Section icon={Sparkles} title="Animations & Effects" expanded={expandedSection === 'anim'} onToggle={() => setExpandedSection(s => s === 'anim' ? '' : 'anim')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Animation Style</p>
              <OptionGrid options={ANIMATIONS.map(a => ({ val: a, lock: (a === 'glitch' || a === 'shimmer') && !isMax }))} selected={config.animation} onSelect={(v) => configUpdate(s => ({ ...s, animation: v }))} cols={3} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Shadow Style</p>
              <OptionGrid options={SHADOWS} selected={config.shadow} onSelect={(v) => configUpdate(s => ({ ...s, shadow: v }))} cols={2} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Glow Intensity</p>
              <OptionGrid options={GLOW_INTENSITY} selected={config.glowIntensity} onSelect={(v) => configUpdate(s => ({ ...s, glowIntensity: v }))} cols={3} />
            </Section>

            {/* Components & Widgets */}
            <Section icon={Box} title="Components & Widgets" expanded={expandedSection === 'components'} onToggle={() => setExpandedSection(s => s === 'components' ? '' : 'components')}>
              <div className="space-y-2">
                {[
                  { key: 'showGlow', label: 'Neon Glow Border', icon: Eye },
                  { key: 'showQR', label: 'Show QR Code', icon: Frame },
                  { key: 'showScriptHash', label: 'Show Script Hash', icon: Hash },
                  { key: 'showCreator', label: 'Show Creator Address', icon: Cpu },
                  { key: 'showBlockDaa', label: 'Show Block DAA Score', icon: ShieldCheck },
                  { key: 'showTimestamp', label: 'Show Timestamp', icon: Clock },
                ].map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]">
                    <span className="text-xs text-white flex items-center gap-2"><Icon size={12} className="text-[#49EACB]" />{label}</span>
                    <input type="checkbox" checked={config[key]} onChange={(e) => configUpdate((s) => ({ ...s, [key]: e.target.checked }))} className="w-4 h-4 accent-[#49EACB]" />
                  </label>
                ))}
              </div>
            </Section>

            {/* Advanced Visual Effects */}
            <Section icon={Droplets} title="Advanced Effects" expanded={expandedSection === 'advanced'} onToggle={() => setExpandedSection(s => s === 'advanced' ? '' : 'advanced')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Border Radius</p>
              <OptionGrid options={BORDER_RADII} selected={config.borderRadius} onSelect={(v) => configUpdate(s => ({ ...s, borderRadius: v }))} cols={4} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Backdrop Blur</p>
              <OptionGrid options={BACKDROP_BLURS} selected={config.backdropBlur} onSelect={(v) => configUpdate(s => ({ ...s, backdropBlur: v }))} cols={4} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Glass Tint Color</p>
              <div className="flex items-center gap-2">
                <input type="color" value={config.glassTint}
                  onChange={(e) => configUpdate((s) => ({ ...s, glassTint: e.target.value }))}
                  className="h-6 w-6 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
                <span className="text-[9px] text-gray-400">{config.glassTint}</span>
              </div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Border Glow Opacity</p>
              <OptionGrid options={['10', '20', '30', '50', '70']} selected={config.borderOpacity} onSelect={(v) => configUpdate(s => ({ ...s, borderOpacity: v }))} cols={5} />
              <div className="mt-2 space-y-2">
                {[
                  { key: 'textGlow', label: 'Text Glow Effect', icon: Type },
                  { key: 'gradientAnimate', label: 'Animated Gradient', icon: Sparkles },
                ].map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]">
                    <span className="text-xs text-white flex items-center gap-2"><Icon size={12} className="text-[#49EACB]" />{label}</span>
                    <input type="checkbox" checked={config[key]} onChange={(e) => configUpdate((s) => ({ ...s, [key]: e.target.checked }))} className="w-4 h-4 accent-[#49EACB]" />
                  </label>
                ))}
              </div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Hover Effect</p>
              <OptionGrid options={HOVER_EFFECTS} selected={config.hoverEffect} onSelect={(v) => configUpdate(s => ({ ...s, hoverEffect: v }))} cols={3} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Divider Style</p>
              <OptionGrid options={DIVIDER_STYLES} selected={config.dividerStyle} onSelect={(v) => configUpdate(s => ({ ...s, dividerStyle: v }))} cols={3} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Max Card Width</p>
              <OptionGrid options={MAX_WIDTHS} selected={config.maxWidth} onSelect={(v) => configUpdate(s => ({ ...s, maxWidth: v }))} cols={4} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Gradient Animation Speed</p>
              <OptionGrid options={[
                { val: 'slow', lock: !isMax },
                { val: 'normal' },
                { val: 'fast', lock: !isMax },
              ]} selected={config.gradientSpeed} onSelect={(v) => configUpdate(s => ({ ...s, gradientSpeed: v }))} cols={3} />
            </Section>

            {/* Button & Badge */}
            <Section icon={Brush} title="Button & Badge" expanded={expandedSection === 'button'} onToggle={() => setExpandedSection(s => s === 'button' ? '' : 'button')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Button Style</p>
              <OptionGrid options={BUTTON_STYLES} selected={config.buttonStyle} onSelect={(v) => configUpdate(s => ({ ...s, buttonStyle: v }))} cols={2} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Badge Style</p>
              <OptionGrid options={BADGE_STYLES} selected={config.badgeStyle} onSelect={(v) => configUpdate(s => ({ ...s, badgeStyle: v }))} cols={3} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Featured Badge Text</p>
              <input type="text" value={config.featureBadge}
                onChange={(e) => configUpdate((s) => ({ ...s, featureBadge: e.target.value }))}
                placeholder="FEATURED COVENANT"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-[#49EACB]/50" />
            </Section>

            {/* Data & Display */}
            <Section icon={Eye} title="Data & Display" expanded={expandedSection === 'data'} onToggle={() => setExpandedSection(s => s === 'data' ? '' : 'data')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Display Mode</p>
              <OptionGrid options={DISPLAY_MODES} selected={config.displayMode} onSelect={(v) => configUpdate(s => ({ ...s, displayMode: v }))} cols={2} />
              <div className="mt-2 space-y-2">
                {[
                  { key: 'showNetworkBadge', label: 'Network Badge (TN-12)', icon: Globe },
                  { key: 'showCategory', label: 'Show Category Tag', icon: Hash },
                  { key: 'showLockedSince', label: 'Show Locked Since', icon: Clock },
                  { key: 'showConfirmations', label: 'Show Confirmations', icon: ShieldCheck },
                  { key: 'showOutputAddresses', label: 'Show Output Addresses', icon: Terminal },
                ].map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]">
                    <span className="text-xs text-white flex items-center gap-2"><Icon size={12} className="text-[#49EACB]" />{label}</span>
                    <input type="checkbox" checked={config[key]} onChange={(e) => configUpdate((s) => ({ ...s, [key]: e.target.checked }))} className="w-4 h-4 accent-[#49EACB]" />
                  </label>
                ))}
              </div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Secondary Button Label</p>
              <input type="text" value={config.buttonSecondary}
                onChange={(e) => configUpdate((s) => ({ ...s, buttonSecondary: e.target.value }))}
                placeholder="View Details"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-[#49EACB]/50" />
            </Section>

            {/* Branding & Advanced (MAX) */}
            <Section icon={Globe} title="Branding & Advanced" expanded={expandedSection === 'branding'} onToggle={() => setExpandedSection(s => s === 'branding' ? '' : 'branding')}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Logo URL {!isMax && <span className="text-[#E8AF34]">(MAX)</span>}</p>
              <input type="text" value={config.logoUrl}
                onChange={(e) => isMax ? configUpdate((s) => ({ ...s, logoUrl: e.target.value })) : null}
                disabled={!isMax}
                placeholder="https://example.com/logo.png"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-[#49EACB]/50 disabled:opacity-30" />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1">Custom CSS {!isMax && <span className="text-[#E8AF34]">(MAX)</span>}</p>
              <textarea rows="3" value={config.customCSS}
                onChange={(e) => isMax ? configUpdate((s) => ({ ...s, customCSS: e.target.value })) : null}
                disabled={!isMax}
                placeholder=".my-class { background: neon; }"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-[#49EACB]/50 disabled:opacity-30 resize-none font-mono" />
            </Section>
          </div>
        </div>

      </div>

      {/* ═════ BOTTOM: Actions Bar ═════ */}
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04]">
        <button onClick={undo} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-gray-400 hover:text-white text-[10px] transition-colors" title="Undo">
          <Undo2 size={12} /> Undo
        </button>
        <button onClick={redo} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-gray-400 hover:text-white text-[10px] transition-colors" title="Redo">
          <Redo2 size={12} /> Redo
        </button>
        <button onClick={resetConfig} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-gray-400 hover:text-white text-[10px] transition-colors" title="Reset to defaults">
          <RotateCcw size={12} /> Reset
        </button>
        <div className="flex-1" />
        <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#49EACB]/20 bg-[#49EACB]/[0.06] hover:bg-[#49EACB]/[0.1] text-[#49EACB] text-[10px] transition-colors" title="Export as HTML template">
          <Download size={12} /> Export
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold text-[10px] transition-all shadow-[0_0_15px_rgba(73,234,203,0.2)] disabled:opacity-50">
          {saved ? <CheckCircle2 size={12} /> : saving ? <span className="animate-pulse">Saving...</span> : <><Save size={12} /> Save</>}
        </button>
      </div>
    </div>
  );
}
