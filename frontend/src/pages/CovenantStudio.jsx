import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { ArrowLeft, Save, Eye, Sparkles, Zap, Search, Palette, LayoutTemplate, Smartphone, Monitor, X, Check } from 'lucide-react';
import { useWallet } from '../components/WalletContext';
import { toast } from '../components/ToastContext';
import { signCovenantOwnership } from '../lib/ownership';
import puckConfig, { LIVE_TOKENS, STARTER_TEMPLATES, matchTemplate, SAFE_COLOR } from '../lib/puckConfig';
import { getPresets, presetBackdrop } from '../lib/designPresets';

const EMPTY_PAGE = { content: [], root: { props: {} } };

// Device-preview viewports for Puck's built-in toolbar toggle (mobile / desktop).
const VIEWPORTS = [
  { width: 390, height: 'auto', label: 'Mobile', icon: 'Smartphone' },
  { width: 1024, height: 'auto', label: 'Desktop', icon: 'Monitor' },
];

/**
 * Drag and drop page builder for a covenant. Creators compose from the platform
 * component catalog only; the result is stored as JSON next to the covenant's
 * terminal config and rendered read-only on the public page. The transparency
 * panel on the public page is never part of this canvas.
 *
 * UX layer: a first-run starter-template picker (defaulted by covenant type), a
 * one-click page-theme picker (designPresets), a sidebar block-search, the
 * built-in device-preview toggle, and a click-to-insert live-token cheat-sheet.
 */
export default function CovenantStudio() {
  const { id } = useParams();
  const { address, signMessage } = useWallet();
  const [covenant, setCovenant] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  // Bump this to force the Puck tree to re-mount with fresh data (template / theme apply).
  const [dataKey, setDataKey] = useState(0);
  const puckDataRef = useRef(EMPTY_PAGE);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/covenants/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        const c = d.covenant || null;
        setCovenant(c);
        const existing = c?.custom_ui_config?.puck_data;
        const isEmpty = !(existing && existing.content && existing.content.length);
        const data = isEmpty ? EMPTY_PAGE : existing;
        setInitialData(data);
        puckDataRef.current = data;
        // First run (no saved page yet): offer the starter-template picker.
        if (isEmpty) setShowPicker(true);
      })
      .catch(() => setCovenant(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Live refresh: keep the studio preview's on-chain figures current while the
  // creator designs. Merges ONLY volatile fields, never the canvas.
  useEffect(() => {
    if (!id) return undefined;
    const tick = () => {
      fetch(`/api/covenants/${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const f = d && d.covenant;
          if (!f) return;
          setCovenant((c) => (c ? { ...c, amount_kaspa: f.amount_kaspa, is_active: f.is_active, block_daa_score: f.block_daa_score, timestamp: f.timestamp, tx_count: f.tx_count } : c));
        })
        .catch(() => {});
    };
    const iv = setInterval(tick, 20000);
    return () => clearInterval(iv);
  }, [id]);

  const isCreator = !!(address && covenant && (covenant.creator_addr === address || covenant.address === address));
  const defaultTemplateId = useMemo(() => matchTemplate(covenant?.covenant_type || covenant?.category || covenant?.game_type || ''), [covenant]);

  // Live preview data so the creator sees real on-chain figures while designing.
  const liveData = useMemo(() => {
    if (!covenant) return {};
    const locked = Number(covenant.amount_kaspa || 0);
    const poolA = covenant.funded_pool_a_kas != null ? Number(covenant.funded_pool_a_kas)
      : (covenant.pool_yes != null ? Number(covenant.pool_yes) : null);
    const poolB = covenant.funded_pool_b_kas != null ? Number(covenant.funded_pool_b_kas)
      : (covenant.pool_no != null ? Number(covenant.pool_no) : null);
    const hasSides = Number.isFinite(poolA) && Number.isFinite(poolB) && (poolA + poolB) > 0;
    const feeF = covenant.fee_pct != null ? Number(covenant.fee_pct) / 100 : null;
    const rebateF = covenant.rebate_pct != null ? Number(covenant.rebate_pct) / 100 : null;
    const haveFees = Number.isFinite(feeF) && Number.isFinite(rebateF);
    const winMult = (your, opp) => {
      if (!(your > 0)) return 0;
      return haveFees ? (1 - feeF) + (1 - feeF - rebateF) * (opp / your) : (your + opp) / your;
    };
    return {
      name: covenant.name || covenant.covenant_type || 'Covenant',
      status: covenant.is_active === false ? 'Settled' : 'Active',
      network: covenant.network || 'testnet-12',
      amount_kaspa: locked,
      total_locked: `${locked.toLocaleString()} KAS`,
      tx_count: covenant.tx_count || 0,
      fee_pct: covenant.fee_pct != null ? covenant.fee_pct : '',
      rebate_pct: covenant.rebate_pct != null ? covenant.rebate_pct : '',
      creator: (covenant.creator_addr || covenant.address || '').slice(0, 12),
      daa_score: covenant.block_daa_score || 0,
      verified_tier: covenant.verified_tier || 'FREE',
      pool: { total: locked, ...(hasSides ? { yes: poolA, no: poolB } : {}) },
      odds: hasSides ? { yes: winMult(poolA, poolB), no: winMult(poolB, poolA), basis: haveFees ? 'net-after-fee-rebate' : 'gross-before-fees' } : {},
      pool_total: locked,
      pool_yes: hasSides ? poolA : '',
      pool_no: hasSides ? poolB : '',
      odds_yes: hasSides && poolA > 0 ? winMult(poolA, poolB).toFixed(2) : '',
      odds_no: hasSides && poolB > 0 ? winMult(poolB, poolA).toFixed(2) : '',
      kickoff: covenant.kickoff_utc || covenant.kickoff || '',
      settle_at: covenant.settle_at || covenant.settle_utc || covenant.resolved_at || '',
      timelock: covenant.lock_daa != null ? covenant.lock_daa : (covenant.timelock_daa != null ? covenant.timelock_daa : ''),
      // Static honesty label for the EnforcementBadge block (never a fund flow).
      enforcement_reality: covenant.enforcement_reality || '',
    };
  }, [covenant]);

  // Load a starter template into the canvas (replaces current content).
  const applyTemplate = useCallback((tplId) => {
    const tpl = STARTER_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const data = JSON.parse(JSON.stringify(tpl.data));
    setInitialData(data);
    puckDataRef.current = data;
    setDataKey((k) => k + 1);
    setShowPicker(false);
    toast.success(`Loaded the "${tpl.name}" starter.`);
  }, []);

  const startBlank = useCallback(() => {
    setInitialData(EMPTY_PAGE);
    puckDataRef.current = EMPTY_PAGE;
    setDataKey((k) => k + 1);
    setShowPicker(false);
  }, []);

  // Apply a designPresets palette to the Puck ROOT (accent + nearest background).
  const applyTheme = useCallback((preset) => {
    const cur = puckDataRef.current || EMPTY_PAGE;
    const accent = SAFE_COLOR(preset.palette.accent);
    // Map palette hue to the closest built-in page-background preset.
    const bgByPalette = { gold: 'gold-prestige', royal: 'purple-mystic', neon: 'aurora', mint: 'aurora', kaspa: 'kaspa-hero' };
    const backgroundPreset = bgByPalette[preset.palette.id] || (preset.mood?.id === 'minimal' ? 'midnight' : 'kaspa-hero');
    const next = { ...cur, root: { ...cur.root, props: { ...(cur.root?.props || {}), accentColor: accent, backgroundPreset } } };
    setInitialData(next);
    puckDataRef.current = next;
    setDataKey((k) => k + 1);
    setShowThemes(false);
    toast.success(`Applied the "${preset.palette.name}" page theme.`);
  }, []);

  const save = useCallback(async (data) => {
    setSaving(true);
    try {
      const proof = await signCovenantOwnership(id, address, signMessage);
      const res = await fetch(`/api/terminal-config/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...proof,
          name: covenant?.name,
          description: covenant?.description,
          theme: covenant?.custom_ui_config?.theme || null,
          puck_data: data,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && (d.success || d.ok)) {
        toast.success('Page published. Visitors now see your design.');
      } else {
        toast.error(d.error || 'Save failed. Check covenant ownership and try again.');
      }
    } catch (e) {
      toast.error(e?.message || 'Network error while saving.');
    } finally {
      setSaving(false);
    }
  }, [id, address, signMessage, covenant]);

  if (loading) {
    return <div className="flex justify-center py-32"><div className="w-8 h-8 rounded-full border-2 border-kaspa-green/30 border-t-kaspa-green animate-spin" /></div>;
  }
  if (!covenant) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-24 text-center">
        <p className="text-white font-bold mb-2">Covenant not found</p>
        <Link to="/" className="text-kaspa-green text-sm underline">Back to Explorer</Link>
      </div>
    );
  }
  if (!isCreator) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-24 text-center">
        <Sparkles size={28} className="text-kaspa-green mx-auto mb-4" />
        <p className="text-white font-bold mb-2">Page Studio is creator-only</p>
        <p className="text-sm text-gray-400 mb-6">Connect the wallet that deployed this covenant to design its public page with drag and drop blocks.</p>
        <Link to={`/covenant/${encodeURIComponent(id)}`} className="text-kaspa-green text-sm underline">View the covenant instead</Link>
      </div>
    );
  }

  return (
    <div className="covex-studio relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.08] light:border-slate-200 bg-[#0A0A0D]">
        <Link to={`/covenant/${encodeURIComponent(id)}`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white shrink-0 whitespace-nowrap">
          <ArrowLeft size={13} /> Back to covenant
        </Link>
        <p className="text-xs font-bold text-white truncate min-w-0 px-2">{covenant.name || 'Covenant'} · Page Studio</p>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowThemes(true)} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
            <Palette size={13} /> Theme
          </button>
          <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
            <LayoutTemplate size={13} /> Templates
          </button>
        </div>
      </div>

      <Puck
        key={dataKey}
        config={puckConfig}
        data={initialData || EMPTY_PAGE}
        metadata={{ live: liveData }}
        viewports={VIEWPORTS}
        onChange={(d) => { puckDataRef.current = d; }}
        onPublish={save}
        overrides={{
          headerActions: ({ children }) => (
            <>
              {children}
              {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><Save size={12} /> Saving...</span>}
            </>
          ),
          // Sidebar block list with a live search filter (Priority 8).
          components: ({ children }) => <BlockSearch>{children}</BlockSearch>,
        }}
      />

      {/* Live token cheat sheet: click any token to copy it for pasting into a field. */}
      <TokenCheatSheet />

      {showPicker && (
        <TemplatePickerModal
          defaultId={defaultTemplateId}
          onPick={applyTemplate}
          onBlank={startBlank}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showThemes && <ThemePickerModal onApply={applyTheme} onClose={() => setShowThemes(false)} />}
      {/* Toasts render app-wide top-right via ToastProvider (ToastContext singleton). */}
    </div>
  );
}

// ── Sidebar block search: filters Puck's component list by label text. The list
// items render the label as text, so we hide non-matching draggables via a data
// attribute the user-supplied query drives. Hoisted so it never remounts. ──
function BlockSearch({ children }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const t = q.trim().toLowerCase();
    const items = root.querySelectorAll('[class*="ComponentList-item"], [data-rfd-draggable-id], li');
    items.forEach((el) => {
      if (!t) { el.style.removeProperty('display'); return; }
      const txt = (el.textContent || '').toLowerCase();
      el.style.display = txt.includes(t) ? '' : 'none';
    });
  }, [q, children]);
  return (
    <div ref={ref} className="cvx-block-search">
      <div className="cvx-block-search-bar">
        <Search size={14} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search blocks..."
          spellCheck={false}
        />
        {q && <button type="button" aria-label="Clear" onClick={() => setQ('')}><X size={13} /></button>}
      </div>
      {children}
    </div>
  );
}

// ── First-run starter-template picker. Defaults the selection by covenant type. ──
function TemplatePickerModal({ defaultId, onPick, onBlank, onClose }) {
  const [sel, setSel] = useState(defaultId);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 light:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] light:border-slate-200">
          <div>
            <p className="text-sm font-black text-white light:text-slate-900">Start from a template</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">Premium, honest layouts. Tweak everything after.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-2.5">
          {STARTER_TEMPLATES.map((t) => {
            const active = sel === t.id;
            return (
              <button key={t.id} onClick={() => setSel(t.id)}
                className={`text-left rounded-xl border p-3.5 transition-all ${active ? 'border-kaspa-green bg-kaspa-green/[0.06]' : 'border-white/10 light:border-slate-200 hover:border-white/25 light:hover:border-slate-300'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-bold text-white light:text-slate-900">{t.name}</span>
                  {active && <Check size={15} className="text-kaspa-green shrink-0" />}
                  {!active && t.id === defaultId && <span className="text-[9px] font-bold uppercase tracking-wider text-kaspa-green shrink-0">Suggested</span>}
                </div>
                <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">{t.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.08] light:border-slate-200">
          <button onClick={onBlank} className="text-xs font-semibold text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900">Start blank</button>
          <button onClick={() => onPick(sel)} className="px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 transition-all">Use this template</button>
        </div>
      </div>
    </div>
  );
}

// ── One-click page-theme picker from designPresets (accent + page background). ──
function ThemePickerModal({ onApply, onClose }) {
  // Use the dark-mood palettes only (one swatch per palette) for a clean grid.
  const presets = useMemo(() => getPresets().filter((p) => p.mood.id === 'dark'), []);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 light:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] light:border-slate-200">
          <div>
            <p className="text-sm font-black text-white light:text-slate-900">Page theme</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">Sets the accent color and page background in one click.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {presets.map((p) => (
            <button key={p.id} onClick={() => onApply(p)} className="rounded-xl overflow-hidden border border-white/10 light:border-slate-200 hover:border-white/30 transition-all text-left">
              <div className="h-16" style={{ background: presetBackdrop(p) }} />
              <div className="px-2.5 py-2 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.palette.accent }} />
                <span className="text-[11px] font-semibold text-white light:text-slate-800 truncate">{p.palette.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Live-token cheat sheet: click a token to copy it for pasting into a field. ──
function TokenCheatSheet() {
  const [copied, setCopied] = useState('');
  const copy = (tok) => {
    const text = `{{${tok}}}`;
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    } catch (_) { /* no-op */ }
    setCopied(tok);
    setTimeout(() => setCopied((c) => (c === tok ? '' : c)), 1200);
  };
  return (
    <details className="cvx-cheatsheet fixed bottom-4 left-4 z-[90] w-72 rounded-2xl border border-white/[0.1] light:border-slate-200 bg-[#0A0A0D]/95 light:bg-white/95 backdrop-blur shadow-2xl">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-xs font-bold text-kaspa-green list-none">
        <Zap size={13} /> Live data tokens
      </summary>
      <div className="px-4 pb-3 max-h-64 overflow-y-auto">
        <p className="text-[11px] text-gray-500 light:text-slate-500 mb-2 leading-relaxed">Click a token to copy it, then paste it into any text field. It updates live from the chain.</p>
        <ul className="space-y-1">
          {LIVE_TOKENS.map((t) => (
            <li key={t.token}>
              <button
                type="button"
                onClick={() => copy(t.token)}
                className="w-full flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-lg hover:bg-kaspa-green/[0.08] light:hover:bg-teal-50 transition-colors text-left"
              >
                <code className="text-kaspa-green font-mono shrink-0">{copied === t.token ? 'Copied!' : `{{${t.token}}}`}</code>
                <span className="text-gray-500 light:text-slate-500 text-right min-w-0 truncate">{t.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
