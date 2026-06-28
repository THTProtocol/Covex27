import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, ChevronRight, Box, Blocks, Plus, ExternalLink, X, Info, GripVertical } from 'lucide-react';
import { LOGIC_PRIMITIVES, PAGE_BLOCKS } from '../lib/tools-catalog.js';

// Two-section searchable palette over covenant LOGIC primitives + page-design BLOCKS.
// Driven entirely by the tools-catalog.js export shape so the catalog stays the single
// source of truth. The palette never speaks of "trustless" or "on-chain ZK": logic items
// carry their own reality chip so the surface is honest at a glance.
//
// context controls which sections render:
//   'logic'  -> only Covenant logic primitives
//   'blocks' -> only Page-design blocks
//   'both'   -> both, with the logic section open first
//
// onAddBlock(componentId): when present, the "Add" action on a page block calls back so
// a parent (e.g. CovenantStudio) can drop the block into the active Puck tree. When
// absent, Add shows a hint telling the user to drag from the sidebar instead.

// Reality chip styling. Mirrors TrustBadge's 4-tier honesty palette so the same kind
// reads the same color everywhere in the app. Labels are deliberately short for the
// tight palette context.
const REALITY_CHIP = {
  'on-chain': {
    label: 'On-chain',
    cls: 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-600/50',
  },
  'full-zk': {
    label: 'Full-zk',
    cls: 'bg-violet-500/12 border-violet-500/35 text-violet-300 light:bg-violet-50 light:text-violet-700 light:border-violet-600/50',
  },
  hybrid: {
    label: 'Hybrid',
    cls: 'bg-sky-500/12 border-sky-500/35 text-sky-300 light:bg-sky-50 light:text-sky-700 light:border-sky-600/50',
  },
  'oracle-attested': {
    label: 'Oracle co-signed',
    cls: 'bg-amber-500/12 border-amber-500/35 text-amber-300 light:bg-amber-50 light:text-amber-700 light:border-amber-600/50',
  },
  decorative: {
    label: 'Metadata only',
    cls: 'bg-white/[0.06] border-white/15 text-gray-300 light:bg-slate-100 light:text-slate-600 light:border-slate-300',
  },
};

// Icon-chip accent by enforcement reality (logic rows). Mirrors REALITY_CHIP so the
// honesty color tells you what you're looking at from a meter away.
const REALITY_ICON_CHIP = {
  'on-chain': 'bg-emerald-500/12 text-emerald-300 light:text-emerald-700',
  'full-zk': 'bg-violet-500/12 text-violet-300 light:text-violet-700',
  hybrid: 'bg-sky-500/12 text-sky-300 light:text-sky-700',
  'oracle-attested': 'bg-amber-500/12 text-amber-300 light:text-amber-700',
  decorative: 'bg-white/[0.06] text-gray-300 light:text-slate-600',
};

// Icon-chip accent by page-block category. Keeps the palette glanceable so a creator
// finds Hero vs Footer vs Live data without reading every label.
const BLOCK_CATEGORY_CHIP = {
  Hero: 'bg-sky-500/12 text-sky-300 light:text-sky-700',
  Layout: 'bg-sky-500/12 text-sky-300 light:text-sky-700',
  Content: 'bg-emerald-500/12 text-emerald-300 light:text-emerald-700',
  Media: 'bg-emerald-500/12 text-emerald-300 light:text-emerald-700',
  Social: 'bg-emerald-500/12 text-emerald-300 light:text-emerald-700',
  'Live data': 'bg-amber-500/12 text-amber-300 light:text-amber-700',
  Actions: 'bg-amber-500/12 text-amber-300 light:text-amber-700',
  Honesty: 'bg-violet-500/12 text-violet-300 light:text-violet-700',
};

function RealityChip({ reality }) {
  const meta = REALITY_CHIP[reality] || REALITY_CHIP['decorative'];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${meta.cls}`}
      title={`Enforcement reality: ${meta.label}. Verified by an external resolver where applicable.`}
    >
      {meta.label}
    </span>
  );
}

// Block-example modal. Page blocks have no live route, so "See example" surfaces the
// name + insertHint in a small dialog instead of navigating.
function BlockExampleModal({ block, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!block) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0d13] light:bg-white light:border-slate-200 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center shrink-0">
              <Blocks size={17} className="text-kaspa-green" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white light:text-slate-900 leading-tight truncate">{block.name}</h2>
              <p className="text-xs text-gray-400 light:text-slate-500 mt-0.5">Page-design block</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 light:hover:bg-slate-100 text-gray-400 light:text-slate-500"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {block.oneLiner && (
          <p className="text-sm text-gray-300 light:text-slate-700 leading-relaxed mb-3">{block.oneLiner}</p>
        )}
        {block.insertHint && (
          <div className="rounded-lg border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500 mb-1.5">
              <Info size={11} /> How to use
            </div>
            <p className="text-xs text-gray-300 light:text-slate-700 leading-relaxed">{block.insertHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny transient toast for the "drag from sidebar" hint. Renders inline above the list
// so it works on both desktop + 375px without a portal.
function HintBanner({ text, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="mb-3 rounded-lg border border-kaspa-green/30 bg-kaspa-green/[0.08] light:bg-emerald-50 light:border-emerald-600/40 px-3 py-2 text-xs text-kaspa-green light:text-emerald-700 flex items-start gap-2">
      <Info size={13} className="mt-0.5 shrink-0" />
      <span className="flex-1 leading-snug">{text}</span>
      <button type="button" onClick={onDismiss} className="opacity-70 hover:opacity-100" aria-label="Dismiss">
        <X size={12} />
      </button>
    </div>
  );
}

function SectionHeader({ title, count, total, open, onToggle, Icon }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] light:border-slate-200 light:bg-slate-50 light:hover:bg-slate-100 transition-colors"
      aria-expanded={open}
    >
      <div className="flex items-center gap-2 min-w-0">
        {open ? <ChevronDown size={14} className="text-gray-400 light:text-slate-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 light:text-slate-500 shrink-0" />}
        <Icon size={14} className="text-kaspa-green shrink-0" />
        <span className="text-xs font-bold text-white light:text-slate-900 truncate">{title}</span>
      </div>
      <span className="text-[10px] font-mono text-gray-400 light:text-slate-500 shrink-0">
        {count === total ? total : `${count}/${total}`}
      </span>
    </button>
  );
}

function ItemRow({ kind, entry, onSeeExample, onAdd }) {
  const Icon = kind === 'logic' ? Box : Blocks;
  const chipColor =
    kind === 'logic'
      ? REALITY_ICON_CHIP[entry.reality] || REALITY_ICON_CHIP['decorative']
      : BLOCK_CATEGORY_CHIP[entry.category] || 'bg-white/[0.06] text-gray-300 light:text-slate-600';
  // draggable hints at the canvas-drop affordance. The actual insert path is the Add
  // button (or Puck's own sidebar drag), so we only set a lightweight payload here.
  const onDragStart = (e) => {
    try {
      e.dataTransfer.setData('text/plain', entry.name || entry.id || '');
      e.dataTransfer.effectAllowed = 'copy';
    } catch { /* no-op */ }
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group rounded-lg border border-white/[0.05] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03] light:border-slate-200 light:bg-white light:hover:border-slate-300 light:hover:bg-slate-50 transition-colors p-2.5 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical
          size={12}
          className="mt-1.5 text-gray-400 light:text-slate-600 opacity-40 group-hover:opacity-100 transition-opacity shrink-0"
          aria-hidden="true"
        />
        <div className={`w-7 h-7 rounded-md border border-white/[0.08] light:border-slate-200 flex items-center justify-center shrink-0 ${chipColor}`}>
          <Icon size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="font-medium text-sm text-white light:text-slate-900 truncate">{entry.name}</div>
            {kind === 'logic' && entry.reality && (
              <div className="shrink-0">
                <RealityChip reality={entry.reality} />
              </div>
            )}
          </div>
          {entry.oneLiner && (
            <p className="text-xs text-gray-400 light:text-slate-500 leading-snug mt-1 line-clamp-2">{entry.oneLiner}</p>
          )}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* See example: logic with exampleId routes to /covenant/<id>; otherwise opens the block modal. */}
            {(kind === 'logic' ? !!entry.exampleId : true) && (
              <button
                type="button"
                onClick={() => onSeeExample(entry)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-white/10 bg-white/[0.03] text-gray-200 hover:border-white/20 hover:bg-white/[0.06] light:border-slate-200 light:bg-white light:text-slate-700 light:hover:border-slate-300 light:hover:bg-slate-50 transition-colors"
              >
                <ExternalLink size={10} />
                See example
              </button>
            )}
            <button
              type="button"
              onClick={() => onAdd(entry)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border bg-kaspa-green/15 border-kaspa-green/40 text-kaspa-green hover:bg-kaspa-green/25 light:bg-emerald-50 light:border-emerald-600/40 light:text-emerald-700 light:hover:bg-emerald-100 transition-colors"
            >
              <Plus size={10} />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ToolsPalette({ context = 'both', onAddBlock }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [openLogic, setOpenLogic] = useState(context !== 'blocks');
  const [openBlocks, setOpenBlocks] = useState(context !== 'logic');
  const [exampleBlock, setExampleBlock] = useState(null);
  const [hint, setHint] = useState('');

  const showLogic = context === 'logic' || context === 'both';
  const showBlocks = context === 'blocks' || context === 'both';

  const logicAll = Array.isArray(LOGIC_PRIMITIVES) ? LOGIC_PRIMITIVES : [];
  const blocksAll = Array.isArray(PAGE_BLOCKS) ? PAGE_BLOCKS : [];

  const needle = q.trim().toLowerCase();

  const logicFiltered = useMemo(() => {
    if (!showLogic) return [];
    if (!needle) return logicAll;
    return logicAll.filter((e) => {
      const n = (e.name || '').toLowerCase();
      const o = (e.oneLiner || '').toLowerCase();
      return n.includes(needle) || o.includes(needle);
    });
  }, [logicAll, needle, showLogic]);

  const blocksFiltered = useMemo(() => {
    if (!showBlocks) return [];
    if (!needle) return blocksAll;
    return blocksAll.filter((e) => {
      const n = (e.name || '').toLowerCase();
      const o = (e.oneLiner || '').toLowerCase();
      return n.includes(needle) || o.includes(needle);
    });
  }, [blocksAll, needle, showBlocks]);

  const handleSeeExample = (kind) => (entry) => {
    if (kind === 'logic') {
      if (entry.exampleId) navigate(`/covenant/${entry.exampleId}`);
      return;
    }
    setExampleBlock(entry);
  };

  const handleAdd = (kind) => (entry) => {
    if (kind === 'logic') {
      if (entry.route) navigate(entry.route);
      return;
    }
    // Page block: prefer the parent callback so the host can insert into the Puck tree.
    if (typeof onAddBlock === 'function') {
      onAddBlock(entry.id);
      return;
    }
    setHint('Drag this block from the Studio sidebar onto the canvas to insert it.');
  };

  return (
    <div className="w-full">
      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 light:text-slate-600 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tools"
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-kaspa-green/40 focus:bg-white/[0.04] light:border-slate-200 light:bg-white light:text-slate-900 light:placeholder:text-slate-400 light:focus:border-emerald-600/40"
        />
      </div>

      {hint && <HintBanner text={hint} onDismiss={() => setHint('')} />}

      <div className="space-y-3">
        {showLogic && (
          <div>
            <SectionHeader
              title="Covenant logic primitives"
              count={logicFiltered.length}
              total={logicAll.length}
              open={openLogic}
              onToggle={() => setOpenLogic((v) => !v)}
              Icon={Box}
            />
            {openLogic && (
              <div className="mt-2 space-y-1.5">
                {logicFiltered.length === 0 ? (
                  <p className="text-xs text-gray-500 light:text-slate-600 px-2 py-3 text-center">
                    {needle ? 'No primitives match this search.' : 'No primitives available.'}
                  </p>
                ) : (
                  logicFiltered.map((entry) => (
                    <ItemRow
                      key={entry.id}
                      kind="logic"
                      entry={entry}
                      onSeeExample={handleSeeExample('logic')}
                      onAdd={handleAdd('logic')}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {showBlocks && (
          <div>
            <SectionHeader
              title="Page-design blocks"
              count={blocksFiltered.length}
              total={blocksAll.length}
              open={openBlocks}
              onToggle={() => setOpenBlocks((v) => !v)}
              Icon={Blocks}
            />
            {openBlocks && (
              <div className="mt-2 space-y-1.5">
                {blocksFiltered.length === 0 ? (
                  <p className="text-xs text-gray-500 light:text-slate-600 px-2 py-3 text-center">
                    {needle ? 'No blocks match this search.' : 'No blocks available.'}
                  </p>
                ) : (
                  blocksFiltered.map((entry) => (
                    <ItemRow
                      key={entry.id}
                      kind="block"
                      entry={entry}
                      onSeeExample={handleSeeExample('block')}
                      onAdd={handleAdd('block')}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {exampleBlock && <BlockExampleModal block={exampleBlock} onClose={() => setExampleBlock(null)} />}
    </div>
  );
}
