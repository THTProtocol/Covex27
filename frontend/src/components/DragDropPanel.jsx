import { useState, useRef, useCallback } from 'react';
import {
  GripHorizontal, Trash2, QrCode, TrendingUp, Calendar,
  Image, Globe, FileText, BarChart3, Activity, Database,
  Layers, Server, Terminal, X
} from 'lucide-react';

const WIDGET_DEFS = [
  { id: 'live_balance',    label: 'Live Balance',     icon: TrendingUp, tier: 'CREATOR', desc: 'Real-time KAS balance display' },
  { id: 'tx_history',      label: 'Tx History',       icon: Activity,   tier: 'CREATOR', desc: 'Recent transaction preview' },
  { id: 'qr_code',         label: 'QR Code',          icon: QrCode,     tier: 'CREATOR', desc: 'Payment QR for this covenant' },
  { id: 'script_viewer',   label: 'Script Viewer',    icon: FileText,   tier: 'PRO',    desc: 'Scrollable script hex panel' },
  { id: 'logo',            label: 'Logo / Image',     icon: Image,      tier: 'PRO',    desc: 'Upload custom logo/image' },
  { id: 'custom_button',   label: 'Custom Button',    icon: Layers,     tier: 'CREATOR', desc: 'Custom CTA button with link' },
  { id: 'data_grid',       label: 'Data Grid',        icon: BarChart3,  tier: 'PRO',    desc: 'Key-value data display' },
  { id: 'address_card',    label: 'Address Card',     icon: Database,   tier: 'CREATOR', desc: 'Formatted creator address' },
  { id: 'countdown_timer', label: 'Countdown Timer',  icon: Calendar,   tier: 'PRO',    desc: 'Timelock countdown widget' },
  { id: 'status_badge',    label: 'Status Badge',     icon: Activity,   tier: 'CREATOR', desc: 'Active/Completed/Pending badge' },
  { id: 'embeddable_link', label: 'Embedded Link',    icon: Globe,      tier: 'MAX',    desc: 'iFrame/embeddable URL widget' },
  { id: 'raw_html',        label: 'Raw HTML Block',   icon: Server,     tier: 'MAX',    desc: 'Inject arbitrary HTML snippet' },
  { id: 'chart_widget',    label: 'Chart / Sparkline',icon: BarChart3,  tier: 'MAX',    desc: 'Locked-amount sparkline chart' },
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
    default:
      return null;
  }
}

export { WIDGET_DEFS, DEFAULT_WIDGET_CONFIG };
