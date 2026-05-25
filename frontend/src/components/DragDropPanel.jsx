import { useState, useRef, useCallback } from 'react';
import {
  GripHorizontal, Trash2, QrCode, TrendingUp, Calendar,
  Image, Globe, FileText, BarChart3, Activity, Database,
  Layers, Server, Terminal, X, Frame, Award, Hash, Minus,
  User, Share2, Clock, Info, Clipboard, Tags, Grid3x3, Type,
  ShieldCheck, BadgeCheck, AlertTriangle, Bell, HelpCircle,
  GitBranch, Star, ScrollText, Lock, Users, CalendarDays,
  Timer, History, Sparkles, Scan, DollarSign, Wifi, Box,
  Fuel, Waves, Network, Calculator, Sprout, ImagePlus,
  ArrowLeftRight, Droplets, Vote, Link, Trophy, Medal,
  Gem, Eye, AlertCircle
} from 'lucide-react';

const WIDGET_DEFS = [
  // === CREATOR TIER (1-19) ===
  { id: 'live_balance',    label: 'Live Balance',       icon: TrendingUp,  tier: 'CREATOR', desc: 'Real-time KAS balance display' },
  { id: 'tx_history',        label: 'Tx History',         icon: Activity,    tier: 'CREATOR', desc: 'Recent transaction preview' },
  { id: 'qr_code',           label: 'QR Code',            icon: QrCode,      tier: 'CREATOR', desc: 'Payment QR for this covenant' },
  { id: 'custom_button',     label: 'Custom Button',      icon: Layers,      tier: 'CREATOR', desc: 'Custom CTA button with link' },
  { id: 'address_card',      label: 'Address Card',         icon: Database,    tier: 'CREATOR', desc: 'Formatted creator address' },
  { id: 'status_badge',      label: 'Status Badge',         icon: Activity,    tier: 'CREATOR', desc: 'Active/Completed/Pending badge' },
  { id: 'progress_bar',      label: 'Progress Bar',         icon: BarChart3,   tier: 'CREATOR', desc: 'Visual progress indicator' },
  { id: 'neon_frame',        label: 'Neon Frame',           icon: Frame,       tier: 'CREATOR', desc: 'Glowing border container' },
  { id: 'badge_collection',    label: 'Badge Collection',     icon: Award,       tier: 'CREATOR', desc: 'Stacked achievement badges' },
  { id: 'stat_counter',      label: 'Stat Counter',         icon: Hash,        tier: 'CREATOR', desc: 'Animated number counter' },
  { id: 'divider_line',      label: 'Divider Line',         icon: Minus,       tier: 'CREATOR', desc: 'Thematic section separator' },
  { id: 'avatar_display',    label: 'Avatar Display',       icon: User,        tier: 'CREATOR', desc: 'Circular profile image' },
  { id: 'social_links',      label: 'Social Links',           icon: Share2,      tier: 'CREATOR', desc: 'Twitter/X, Discord, GitHub icons' },
  { id: 'timeline',          label: 'Timeline',             icon: Clock,       tier: 'CREATOR', desc: 'Vertical event timeline' },
  { id: 'info_box',          label: 'Info Box',             icon: Info,        tier: 'CREATOR', desc: 'Callout with icon and text' },
  { id: 'copy_field',        label: 'Copy Field',           icon: Clipboard,   tier: 'CREATOR', desc: 'Click-to-copy text field' },
  { id: 'tag_cloud',         label: 'Tag Cloud',            icon: Tags,        tier: 'CREATOR', desc: 'Keyword tag bubbles' },
  { id: 'icon_grid',         label: 'Icon Grid',            icon: Grid3x3,     tier: 'CREATOR', desc: '3x3 feature icon grid' },
  { id: 'marquee_text',      label: 'Marquee Text',         icon: Type,        tier: 'CREATOR', desc: 'Scrolling announcement bar' },
  // === PRO TIER (20-38) ===
  { id: 'script_viewer',     label: 'Script Viewer',        icon: FileText,    tier: 'PRO',     desc: 'Scrollable script hex panel' },
  { id: 'logo',              label: 'Logo / Image',         icon: Image,       tier: 'PRO',     desc: 'Upload custom logo/image' },
  { id: 'data_grid',         label: 'Data Grid',            icon: BarChart3,   tier: 'PRO',     desc: 'Key-value data display' },
  { id: 'countdown_timer',   label: 'Countdown Timer',      icon: Calendar,    tier: 'PRO',     desc: 'Timelock countdown widget' },
  { id: 'trust_meter',       label: 'Trust Meter',          icon: ShieldCheck, tier: 'PRO',     desc: 'Visual trust score gauge' },
  { id: 'verification_badge',label: 'Verification Badge',   icon: BadgeCheck,  tier: 'PRO',     desc: 'On-chain verification stamp' },
  { id: 'metric_card',       label: 'Metric Card',          icon: Activity,    tier: 'PRO',     desc: 'Big number with trend arrow' },
  { id: 'comparison_table',  label: 'Comparison Table',     icon: Grid3x3,     tier: 'PRO',     desc: 'Side-by-side feature comparison' },
  { id: 'alert_banner',      label: 'Alert Banner',         icon: AlertTriangle,tier:'PRO',     desc: 'Warning or info banner strip' },
  { id: 'notification_dot',  label: 'Notification Dot',     icon: Bell,        tier: 'PRO',     desc: 'Pulsing status indicator' },
  { id: 'tooltip_box',       label: 'Tooltip Box',          icon: HelpCircle,  tier: 'PRO',     desc: 'Hoverable info tooltip' },
  { id: 'progress_timeline',   label: 'Progress Timeline',    icon: GitBranch,   tier: 'PRO',     desc: 'Milestone step tracker' },
  { id: 'rating_stars',      label: 'Rating Stars',         icon: Star,        tier: 'PRO',     desc: 'Star rating display' },
  { id: 'contract_terms',    label: 'Contract Terms',       icon: ScrollText,  tier: 'PRO',     desc: 'Collapsible terms panel' },
  { id: 'escrow_status',     label: 'Escrow Status',        icon: Lock,        tier: 'PRO',     desc: 'Multi-party escrow tracker' },
  { id: 'multi_sig_indicator',label:'Multi-Sig Indicator',  icon: Users,       tier: 'PRO',     desc: 'N-of-M signature visualizer' },
  { id: 'vesting_schedule',  label: 'Vesting Schedule',     icon: CalendarDays,tier: 'PRO',     desc: 'Token unlocking calendar' },
  { id: 'auction_timer',     label: 'Auction Timer',        icon: Timer,       tier: 'PRO',     desc: 'Bid countdown with price' },
  { id: 'bid_history',       label: 'Bid History',          icon: History,     tier: 'PRO',     desc: 'Descending bid list' },
  // === MAX TIER (39-60) ===
  { id: 'embeddable_link',   label: 'Embedded Link',        icon: Globe,       tier: 'MAX',     desc: 'iFrame/embeddable URL widget' },
  { id: 'raw_html',          label: 'Raw HTML Block',       icon: Server,      tier: 'MAX',     desc: 'Inject arbitrary HTML snippet' },
  { id: 'chart_widget',      label: 'Chart / Sparkline',    icon: BarChart3,   tier: 'MAX',     desc: 'Locked-amount sparkline chart' },
  { id: 'particle_background',label:'Particle Background',   icon: Sparkles,    tier: 'MAX',     desc: 'Animated particle canvas' },
  { id: 'hologram_card',     label: 'Hologram Card',        icon: Scan,        tier: 'MAX',     desc: '3D tilt holographic card' },
  { id: 'crypto_price_ticker',label:'Price Ticker',         icon: DollarSign,  tier: 'MAX',     desc: 'Live KAS/USD price strip' },
  { id: 'network_status',    label: 'Network Status',       icon: Wifi,        tier: 'MAX',     desc: 'BlockDAG health monitor' },
  { id: 'block_counter',     label: 'Block Counter',        icon: Box,         tier: 'MAX',     desc: 'Real-time block height' },
  { id: 'gas_estimator',     label: 'Gas Estimator',        icon: Fuel,        tier: 'MAX',     desc: 'Fee predictor widget' },
  { id: 'mempool_visualizer',label: 'Mempool Viz',          icon: Waves,       tier: 'MAX',     desc: 'Pending tx visualizer' },
  { id: 'dag_graph',         label: 'DAG Mini-Graph',       icon: Network,     tier: 'MAX',     desc: 'Tiny BlockDAG topology' },
  { id: 'validator_list',    label: 'Validator List',       icon: Server,      tier: 'MAX',     desc: 'Active validator roster' },
  { id: 'staking_calculator',label: 'Staking Calculator',   icon: Calculator,  tier: 'MAX',     desc: 'APY projection tool' },
  { id: 'yield_farm_card',   label: 'Yield Farm Card',      icon: Sprout,      tier: 'MAX',     desc: 'Farming pool stats card' },
  { id: 'nft_gallery',       label: 'NFT Gallery',          icon: ImagePlus,   tier: 'MAX',     desc: 'Carousel of token images' },
  { id: 'token_swap_widget', label: 'Swap Widget',          icon: ArrowLeftRight,tier:'MAX',     desc: 'Token pair swap preview' },
  { id: 'liquidity_pool_card',label:'Liquidity Pool',       icon: Droplets,    tier: 'MAX',     desc: 'Pool depth and APR' },
  { id: 'governance_poll',   label: 'Governance Poll',      icon: Vote,        tier: 'MAX',     desc: 'On-chain voting widget' },
  { id: 'referral_tracker',  label: 'Referral Tracker',     icon: Link,        tier: 'MAX',     desc: 'Invite link generator' },
  { id: 'leaderboard',       label: 'Leaderboard',          icon: Trophy,      tier: 'MAX',     desc: 'Ranked participant table' },
  { id: 'achievement_badge', label: 'Achievement Badge',    icon: Medal,       tier: 'MAX',     desc: 'Unlockable milestone badge' },
  { id: 'rarity_meter',      label: 'Rarity Meter',         icon: Gem,         tier: 'MAX',     desc: 'Trait rarity gauge' },
  { id: 'mint_counter',      label: 'Mint Counter',         icon: Hash,        tier: 'MAX',     desc: 'NFT mint supply tracker' },
  { id: 'reveal_counter',    label: 'Reveal Counter',       icon: Eye,         tier: 'MAX',     desc: 'Delayed reveal countdown' },
];

const DEFAULT_WIDGET_CONFIG = {
  live_balance:    { label: 'Locked KAS', showIcon: true },
  tx_history:      { limit: 3, showAmounts: true },
  qr_code:         { size: 120, includeUrl: true },
  script_viewer:   { maxHeight: 120, showLineNumbers: true },
  logo:            { url: '', alt: 'Logo', maxHeight: 48 },
  custom_button:   { text: 'Execute', url: '', style: 'solid' },
  data_grid:       { items: [{ key: 'Type', val: 'P2SH' }, { key: 'Network', val: 'Kaspa TN-12' }] },
  address_card:    { label: 'Creator', truncate: 8 },
  countdown_timer: { endTimestamp: null, label: 'Unlocks in' },
  status_badge:    { text: 'ACTIVE', color: '#49EACB' },
  embeddable_link: { url: '', height: 300 },
  raw_html:        { html: '<div style="color:white">Custom HTML</div>' },
  chart_widget:    { dataPoints: [1, 4, 2, 8, 6], height: 60 },
};

function WidgetCard({ widget, onRemove }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-[#49EACB]/20 bg-[#49EACB]/[0.04] group hover:bg-[#49EACB]/[0.06] transition-colors">
      <GripHorizontal size={14} className="text-gray-500 cursor-grab" />
      <widget.icon size={14} className="text-[#49EACB]" />
      <span className="text-xs text-white flex-1">{widget.label}</span>
      <button onClick={onRemove} className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export default function DragDropPanel({ tier, widgetIds, onWidgetsChange, primaryColor }) {
  const tierVal = { FREE: 0, CREATOR: 1, PRO: 2, MAX: 3 }[tier] || 0;
  const [dragOver, setDragOver] = useState(false);
  const [dragSource, setDragSource] = useState(null);
  const dropRef = useRef(null);

  const placedWidgets = (widgetIds || []).map(id => {
    const def = WIDGET_DEFS.find(w => w.id === id);
    return def ? { ...def, defaultConfig: DEFAULT_WIDGET_CONFIG[id] || {} } : null;
  }).filter(Boolean);

  const availableWidgets = WIDGET_DEFS.filter(w =>
    !(widgetIds || []).includes(w.id) &&
    { CREATOR: 1, PRO: 2, MAX: 3 }[w.tier] <= tierVal
  );

  const handleDragStart = useCallback((e, widgetId) => {
    e.dataTransfer.setData('text/plain', widgetId);
    e.dataTransfer.effectAllowed = 'move';
    setDragSource(widgetId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget)) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    setDragSource(null);
    const widgetId = e.dataTransfer.getData('text/plain');
    if (!widgetId || (widgetIds || []).includes(widgetId)) return;
    const def = WIDGET_DEFS.find(w => w.id === widgetId);
    if (!def) return;
    const defTierVal = { CREATOR: 1, PRO: 2, MAX: 3 }[def.tier] || 0;
    if (defTierVal > tierVal) return;
    onWidgetsChange([...(widgetIds || []), widgetId]);
  }, [widgetIds, onWidgetsChange, tierVal]);

  const handleRemove = useCallback((widgetId) => {
    onWidgetsChange((widgetIds || []).filter(id => id !== widgetId));
  }, [widgetIds, onWidgetsChange]);

  return (
    <div className="space-y-4">
      {/* Widget Palette */}
      <div className="border border-white/5 rounded-xl overflow-hidden">
        <div className="p-3 bg-white/[0.02] flex items-center gap-2">
          <Layers size={14} className="text-[#49EACB]" />
          <span className="text-xs text-gray-300 uppercase tracking-wider font-semibold">Widget Palette</span>
          <span className="ml-auto text-[10px] text-gray-500">{availableWidgets.length} available</span>
        </div>
        <div className="p-3 grid grid-cols-2 gap-1.5">
          {availableWidgets.map(w => {
            const WidgetIcon = w.icon;
            const isDragging = dragSource === w.id;
            return (
              <div
                key={w.id}
                draggable
                onDragStart={(e) => handleDragStart(e, w.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all ${
                  isDragging ? 'opacity-40 scale-95' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-[#49EACB]/20'
                }`}
                title={w.desc}
              >
                <WidgetIcon size={13} className="text-[#49EACB] shrink-0" />
                <span className="text-[10px] text-gray-400 truncate">{w.label}</span>
                <span className="ml-auto text-[8px] text-gray-600">{w.tier}</span>
              </div>
            );
          })}
          {availableWidgets.length === 0 && (
            <p className="col-span-2 text-[10px] text-gray-500 text-center py-4">All widgets placed or locked by tier</p>
          )}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-4 transition-all min-h-[80px] ${
          dragOver
            ? 'border-[#49EACB]/60 bg-[#49EACB]/[0.06] shadow-[0_0_20px_rgba(73,234,203,0.15)]'
            : 'border-white/[0.06] bg-white/[0.01]'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GripHorizontal size={14} className="text-gray-500" />
            <span className="text-xs text-gray-300 uppercase tracking-wider font-semibold">
              Drop Zone — {placedWidgets.length} widget{placedWidgets.length !== 1 && 's'} placed
            </span>
          </div>
          {dragOver && <span className="text-[10px] text-[#49EACB] animate-pulse">Drop here!</span>}
        </div>
        {placedWidgets.length > 0 ? (
          <div className="space-y-2">
            {placedWidgets.map((w) => (
              <WidgetCard key={w.id} widget={w} onRemove={() => handleRemove(w.id)} />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-gray-600 text-center py-6">
            Drag widgets from the palette above into this zone.
            <br />They will appear in your covenant page in the order shown.
          </p>
        )}
      </div>
    </div>
  );
}

// Exported for use in preview rendering
export function renderWidgetPreview(widgetId, config, primaryColor, covenant) {
  const pc = primaryColor || '#49EACB';
  switch (widgetId) {
    case 'live_balance':
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <p className="text-[9px] text-gray-500 uppercase">{config?.label || 'Locked KAS'}</p>
          <p className="text-sm font-bold font-mono" style={{ color: pc }}>
            {(covenant?.amount_kaspa || 0).toLocaleString()} KAS
          </p>
        </div>
      );
    case 'tx_history':
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <p className="text-[9px] text-gray-500 uppercase mb-1">Recent Activity</p>
          <p className="text-[10px] text-gray-400 font-mono">{(covenant?.tx_id || '').slice(0, 20)}...</p>
        </div>
      );
    case 'qr_code':
      return (
        <div className="flex justify-center p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="w-20 h-20 bg-white/10 rounded flex items-center justify-center text-[10px] text-gray-500">
            QR
          </div>
        </div>
      );
    case 'script_viewer':
      return (
        <div className="p-3 rounded-lg bg-black/60 border border-white/5 font-mono text-[9px]" style={{ maxHeight: config?.maxHeight || 120, overflowY: 'auto' }}>
          <p className="text-gray-500 mb-1">-- Script Hex --</p>
          <p className="text-gray-400 break-all">{(covenant?.script_hash || 'No script available').slice(0, 64)}...</p>
        </div>
      );
    case 'logo':
      return config?.url ? (
        <div className="flex justify-center p-2">
          <img src={config.url} alt={config.alt || 'Logo'} style={{ maxHeight: config.maxHeight || 48 }} className="object-contain rounded" onError={(e) => (e.target.style.display='none')} />
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 border-dashed text-center text-[10px] text-gray-500">
          Logo placeholder — set URL in widget config
        </div>
      );
    case 'custom_button':
      return (
        <button
          className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wide"
          style={{ backgroundColor: pc, color: '#000' }}
        >
          {config?.text || 'Execute'}
        </button>
      );
    case 'data_grid':
      const items = config?.items || [{ key: 'Type', val: 'P2SH' }];
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((item, i) => (
            <div key={i} className="p-2 rounded bg-white/[0.03] border border-white/5">
              <p className="text-[8px] text-gray-500">{item.key}</p>
              <p className="text-[10px] text-white font-mono">{item.val}</p>
            </div>
          ))}
        </div>
      );
    case 'address_card':
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <p className="text-[9px] text-gray-500 uppercase">{config?.label || 'Creator'}</p>
          <p className="text-[10px] text-white font-mono">
            {(covenant?.creator_addr || 'N/A').slice(0, (config?.truncate || 8) * 2 + 3)}...
          </p>
        </div>
      );
    case 'countdown_timer':
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 text-center">
          <p className="text-[9px] text-gray-500 uppercase">{config?.label || 'Unlocks in'}</p>
          <p className="text-sm font-bold font-mono" style={{ color: pc }}>—</p>
        </div>
      );
    case 'status_badge':
      return (
        <div className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${config?.color || pc}20`, color: config?.color || pc, border: `1px solid ${config?.color || pc}40` }}>
          {config?.text || 'ACTIVE'}
        </div>
      );
    case 'embeddable_link':
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 text-center text-[10px] text-gray-500">
          Embedded content — {config?.url ? config.url.slice(0, 30) + '...' : 'no URL set'}
        </div>
      );
    case 'raw_html':
      return (
        <div className="p-3 rounded-lg border border-dashed border-[#E8AF34]/30 bg-[#E8AF34]/[0.04] text-[10px] text-[#E8AF34] text-center">
          ⚡ Custom HTML block active
        </div>
      );
    case 'chart_widget':
      const pts = config?.dataPoints || [1, 4, 2, 8, 6];
      const max = Math.max(...pts, 1);
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <p className="text-[9px] text-gray-500 uppercase mb-1">Sparkline</p>
          <div className="flex items-end gap-0.5" style={{ height: config?.height || 60 }}>
            {pts.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{ height: `${(v / max) * 100}%`, backgroundColor: pc, opacity: 0.3 + (i / pts.length) * 0.5 }} />
            ))}
          </div>
        </div>
      );

    // ========== CREATOR TIER WIDGETS ==========
    case 'progress_bar': {
      const val = config?.value ?? 65;
      const mx = config?.max ?? 100;
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>{config?.label || 'Progress'}</span>
            {config?.showPercent && <span>{Math.round((val/mx)*100)}%</span>}
          </div>
          <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${(val/mx)*100}%`, backgroundColor: pc }} />
          </div>
        </div>
      );
    }
    case 'neon_frame':
      return (
        <div className="p-3 rounded-lg border-2 border-dashed border-[#49EACB]/30 bg-[#49EACB]/[0.02] text-center">
          <Frame size={18} className="mx-auto text-[#49EACB]/50 mb-1" />
          <p className="text-[9px] text-[#49EACB]/50">Neon Frame Container</p>
        </div>
      );
    case 'badge_collection':
      return (
        <div className="flex flex-wrap gap-1.5 p-2">
          {(config?.badges || ['VERIFIED', 'ACTIVE']).map((b, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-[9px] font-medium border" style={{ borderColor: `${pc}40`, color: pc, backgroundColor: `${pc}10` }}>{b}</span>
          ))}
        </div>
      );
    case 'stat_counter':
      return (
        <div className="text-center p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{config?.label || 'Count'}</p>
          <p className="text-2xl font-black" style={{ color: pc }}>{config?.value || 0}{config?.suffix || ''}</p>
        </div>
      );
    case 'divider_line':
      return (
        <div className="flex items-center gap-2 py-2">
          <div className="h-px flex-1" style={{ background: config?.style === 'gradient' ? `linear-gradient(to right, transparent, ${config?.color || pc}, transparent)` : `${config?.color || pc}30` }} />
          {config?.label && <span className="text-[10px] text-gray-500">{config.label}</span>}
          <div className="h-px flex-1" style={{ background: config?.style === 'gradient' ? `linear-gradient(to left, transparent, ${config?.color || pc}, transparent)` : `${config?.color || pc}30` }} />
        </div>
      );
    case 'avatar_display':
      return (
        <div className="flex items-center gap-3 p-3">
          <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold" style={{ borderColor: pc, color: pc, backgroundColor: `${pc}15` }}>
            {config?.url ? <img src={config.url} alt="" className="w-full h-full rounded-full object-cover" /> : (config?.fallback || 'AV')}
          </div>
          <span className="text-xs text-gray-400">Avatar Display</span>
        </div>
      );
    case 'social_links':
      return (
        <div className="flex items-center justify-center gap-3 p-2">
          {['twitter', 'discord', 'github', 'website'].map(k => config?.[k] ? (
            <a key={k} href={config[k]} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full border flex items-center justify-center text-[10px] uppercase hover:bg-white/[0.05] transition-colors" style={{ borderColor: `${pc}30`, color: pc }}>{k[0]}</a>
          ) : null)}
        </div>
      );
    case 'timeline':
      return (
        <div className="relative pl-4 py-2 space-y-3">
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-white/[0.08]" />
          {(config?.events || []).map((ev, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[13px] top-1 w-2 h-2 rounded-full border" style={{ borderColor: pc, backgroundColor: `${pc}30` }} />
              <p className="text-[9px] text-gray-500">{ev.date}</p>
              <p className="text-[10px] text-white">{ev.label}</p>
            </div>
          ))}
        </div>
      );
    case 'info_box':
      return (
        <div className="p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: `${pc}20`, backgroundColor: `${pc}05` }}>
          <Info size={14} style={{ color: pc }} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-semibold text-white">{config?.title || 'Info'}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{config?.message || 'Informational message.'}</p>
          </div>
        </div>
      );
    case 'copy_field':
      return (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">{config?.label || 'Field'}</span>
            <button className="text-[9px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/5 text-gray-400 hover:text-[#49EACB] transition-colors">Copy</button>
          </div>
          <p className="text-xs font-mono mt-1 truncate">{config?.value || '0x...'}</p>
        </div>
      );
    case 'tag_cloud':
      return (
        <div className="flex flex-wrap gap-1.5 p-2">
          {(config?.tags || ['#DeFi']).map((t, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[9px] text-gray-400 hover:border-[#49EACB]/30 transition-colors">{t}</span>
          ))}
        </div>
      );
    case 'icon_grid':
      return (
        <div className="grid grid-cols-3 gap-2 p-2">
          {(config?.items || []).map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/[0.02] border border-white/5">
              <Activity size={14} style={{ color: pc }} />
              <span className="text-[9px] text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
      );
    case 'marquee_text':
      return (
        <div className="overflow-hidden py-2 border-y border-white/[0.04]">
          <div className="whitespace-nowrap text-[10px] text-gray-500 animate-pulse">
            {config?.text || 'Scrolling announcement'} ⬩ {config?.text || 'Scrolling announcement'}
          </div>
        </div>
      );

    // ========== PRO TIER WIDGETS ==========
    case 'trust_meter':
      return (
        <div className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase mb-1">{config?.label || 'Trust Score'}</p>
          <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-1">
            <div className="h-full rounded-full" style={{ width: `${((config?.score ?? 85) / (config?.maxScore ?? 100)) * 100}%`, backgroundColor: pc }} />
          </div>
          <p className="text-xs font-bold" style={{ color: pc }}>{config?.score ?? 85}/{config?.maxScore ?? 100}</p>
        </div>
      );
    case 'verification_badge':
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: `${pc}30`, backgroundColor: `${pc}05` }}>
          <ShieldCheck size={16} style={{ color: pc }} />
          <div>
            <p className="text-[10px] text-gray-400">Covex Verified</p>
            <p className="text-[9px] text-gray-600">{config?.date || '2024-06-01'}</p>
          </div>
        </div>
      );
    case 'metric_card':
      return (
        <div className="p-4 rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
          <p className="text-[10px] text-gray-500 uppercase">{config?.label || 'Metric'}</p>
          <div className="flex items-end gap-2 mt-1">
            <p className="text-xl font-black text-white">{config?.value || '0'}</p>
            {config?.delta && <span className="text-[10px]" style={{ color: config?.trend === 'up' ? '#10B981' : '#EF4444' }}>{config.delta}</span>}
          </div>
        </div>
      );
    case 'comparison_table':
      return (
        <div className="p-2 rounded-lg border border-white/[0.05] bg-white/[0.01]">
          <table className="w-full text-[9px]">
            <thead><tr className="text-gray-500"><th className="text-left py-1">Feature</th><th>A</th><th>B</th></tr></thead>
            <tbody>
              {(config?.rows || []).map((r, i) => (
                <tr key={i} className="border-t border-white/[0.03]"><td className="py-1 text-gray-400">{r.feature}</td><td className="text-center text-[#49EACB]">{r.a}</td><td className="text-center text-gray-500">{r.b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'alert_banner':
      return (
        <div className={`p-2.5 rounded-lg border flex items-center gap-2 text-[10px] ${config?.variant === 'warning' ? 'border-[#E8AF34]/20 bg-[#E8AF34]/[0.04] text-[#E8AF34]' : 'border-[#49EACB]/20 bg-[#49EACB]/[0.04] text-[#49EACB]'}`}>
          <AlertTriangle size={14} className="shrink-0" />
          <span className="font-medium">{config?.title || 'Alert'}</span>: {config?.message || 'Message'}
        </div>
      );
    case 'notification_dot':
      return (
        <div className="flex items-center gap-2 p-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: config?.color || pc }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: config?.color || pc }} />
          </span>
          <span className="text-[10px] text-gray-400">{config?.label || 'Live'}</span>
        </div>
      );
    case 'tooltip_box':
      return (
        <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02] text-center group relative">
          <p className="text-[10px] text-gray-400">{config?.content || 'Hover for context'}</p>
        </div>
      );
    case 'progress_timeline':
      return (
        <div className="flex items-center gap-1 py-2">
          {(config?.steps || []).map((step, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: step.done ? pc : 'rgba(255,255,255,0.05)', color: step.done ? '#000' : '#666' }}>{i + 1}</div>
              <span className="text-[9px] text-gray-400">{step.label}</span>
              {i < (config?.steps || []).length - 1 && <div className="w-3 h-px bg-white/[0.1]" />}
            </div>
          ))}
        </div>
      );
    case 'rating_stars':
      return (
        <div className="flex items-center gap-2 p-2">
          <div className="flex gap-0.5">
            {Array.from({ length: Math.floor(config?.max ?? 5) }, (_, i) => (
              <Star key={i} size={12} className={i < Math.floor(config?.value ?? 4.5) ? 'text-[#E8AF34]' : 'text-gray-700'} fill={i < Math.floor(config?.value ?? 4.5) ? '#E8AF34' : 'none'} />
            ))}
          </div>
          <span className="text-[10px] text-gray-400">{config?.value ?? 4.5} ({config?.label || 'rating'})</span>
        </div>
      );
    case 'contract_terms':
      return (
        <div className="p-3 rounded-lg border border-white/[0.05] bg-white/[0.01]">
          <p className="text-[10px] text-gray-500 uppercase mb-2">Terms</p>
          {(config?.terms || []).map((t, i) => (
            <p key={i} className="text-[9px] text-gray-400 py-1 border-t border-white/[0.03]">{i+1}. {t}</p>
          ))}
        </div>
      );
    case 'escrow_status':
      return (
        <div className="p-3 rounded-lg border border-white/[0.05]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500">Escrow</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium border" style={{ borderColor: `${pc}30`, color: pc }}>{config?.status || 'PENDING'}</span>
          </div>
          <div className="text-[9px] text-gray-400">{config?.signed || 0}/{config?.required || 3} signatures from {config?.parties || 3} parties</div>
        </div>
      );
    case 'multi_sig_indicator':
      return (
        <div className="p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Multi-Signature</p>
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: config?.total ?? 3 }, (_, i) => (
              <div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] ${i < (config?.required ?? 2) ? 'bg-[#49EACB]/20 text-[#49EACB] border border-[#49EACB]/30' : 'bg-white/[0.03] text-gray-600 border border-white/[0.06]'}`}>
                {(config?.signatures || [])[i]?.[0] || (i < (config?.required ?? 2) ? <Lock size={10} /> : '?')}
              </div>
            ))}
          </div>
          <p className="text-[9px] text-gray-500 mt-1">{config?.required || 2} of {config?.total || 3} required</p>
        </div>
      );
    case 'vesting_schedule':
      return (
        <div className="p-3">
          <p className="text-[10px] text-gray-500 mb-2">Vesting Schedule</p>
          <div className="flex gap-0.5 h-8 items-end">
            {Array.from({ length: config?.intervals ?? 12 }, (_, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{ height: i < (config?.released ?? 3) ? '100%' : '30%', backgroundColor: i < (config?.released ?? 3) ? pc : 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        </div>
      );
    case 'auction_timer':
      return (
        <div className="p-3 text-center rounded-lg border border-[#E8AF34]/10 bg-[#E8AF34]/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase">Current Bid</p>
          <p className="text-xl font-black text-[#E8AF34]">{config?.currentBid || 0} {config?.currency || 'KAS'}</p>
          <p className="text-[9px] text-gray-600">Auction ends: {config?.endTimestamp ? new Date(config.endTimestamp).toLocaleDateString() : 'TBD'}</p>
        </div>
      );
    case 'bid_history':
      return (
        <div className="p-2">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Recent Bids</p>
          {(config?.bids || []).map((b, i) => (
            <div key={i} className="flex justify-between text-[9px] py-1 border-t border-white/[0.03]">
              <span className="text-gray-400">{b.user}</span>
              <span style={{ color: pc }}>{b.amount} KAS</span>
            </div>
          ))}
        </div>
      );

    // ========== MAX TIER WIDGETS ==========
    case 'particle_background':
      return (
        <div className="p-3 rounded-lg border border-[#49EACB]/5 bg-[#49EACB]/[0.01] text-center">
          <Sparkles size={20} className="mx-auto text-[#49EACB]/40 mb-2" />
          <p className="text-[9px] text-[#49EACB]/40">Particle Background — {config?.count || 50} particles</p>
        </div>
      );
    case 'hologram_card':
      return (
        <div className="p-4 rounded-2xl border-2 border-[#49EACB]/20 bg-gradient-to-b from-[#49EACB]/5 to-transparent text-center transform hover:scale-[1.02] transition-transform">
          <Scan size={24} className="mx-auto text-[#49EACB]/60 mb-2" />
          <p className="text-[10px] font-medium text-[#49EACB]">Holographic Card</p>
          <p className="text-[9px] text-gray-500">3D tilt + glare enabled</p>
        </div>
      );
    case 'crypto_price_ticker':
      return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-white/[0.05] bg-white/[0.01]">
          <span className="text-[10px] text-gray-500">{config?.pair || 'KAS/USD'}</span>
          <span className="text-sm font-bold text-white">$0.145</span>
          <span className="text-[10px] text-[#10B981]">+2.4%</span>
        </div>
      );
    case 'network_status':
      return (
        <div className="p-3 rounded-lg border border-[#10B981]/10 bg-[#10B981]/[0.02]">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={12} className="text-[#10B981]" />
            <span className="text-[10px] font-medium text-[#10B981]">Network Healthy</span>
          </div>
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>{config?.bps || 10} BPS</span>
            <span>{config?.peers || 8} peers</span>
          </div>
        </div>
      );
    case 'block_counter':
      return (
        <div className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Block Height</p>
          <p className="text-xl font-black font-mono" style={{ color: pc }}>{(config?.current || 12345678).toLocaleString()}</p>
          <p className="text-[9px] text-gray-600">{config?.network || 'TN-12'}</p>
        </div>
      );
    case 'gas_estimator':
      return (
        <div className="p-2 rounded-lg border border-white/[0.05]">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Fee Estimate</p>
          <div className="grid grid-cols-3 gap-1 text-center">
            {[
              { l: 'Low', v: config?.low ?? 0.001 },
              { l: 'Med', v: config?.medium ?? 0.005 },
              { l: 'High', v: config?.high ?? 0.01 },
            ].map(t => (
              <div key={t.l} className="p-1.5 rounded bg-white/[0.02]"><p className="text-[8px] text-gray-500">{t.l}</p><p className="text-[10px] font-mono" style={{ color: pc }}>{t.v} KAS</p></div>
            ))}
          </div>
        </div>
      );
    case 'mempool_visualizer':
      return (
        <div className="p-2">
          <div className="flex justify-between text-[9px] text-gray-500 mb-1">
            <span>Mempool</span>
            <span>{config?.txs || 150} / {config?.maxTxs || 500}</span>
          </div>
          <div className="w-full h-6 rounded bg-white/[0.03] overflow-hidden flex">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex-1 border-r border-white/[0.03]" style={{ backgroundColor: i < ((config?.txs || 150)/(config?.maxTxs||500))*20 ? pc+'50' : 'transparent' }} />
            ))}
          </div>
        </div>
      );
    case 'dag_graph':
      return (
        <div className="p-3 rounded-lg border border-white/[0.05] bg-white/[0.01] text-center relative overflow-hidden">
          <div className="flex justify-center items-center gap-2 py-4">
            {Array.from({ length: config?.blocks ?? 12 }, (_, i) => (
              <div key={i} className="w-3 h-3 rounded-sm border" style={{ borderColor: pc+'60', backgroundColor: i < (config?.depth || 4) ? pc+'30' : 'transparent' }} />
            ))}
          </div>
          <p className="text-[9px] text-gray-500">{config?.blocks || 12} blocks • depth {config?.depth || 4}</p>
        </div>
      );
    case 'validator_list':
      return (
        <div className="p-2">
          <p className="text-[10px] text-gray-500 mb-1">Active Validators</p>
          {(config?.validators || []).map((v, i) => (
            <div key={i} className="flex justify-between text-[9px] py-1 border-t border-white/[0.03]">
              <span className="text-gray-400">{v.id}</span>
              <span style={{ color: pc }}>{v.stake}</span>
            </div>
          ))}
        </div>
      );
    case 'staking_calculator':
      return (
        <div className="p-3 rounded-lg border border-[#10B981]/10 bg-[#10B981]/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Staking Calculator</p>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[9px] text-gray-400">{(config?.amount || 10000).toLocaleString()} KAS @ {config?.apy || 12.5}% APY</p>
              <p className="text-sm font-black text-[#10B981]">+{Math.round((config?.amount||10000)*(config?.apy||12.5)/100).toLocaleString()} KAS</p>
            </div>
            <span className="text-[9px] text-gray-500">{config?.period || 365}d</span>
          </div>
        </div>
      );
    case 'yield_farm_card':
      return (
        <div className="p-3 rounded-xl border border-[#E8AF34]/10 bg-[#E8AF34]/[0.02]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-medium text-[#E8AF34]">{config?.pool || 'KAS/USDC'}</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#E8AF34]/10 text-[#E8AF34]">{config?.apr || '18.5%'} APR</span>
          </div>
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>TVL: {config?.tvl || '2.1M'}</span>
            <span>Token: {config?.token || 'KAS'}</span>
          </div>
        </div>
      );
    case 'nft_gallery':
      return (
        <div className="p-2">
          <p className="text-[10px] text-gray-500 mb-1">NFT Collection</p>
          <div className="grid grid-cols-3 gap-1">
            {(config?.nfts || []).map((n, i) => (
              <div key={i} className="aspect-square rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-[9px] text-gray-600">
                {n.image ? <img src={n.image} alt="" className="w-full h-full object-cover rounded" /> : n.name || `#${i}`}
              </div>
            ))}
          </div>
        </div>
      );
    case 'token_swap_widget':
      return (
        <div className="p-3 rounded-lg border border-white/[0.05] text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-xs font-bold text-white">{config?.from || 'KAS'}</span>
            <ArrowLeftRight size={12} className="text-gray-500" />
            <span className="text-xs font-bold text-white">{config?.to || 'USDC'}</span>
          </div>
          <p className="text-[10px] text-gray-500">1 {config?.from || 'KAS'} = {config?.rate || '0.15'} {config?.to || 'USDC'}</p>
          <p className="text-[9px] text-gray-600 mt-0.5">Fee: {config?.fee || '0.3%'}</p>
        </div>
      );
    case 'liquidity_pool_card':
      return (
        <div className="p-3 rounded-xl border border-white/[0.05] bg-white/[0.01]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-gray-400">{config?.pool || 'KAS/USDC'}</span>
            <span className="text-[9px] text-[#10B981]">{config?.apr || '22%'} APR</span>
          </div>
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>Depth: {config?.depth || '1.2M'}</span>
            <span>Vol 24h: {config?.volume24h || '450K'}</span>
          </div>
        </div>
      );
    case 'governance_poll':
      return (
        <div className="p-3 rounded-lg border border-white/[0.05]">
          <p className="text-[10px] text-gray-400 mb-2">{config?.question || 'Proposal?'}</p>
          {(config?.options || []).map((opt, i) => (
            <div key={i} className="flex justify-between text-[9px] py-1">
              <span className="text-gray-400">{opt}</span>
              <span className="font-mono" style={{ color: pc }}>{(config?.votes || [])[i] || 0} votes</span>
            </div>
          ))}
        </div>
      );
    case 'referral_tracker':
      return (
        <div className="p-3 rounded-lg border border-[#49EACB]/10 bg-[#49EACB]/[0.02]">
          <p className="text-[9px] text-gray-500 mb-1">Referral Code</p>
          <p className="text-sm font-mono text-[#49EACB] font-bold">{config?.code || 'COVEX-123'}</p>
          <div className="flex justify-between text-[9px] text-gray-500 mt-1">
            <span>{config?.clicks || 0} clicks</span>
            <span>{config?.reward || '10 KAS'}</span>
          </div>
        </div>
      );
    case 'leaderboard':
      return (
        <div className="p-2">
          <p className="text-[10px] text-gray-500 mb-1">{config?.title || 'Leaderboard'}</p>
          {(config?.entries || []).map((e, i) => (
            <div key={i} className="flex justify-between text-[9px] py-1 border-t border-white/[0.03]">
              <span className="text-gray-400">{i + 1}. {e.name}</span>
              <span style={{ color: pc }}>{e.score}</span>
            </div>
          ))}
        </div>
      );
    case 'achievement_badge':
      return (
        <div className="p-3 rounded-xl border border-[#E8AF34]/10 bg-[#E8AF34]/[0.02] text-center">
          <Medal size={24} className="mx-auto text-[#E8AF34] mb-1" />
          <p className="text-[10px] font-medium text-[#E8AF34]">{config?.title || 'Achievement'}</p>
          <p className="text-[9px] text-gray-500">{config?.rarity || 'Legendary'}</p>
        </div>
      );
    case 'rarity_meter':
      return (
        <div className="p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">{config?.label || 'Rarity'}</p>
          <p className="text-2xl font-black text-[#8B5CF6]">{config?.score || 94}/100</p>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-[#8B5CF6]" style={{ width: `${((config?.score ?? 94)/(config?.max ?? 100))*100}%` }} />
          </div>
        </div>
      );
    case 'mint_counter':
      return (
        <div className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase">{config?.label || 'Minted'}</p>
          <p className="text-2xl font-black font-mono text-white">{config?.current || 342}<span className="text-gray-600"> / {config?.max || 1000}</span></p>
        </div>
      );
    case 'reveal_counter':
      return (
        <div className="p-3 text-center rounded-lg border border-[#8B5CF6]/10 bg-[#8B5CF6]/[0.02]">
          <p className="text-[10px] text-gray-500">{config?.label || 'Reveal In'}</p>
          <p className="text-xl font-black text-[#8B5CF6]">{(config?.revealDate || '2024-12-31').split('-').slice(1).join('/')}</p>
          <p className="text-[9px] text-gray-500">{config?.revealDate || '2024-12-31'}</p>
        </div>
      );

    // ========== ORIGINAL WIDGETS (unchanged) ==========
    default:
      return null;
  }
}

export { WIDGET_DEFS, DEFAULT_WIDGET_CONFIG };
