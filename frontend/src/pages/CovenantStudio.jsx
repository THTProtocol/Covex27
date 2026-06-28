import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Puck, Render as PuckRender } from '@measured/puck';
import '@measured/puck/puck.css';
import { ArrowLeft, ArrowRight, Save, Eye, Sparkles, Zap, Search, Palette, LayoutTemplate, Smartphone, Monitor, X, Check, Settings, Coins, MoreHorizontal, Mail, Copy, Wrench, Info, Lock } from 'lucide-react';
import { useWallet } from '../components/WalletContext';
import { toast } from '../components/ToastContext';
import { signCovenantOwnership } from '../lib/ownership';
import puckConfig, { LIVE_TOKENS, STARTER_TEMPLATES, matchTemplate, SAFE_COLOR } from '../lib/puckConfig';
import { getPresets, presetBackdrop } from '../lib/designPresets';
import ToolsPalette from '../components/ToolsPalette.jsx';
import Spinner from '../components/ui/Spinner';

// Random-id helper matching the convention puckConfig.blk() uses so blocks added
// from the ToolsPalette are uniquely keyed inside the Puck content tree.
const newBlockId = (type) => `${type}-${Math.random().toString(36).slice(2, 9)}`;

const EMPTY_PAGE = { content: [], root: { props: {} } };

// Human-readable label for a Puck content block, drawn from the catalog's own
// component `label` (e.g. HeroImage -> "Hero (image)") so the transparency list
// the user reads matches the editor's own naming. Falls back to the raw type.
const blockLabel = (type) => (puckConfig.components?.[type]?.label) || type || 'Block';

// Ordered, de-duplicated list of the human-readable block names a Puck page
// contains. Powers the "what this layout includes" transparency line (T4) under
// each template thumbnail. Pure; safe to call during render.
const pageBlockNames = (data) => {
  const seen = new Set();
  const out = [];
  for (const item of (data?.content || [])) {
    const name = blockLabel(item?.type);
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
};

// Read-only, scaled-down thumbnail of a Puck page. Reuses the SAME PuckRender +
// puckConfig + live metadata the canvas and public page use, so the preview is a
// real layout, never a mock. Rendered at a fixed 1024px design width inside a
// clipped, pointer-events:none container and scaled to fit (covexPuck.css owns
// the clip + transform; only the per-call scale + height vary). Hoisted to module
// scope so it never remounts. ResizeObserver-free: the scale is fixed and the
// clip height is a prop, which is enough for a static thumbnail.
function PuckPageThumb({ data, liveData, height = 120, scale = 0.16, className = '' }) {
  const hasContent = !!(data && data.content && data.content.length);
  return (
    <div
      className={`cvx-puck-thumb-clip ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {hasContent ? (
        <div className="cvx-puck-thumb-page" style={{ '--cvx-thumb-scale': scale }}>
          <PuckRender config={puckConfig} data={data} metadata={{ live: liveData }} />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-[10px] uppercase tracking-widest font-bold text-gray-500 light:text-slate-600">
          Blank page
        </div>
      )}
    </div>
  );
}

// Simple focus trap: while `active`, scopes Tab / Shift+Tab cycling to focusable
// elements inside `ref.current`, restoring focus to the previously-focused element
// on deactivate. Used by every Studio drawer so a keyboard user cannot tab into
// the canvas behind an open dialog. No new dep, no portal contract assumed.
// Hoisted to module scope so it never remounts. Reduced-motion-safe (no animation).
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
    // Focus the first focusable element inside the drawer on open. If none, focus
    // the container itself so subsequent Tab presses can be intercepted.
    const focusables = () => Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const first = focusables()[0];
    if (first && typeof first.focus === 'function') {
      first.focus();
    } else if (root.tabIndex < 0) {
      root.setAttribute('tabindex', '-1');
      root.focus();
    }
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !root.contains(activeEl)) { e.preventDefault(); lastEl.focus(); }
      } else if (activeEl === lastEl) {
        e.preventDefault(); firstEl.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch (_) { /* no-op */ }
      }
    };
  }, [ref, active]);
}

// Track viewport <md so we can swap the unusable DnD canvas for a desktop-link
// interstitial on phones. md = 768px in Tailwind v4 defaults. Hoisted to module
// scope so it never remounts and is SSR-safe.
function useIsMobile(maxPx = 767) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(`(max-width: ${maxPx}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(`(max-width: ${maxPx}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [maxPx]);
  return isMobile;
}

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isFresh = searchParams.get('fresh') === '1';
  const { address, signMessage } = useWallet();
  // Creator's paid tier, the SAME backend source the Terminal / Sandbox use
  // (/api/paid-status). It gates ONLY which UI website templates can be applied:
  // the free base set is always usable, premium layouts prompt an upgrade. It never
  // gates the Studio itself, building from scratch, or any technical capability.
  // Defaults to FREE (fail-closed: a creator only sees premium unlocked once the
  // backend confirms a paid tier).
  const [isPaid, setIsPaid] = useState(false);
  const [covenant, setCovenant] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // One-time "deploy succeeded" banner controlled by ?fresh=1 in the URL.
  // Dismiss strips the query param so a refresh never resurfaces it.
  const [showFreshBanner, setShowFreshBanner] = useState(isFresh);
  // Single source of truth for every Studio drawer / overlay. Only one is open at
  // a time, which removes the prior "Esc closed only the topmost" ambiguity and
  // lets a single page-level Escape handler and one focus trap own the contract.
  // Drawer ids: 'tools' | 'picker' | 'themes' | 'settings' | 'more' | 'tokens' | 'help' | 'preview'.
  // Page settings drawer absorbs the only unique controls the old Fix page had
  // (stake / name / description), persisted via the SAME terminal-config POST.
  // The 'more' overflow menu collapses Settings / Theme / Templates / Tokens behind
  // a single icon on <md so row 1 stays Back + Title + Publish (44px touch targets).
  const [activeDrawer, setActiveDrawer] = useState(null);
  const openDrawer = useCallback((drawerId) => setActiveDrawer(drawerId), []);
  const closeDrawer = useCallback(() => setActiveDrawer(null), []);
  // Toolbar trigger refs for focus restore. The modal drawers (picker / themes /
  // settings / help) restore focus via useFocusTrap, but the inline 'tools' panel
  // and the 'more' overflow menu do not use the trap, so Escape / X close drops
  // focus to <body>. These refs let a small effect put focus back where it came
  // from, mirroring WalletButton's drawerWasOpen pattern.
  const toolsBtnRef = useRef(null);
  const moreBtnRef = useRef(null);
  // Bump this to force the Puck tree to re-mount with fresh data (template / theme apply).
  const [dataKey, setDataKey] = useState(0);
  const puckDataRef = useRef(EMPTY_PAGE);
  // On phones the drag-and-drop canvas is unusable (tiny targets, no hover, the
  // Puck sidebar overlaps content). Show a desktop-link interstitial instead.
  const isMobile = useIsMobile();

  // Page-level Escape closes whichever drawer is open. One listener owns the
  // contract for the whole Studio so per-drawer Escape handlers are not needed.
  useEffect(() => {
    if (!activeDrawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeDrawer, closeDrawer]);

  // Restore focus to the originating toolbar button when the 'tools' or 'more'
  // drawer transitions from open to closed. Mirrors WalletButton's drawerWasOpen
  // ref + focus call. Other drawers (picker / themes / settings / help) get this
  // via useFocusTrap so they need no extra handling here.
  const toolsWasOpen = useRef(false);
  useEffect(() => {
    if (activeDrawer === 'tools') { toolsWasOpen.current = true; return; }
    if (toolsWasOpen.current && toolsBtnRef.current) toolsBtnRef.current.focus();
    toolsWasOpen.current = false;
  }, [activeDrawer]);
  const moreWasOpen = useRef(false);
  useEffect(() => {
    if (activeDrawer === 'more') { moreWasOpen.current = true; return; }
    if (moreWasOpen.current && moreBtnRef.current) moreBtnRef.current.focus();
    moreWasOpen.current = false;
  }, [activeDrawer]);

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
        if (isEmpty) setActiveDrawer('picker');
      })
      .catch(() => setCovenant(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Resolve the creator's paid tier from the backend (same source as the Terminal
  // and Sandbox). FREE creators can still build; this only flips premium UI website
  // templates from locked to applicable. Fails closed to FREE on any error.
  useEffect(() => {
    if (!address) { setIsPaid(false); return undefined; }
    let cancelled = false;
    const net = (typeof localStorage !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'mainnet';
    fetch(`/api/paid-status?address=${encodeURIComponent(address)}&network=${encodeURIComponent(net)}`)
      .then((r) => (r.ok ? r.json() : { highest_tier: 'FREE' }))
      .then((d) => { if (!cancelled) setIsPaid(!!(d && d.highest_tier && String(d.highest_tier).toUpperCase() !== 'FREE')); })
      .catch(() => { if (!cancelled) setIsPaid(false); });
    return () => { cancelled = true; };
  }, [address]);

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
      fetch(`/api/covenants/${encodeURIComponent(id)}/actions`)
        .then((r) => r.json())
        .then((d) => setActions(Array.isArray(d.actions) ? d.actions : []))
        .catch(() => {});
    };
    const iv = setInterval(tick, 20000);
    return () => clearInterval(iv);
  }, [id]);

  // On-chain action log + external resolver key, so the Studio PREVIEW shows EXACTLY what a
  // visitor sees: ActivityFeed / Leaderboard / PoolChart populate from real indexed actions,
  // and {{oracle_pubkey}} resolves to the real disclosed BIP340 key instead of the literal
  // token. Mirrors CovenantInteractive verbatim so the preview is faithful, not a hollow shell.
  const [actions, setActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    setActionsLoading(true);
    fetch(`/api/covenants/${encodeURIComponent(id)}/actions`)
      .then((r) => r.json())
      .then((d) => setActions(Array.isArray(d.actions) ? d.actions : []))
      .catch(() => {})
      .finally(() => setActionsLoading(false));
  }, [id]);

  const [oraclePubkey, setOraclePubkey] = useState('');
  useEffect(() => {
    fetch('/api/oracle/pubkey')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOraclePubkey(j.xonly_pubkey || j.oracle_xonly_pubkey || j.oracle_pubkey || j.pubkey || ''))
      .catch(() => {});
  }, []);

  const isCreator = !!(address && covenant && (covenant.creator_addr === address || covenant.address === address));
  const defaultTemplateId = useMemo(() => matchTemplate(covenant?.covenant_type || covenant?.category || covenant?.game_type || ''), [covenant]);

  // Live preview data so the creator sees EXACTLY what a visitor sees while designing. This
  // mirrors CovenantInteractive's liveData (same fields, same honesty rules) so the Studio
  // preview is faithful: ActivityFeed / Leaderboard / PoolChart populate from the real indexed
  // action log, {{oracle_pubkey}} resolves to the disclosed key, and loading drives skeletons.
  const liveData = useMemo(() => {
    if (!covenant) return { loading: actionsLoading };
    const locked = Number(covenant.amount_kaspa || 0);

    // Normalize the indexed on-chain action log into stable rows for the read-only blocks.
    // Same shape CovenantInteractive uses; no row is synthesized.
    const acts = (Array.isArray(actions) ? actions : []).map((a) => ({
      label: a.label || a.action || a.type || 'Action',
      detail: a.detail || '',
      address: a.address || a.from || a.creator || a.bettor_addr || '',
      amount_kaspa: Number(a.amount_kaspa ?? a.amount ?? 0) || 0,
      timestamp: a.timestamp != null ? Number(a.timestamp) : null,
      daa_score: a.daa_score != null ? Number(a.daa_score) : (covenant.block_daa_score || null),
    }));

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
      loading: actionsLoading,
      name: covenant.name || covenant.covenant_type || 'Covenant',
      status: covenant.is_active === false ? 'Settled' : 'Active',
      network: covenant.network || 'mainnet',
      amount_kaspa: locked,
      total_locked: `${locked.toLocaleString()} KAS`,
      tx_count: actions.length,
      fee_pct: covenant.fee_pct != null ? covenant.fee_pct : '',
      rebate_pct: covenant.rebate_pct != null ? covenant.rebate_pct : '',
      creator: (covenant.creator_addr || covenant.address || '').slice(0, 12),
      daa_score: covenant.block_daa_score || 0,
      verified_tier: covenant.verified_tier || 'FREE',
      // Structured live data the premium read-only blocks consume off metadata.live.
      actions: acts,
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
      // external resolver identity (BIP340 x-only key) + outcome commitments, when present, so
      // an oracle-signer display shows the REAL key instead of the literal {{oracle_pubkey}}.
      oracle_pubkey: oraclePubkey || '',
      commitment_a: covenant.h_a || '',
      commitment_b: covenant.h_b || '',
      // Static honesty label for the EnforcementBadge block (never a fund flow).
      enforcement_reality: covenant.enforcement_reality || '',
    };
  }, [covenant, actions, actionsLoading, oraclePubkey]);

  // Load a starter template into the canvas (replaces current content). Premium
  // layouts are part of the paid template library: for a FREE creator, selecting one
  // routes to /pricing instead of applying, so building from scratch and the free base
  // set stay fully usable while the premium library is the paid add-on.
  const applyTemplate = useCallback((tplId) => {
    const tpl = STARTER_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    if (tpl.premium && !isPaid) {
      toast.info('That layout is part of the premium template library. Free includes the base starters and building from scratch.');
      navigate('/pricing');
      return;
    }
    const data = JSON.parse(JSON.stringify(tpl.data));
    setInitialData(data);
    puckDataRef.current = data;
    setDataKey((k) => k + 1);
    closeDrawer();
    toast.success(`Loaded the "${tpl.name}" starter.`);
  }, [closeDrawer, isPaid, navigate]);

  const startBlank = useCallback(() => {
    setInitialData(EMPTY_PAGE);
    puckDataRef.current = EMPTY_PAGE;
    setDataKey((k) => k + 1);
    closeDrawer();
  }, [closeDrawer]);

  // Dismiss the post-deploy success banner by stripping ?fresh=1 from the URL,
  // so a refresh never resurfaces it. Preserves any other query params present.
  const dismissFresh = useCallback(() => {
    setShowFreshBanner(false);
    const next = new URLSearchParams(searchParams);
    next.delete('fresh');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Append a block to the active Puck tree from the ToolsPalette. Validates the
  // componentId against the puckConfig.components registry; an unknown id is a
  // no-op. The data is replaced via the same setInitialData + dataKey-bump pattern
  // applyTemplate / applyTheme already use, so Puck cleanly remounts with the new
  // tree. The block id matches the convention puckConfig.blk() uses.
  const onAddBlock = useCallback((componentId) => {
    if (!componentId || !puckConfig.components || !Object.prototype.hasOwnProperty.call(puckConfig.components, componentId)) {
      return;
    }
    const cur = puckDataRef.current || EMPTY_PAGE;
    const defaults = (puckConfig.components[componentId] && puckConfig.components[componentId].defaultProps) || {};
    const block = { type: componentId, props: { id: newBlockId(componentId), ...defaults } };
    const next = { ...cur, content: [...(cur.content || []), block], root: cur.root || { props: {} } };
    setInitialData(next);
    puckDataRef.current = next;
    setDataKey((k) => k + 1);
    toast.success(`Added "${blockLabel(componentId)}" block.`);
  }, []);

  // Apply a designPresets palette to the Puck ROOT (accent + nearest background).
  const applyTheme = useCallback((preset) => {
    const cur = puckDataRef.current || EMPTY_PAGE;
    const accent = SAFE_COLOR(preset.palette.accent);
    // Map every one of the 16 designPresets palettes to the nearest built-in page-background
    // preset (BG_PRESETS in puckConfig has 5: kaspa-hero, aurora, purple-mystic, gold-prestige,
    // midnight). Previously only 5 palettes were mapped and the other 11 collapsed to one
    // default background, so picking a theme often changed nothing visible. Grouped by hue:
    //   teal/green   -> kaspa-hero   | blue        -> aurora
    //   purple/pink  -> purple-mystic| warm/amber  -> gold-prestige
    //   neutral/deep -> midnight
    const bgByPalette = {
      kaspa: 'kaspa-hero', mint: 'kaspa-hero', forest: 'kaspa-hero', neon: 'kaspa-hero',
      aurora: 'aurora', ocean: 'aurora', cobalt: 'aurora',
      royal: 'purple-mystic', rose: 'purple-mystic', magma: 'purple-mystic',
      gold: 'gold-prestige', sand: 'gold-prestige', ember: 'gold-prestige', dusk: 'gold-prestige',
      arctic: 'midnight', crimson: 'midnight',
    };
    const backgroundPreset = bgByPalette[preset.palette.id] || (preset.mood?.id === 'minimal' ? 'midnight' : 'kaspa-hero');
    const next = { ...cur, root: { ...cur.root, props: { ...(cur.root?.props || {}), accentColor: accent, backgroundPreset } } };
    setInitialData(next);
    puckDataRef.current = next;
    setDataKey((k) => k + 1);
    closeDrawer();
    toast.success(`Applied the "${preset.palette.name}" page theme.`);
  }, [closeDrawer]);

  // Single POST to the protected terminal-config endpoint, reused by both the Puck
  // publish (page design) and the Page settings drawer (stake / name / description).
  // `overrides` lets the settings drawer change name / description / theme without a
  // separate endpoint or backend change. Stake round-trips inside theme.default_stake,
  // exactly like the old Fix page, so it reads back via GET /api/terminal-config/:id.
  const postConfig = useCallback(async ({ name, description, theme, puck_data, successMsg }) => {
    setSaving(true);
    try {
      const proof = await signCovenantOwnership(id, address, signMessage);
      const res = await fetch(`/api/terminal-config/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proof, name, description, theme, puck_data }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && (d.success || d.ok)) {
        toast.success(successMsg || 'Saved.');
        return true;
      }
      toast.error(d.error || 'Save failed. Check covenant ownership and try again.');
      return false;
    } catch (e) {
      toast.error(e?.message || 'Network error while saving.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, address, signMessage]);

  // Puck publish: persists the page design. Name / description / theme carry forward
  // from the covenant record so a publish never clobbers the Page settings values.
  const save = useCallback((data) => postConfig({
    name: covenant?.name,
    description: covenant?.description,
    theme: covenant?.custom_ui_config?.theme || null,
    puck_data: data,
    successMsg: 'Page published. Visitors now see your design.',
  }), [postConfig, covenant]);

  // Page settings: stake amount + name / description override. Preserves the current
  // page design (puckDataRef) and merges stake into theme so neither is lost.
  const saveSettings = useCallback(async ({ name, description, stake }) => {
    const baseTheme = covenant?.custom_ui_config?.theme || {};
    const theme = { ...baseTheme, default_stake: stake };
    const ok = await postConfig({
      name: name || covenant?.name,
      description: description || covenant?.description,
      theme,
      puck_data: puckDataRef.current,
      successMsg: 'Page settings saved. Stake, name and description updated.',
    });
    if (ok) {
      setCovenant((c) => (c ? { ...c, name: name || c.name, description: description || c.description, custom_ui_config: { ...(c.custom_ui_config || {}), theme } } : c));
      closeDrawer();
    }
    return ok;
  }, [postConfig, covenant, closeDrawer]);

  if (loading) {
    return <div className="flex justify-center py-32" role="status" aria-busy="true" aria-label="Loading studio"><Spinner size="lg" label="Loading studio" /></div>;
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
        <p className="text-white font-bold mb-2">Covenant Studio is creator-only</p>
        <p className="text-sm text-gray-400 mb-6">Connect the wallet that deployed this covenant to design its public page with drag and drop blocks.</p>
        <Link to={`/covenant/${encodeURIComponent(id)}`} className="text-kaspa-green text-sm underline">View the covenant instead</Link>
      </div>
    );
  }

  return (
    <div className="covex-studio relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* 5-step rail is mounted globally in App.jsx; it auto-switches to its
          compact form on this route, so no per-page mount is needed here. */}

      {/* Post-deploy success banner. Shown once when arriving via ?fresh=1 from the
          deploy step. Dismiss strips the query so a refresh never resurfaces it. */}
      {showFreshBanner && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 md:px-5 py-2.5 border-b border-emerald-500/20 light:border-emerald-600/30 bg-emerald-500/[0.07] light:bg-emerald-50">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/20 light:bg-emerald-600/15 text-emerald-300 light:text-emerald-700 shrink-0">
              <Check size={13} />
            </span>
            <p className="text-[12px] font-bold text-emerald-300 light:text-emerald-800 truncate">
              Your covenant is live. Now design its public page.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openDrawer('picker')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 light:text-emerald-900 hover:underline"
            >
              Pick a starter template <ArrowRight size={12} />
            </button>
            <button
              type="button"
              onClick={dismissFresh}
              aria-label="Dismiss success banner"
              className="flex items-center justify-center h-9 w-9 rounded-lg text-emerald-300 light:text-emerald-700 hover:bg-emerald-500/[0.1] light:hover:bg-emerald-600/10 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="relative flex items-center justify-between gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-3 border-b border-white/[0.08] light:border-slate-200 bg-[#0A0A0D] light:bg-white">
        <Link data-tour="public-page" to={`/covenant/${encodeURIComponent(id)}`} aria-label="Back to covenant" className="flex items-center justify-center md:justify-start gap-1.5 text-xs text-gray-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 shrink-0 whitespace-nowrap h-11 w-11 md:w-auto md:h-10 md:px-1">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Back to covenant</span>
        </Link>
        <p className="flex-1 min-w-0 text-[11px] md:text-xs font-bold text-white light:text-slate-900 truncate px-1 md:px-2">{covenant.name || 'Covenant'} · Covenant Studio</p>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {/* Desktop: inline secondary actions (md+). Mobile: collapsed into overflow menu. */}
          <button onClick={() => openDrawer('settings')} aria-label="Page settings" title="Stake amount, name, description. Saved with your page. The fund destination is always derived from the indexed covenant record, never from page settings." className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-10 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
            <Settings size={14} /> <span className="hidden sm:inline">Page settings</span>
          </button>
          <button onClick={() => openDrawer('themes')} aria-label="Theme" title="One click sets the accent color and page background. Your block content is preserved, no re-publishing needed." className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-10 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
            <Palette size={14} /> <span className="hidden sm:inline">Theme</span>
          </button>
          <button onClick={() => openDrawer('picker')} aria-label="Templates" title="Start from a premium, honest layout. Tweak everything after. Blocks are platform-authored, never raw HTML." className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-10 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
            <LayoutTemplate size={14} /> <span className="hidden sm:inline">Templates</span>
          </button>
          <button
            ref={toolsBtnRef}
            data-tour="studio-block"
            onClick={() => setActiveDrawer((cur) => (cur === 'tools' ? null : 'tools'))}
            aria-label="Add block panel"
            aria-expanded={activeDrawer === 'tools'}
            className={`hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-10 rounded-lg border transition-colors ${activeDrawer === 'tools' ? 'border-kaspa-green/50 bg-kaspa-green/[0.08] text-kaspa-green' : 'border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100'}`}
          >
            <Wrench size={14} /> <span className="hidden sm:inline">Add block</span>
          </button>
          {/* Preview page: opens the CLEAN public render (no editor chrome / drag
              handles) using the SAME PuckRender + data the public page uses, so it
              is exactly what viewers see. Desktop inline; mobile in overflow menu. */}
          <button
            onClick={() => openDrawer('preview')}
            aria-label="Preview page"
            title="See the clean public page exactly as visitors will, with no editor handles. Nothing is published."
            className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-10 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
          >
            <Eye size={14} /> <span className="hidden sm:inline">Preview page</span>
          </button>
          {/* Mobile-only overflow trigger (44px touch target). */}
          <button
            ref={moreBtnRef}
            onClick={() => setActiveDrawer((cur) => (cur === 'more' ? null : 'more'))}
            aria-label="More page tools"
            aria-expanded={activeDrawer === 'more'}
            className="md:hidden flex items-center justify-center h-11 w-11 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
          >
            <MoreHorizontal size={18} />
          </button>
          <button
            onClick={() => save(puckDataRef.current)}
            disabled={saving}
            aria-label="Publish page"
            className="btn-shimmer flex items-center justify-center md:justify-start gap-1.5 text-[11px] font-bold h-11 w-11 md:w-auto md:h-10 md:px-3 rounded-lg bg-kaspa-green text-black hover:brightness-110 disabled:opacity-60 transition-all"
          >
            <Save size={16} className="md:hidden" />
            <Save size={14} className="hidden md:inline" />
            <span className="hidden sm:inline">{saving ? 'Publishing...' : 'Publish'}</span>
          </button>
        </div>

        {/* Mobile overflow menu: Settings / Theme / Templates / Live tokens. */}
        {activeDrawer === 'more' && (
          <MoreMenu openDrawer={openDrawer} closeDrawer={closeDrawer} />
        )}
      </div>

      {/* Compact instructional strip above the Puck canvas (desktop). One link
          opens a slide-over with all explainers grouped, so the action bar above
          stays the visual primary. Hidden on mobile because the canvas is too. */}
      <div className="hidden md:flex items-center justify-end px-5 py-2 border-b border-white/[0.06] light:border-slate-200 bg-[#08080c] light:bg-slate-50">
        <button
          type="button"
          onClick={() => openDrawer('help')}
          className="text-[11px] text-gray-400 light:text-slate-500 hover:text-kaspa-green flex items-center gap-1 transition-colors"
        >
          <Info size={12} /> How the Studio works
        </button>
      </div>

      {isMobile ? (
        <MobileStudioInterstitial
          covenantId={id}
          data={initialData || EMPTY_PAGE}
          liveData={liveData}
        />
      ) : (
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
                {saving && <span className="text-xs text-slate-500 flex items-center gap-1"><Save size={12} /> Saving...</span>}
              </>
            ),
            // Sidebar block list with a live search filter (Priority 8). When the
            // creator opens the palette, it docks into the same Puck sidebar
            // column above the search instead of floating over the fields panel.
            components: ({ children }) => (
              <BlockSearch
                paletteOpen={activeDrawer === 'tools'}
                onClosePalette={closeDrawer}
                onAddBlock={onAddBlock}
              >
                {children}
              </BlockSearch>
            ),
          }}
        />
      )}

      {/* ToolsPalette docks into the Puck sidebar above BlockSearch via the
          overrides.components slot (see <Puck overrides> above). It is no longer
          a floating aside, so it never occludes the field editor panel. */}

      {/* Live token cheat sheet: click any token to copy it for pasting into a field.
          Hidden on <md to keep the canvas clear; mobile creators reach it via the
          overflow menu, which opens a centered modal version of the same list. */}
      <div className="hidden md:block">
        <TokenCheatSheet />
      </div>
      {activeDrawer === 'tokens' && (
        <TokenCheatSheetModal onClose={closeDrawer} />
      )}

      {activeDrawer === 'picker' && (
        <TemplatePickerModal
          defaultId={defaultTemplateId}
          isPaid={isPaid}
          liveData={liveData}
          onPick={applyTemplate}
          onBlank={startBlank}
          onClose={closeDrawer}
        />
      )}
      {activeDrawer === 'preview' && (
        <PagePreviewModal
          data={puckDataRef.current || initialData || EMPTY_PAGE}
          liveData={liveData}
          covenantId={id}
          onClose={closeDrawer}
        />
      )}
      {activeDrawer === 'themes' && <ThemePickerModal onApply={applyTheme} onClose={closeDrawer} />}
      {activeDrawer === 'settings' && (
        <PageSettingsModal
          covenant={covenant}
          saving={saving}
          onSave={saveSettings}
          onClose={closeDrawer}
        />
      )}
      {activeDrawer === 'help' && <StudioHelpDrawer onClose={closeDrawer} />}
      {/* Toasts render app-wide top-right via ToastProvider (ToastContext singleton). */}
    </div>
  );
}

// Mobile overflow menu (Settings / Theme / Templates / Live tokens). Hoisted so
// it never remounts. Wears a focus trap because Tab inside the menu must stay in
// the menu while it is open. Tapping a row swaps activeDrawer to the target id
// in one shot through openDrawer, so closeDrawer-then-openDrawer is not needed.
function MoreMenu({ openDrawer, closeDrawer }) {
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={closeDrawer}
        className="md:hidden fixed inset-0 z-[95] bg-black/30"
      />
      <div ref={trapRef} role="menu" aria-label="More page tools" className="md:hidden absolute right-3 top-[calc(100%+6px)] z-[96] min-w-[200px] rounded-xl border border-white/[0.12] light:border-slate-200 bg-[#0A0A0D]/98 light:bg-white/98 backdrop-blur shadow-2xl p-1.5">
        <button role="menuitem" onClick={() => openDrawer('settings')} className="w-full flex items-center gap-2.5 text-[12px] font-semibold px-3 h-11 rounded-lg text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
          <Settings size={15} /> Page settings
        </button>
        <button role="menuitem" onClick={() => openDrawer('themes')} className="w-full flex items-center gap-2.5 text-[12px] font-semibold px-3 h-11 rounded-lg text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
          <Palette size={15} /> Theme
        </button>
        <button role="menuitem" onClick={() => openDrawer('picker')} className="w-full flex items-center gap-2.5 text-[12px] font-semibold px-3 h-11 rounded-lg text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
          <LayoutTemplate size={15} /> Templates
        </button>
        <button role="menuitem" onClick={() => openDrawer('preview')} className="w-full flex items-center gap-2.5 text-[12px] font-semibold px-3 h-11 rounded-lg text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
          <Eye size={15} /> Preview page
        </button>
        <div className="h-px bg-white/[0.08] light:bg-slate-200 my-1" />
        <button role="menuitem" onClick={() => openDrawer('tokens')} className="w-full flex items-center gap-2.5 text-[12px] font-semibold px-3 h-11 rounded-lg text-kaspa-green hover:bg-kaspa-green/[0.08] light:hover:bg-teal-50 transition-colors">
          <Zap size={15} /> Live data tokens
        </button>
      </div>
    </>
  );
}

// Slide-over that groups all Studio explainers (templates, theme, page settings,
// publish surface, live tokens, enforcement reality). Opened by the single
// "How the Studio works" link so the canvas+toolbar stay the visual primary.
// Hoisted to module scope so it never remounts when the parent re-renders.
function StudioHelpDrawer({ onClose }) {
  // Page-level Escape handler in CovenantStudio owns dismissal; this drawer only
  // needs the focus trap so Tab stays inside the dialog while it is open.
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  const sections = [
    {
      title: 'Templates',
      body: <p>Templates are platform-authored starting points: they pre-fill the canvas with blocks for a hero, live pools, an activity feed, and a footer. Replace anything. Blocks are platform-authored, no raw HTML or JS. The EnforcementBadge always reads the server-derived reality, never an override from the template.</p>,
    },
    {
      title: 'Theme',
      body: <p>One click sets the accent color and page background. Your block content is preserved, no re-publishing needed. Both light and dark mode previews stay in parity.</p>,
    },
    {
      title: 'Page settings',
      body: <p>Stake amount, name, description. Saved with your page. The fund destination is always derived from the indexed covenant record, never from page settings, so a typo here cannot redirect funds.</p>,
    },
    {
      title: 'What can I publish?',
      body: <p>Blocks are platform-authored. No raw HTML or JS. Custom CSS is sandboxed to your page. The EnforcementBadge always reads the server-derived reality.</p>,
    },
    {
      title: 'How do live tokens work?',
      body: <p>Open the TokenCheatSheet and click any of the 18 tokens to copy it. Paste it into a text block or field. Tokens like <code>{'{{total_locked}}'}</code> and <code>{'{{pool_yes}}'}</code> are replaced at render time with current covenant state.</p>,
    },
    {
      title: 'How is enforcement displayed?',
      body: <p>EnforcementBadge shows the server's enforcement_reality for this covenant. You cannot override it on the page. The Kaspa script holds the funds at a P2SH commitment. Where the script alone can settle, payouts are consensus-enforced; otherwise an external resolver the deployer binds by pubkey at deploy co-signs the payout transaction (fail-closed if the resolver is unavailable). Covex never attests real-world facts. The fund destination is derived from the indexed covenant record, not from this field.</p>,
    },
  ];
  return (
    <>
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className="fixed inset-0 z-[120] bg-black/50"
      />
      <aside
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="How the Studio works"
        className="fixed right-0 top-0 bottom-0 z-[121] w-full sm:w-[420px] max-w-full overflow-y-auto bg-[#0A0A0D] light:bg-white border-l border-white/[0.12] light:border-slate-200 shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.08] light:border-slate-200 bg-[#0A0A0D] light:bg-white">
          <p className="text-[13px] font-bold text-white light:text-slate-900">How the Studio works</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center h-9 w-9 rounded-lg text-gray-300 light:text-slate-600 hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {sections.map((s) => (
            <section key={s.title}>
              <h3 className="text-[12px] font-bold text-kaspa-green mb-1">{s.title}</h3>
              <div className="text-[12px] leading-relaxed text-gray-300 light:text-slate-600">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}

// ── Sidebar block search: filters Puck's component list by label text. The list
// items render the label as text, so we hide non-matching draggables via a data
// attribute the user-supplied query drives. Hoisted so it never remounts.
// When paletteOpen is true, ToolsPalette docks above the search bar so the
// one-click "Add block" UI lives in the same column as the drag list. ──
function BlockSearch({ children, paletteOpen = false, onClosePalette, onAddBlock }) {
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
      {paletteOpen && (
        <div className="mb-2 rounded-xl border border-kaspa-green/30 bg-kaspa-green/[0.04] light:bg-kaspa-green/[0.06]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-kaspa-green/20">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-kaspa-green">
              <Wrench size={12} /> Add block
            </p>
            {onClosePalette && (
              <button
                type="button"
                aria-label="Close add-block panel"
                onClick={onClosePalette}
                className="flex items-center justify-center h-6 w-6 rounded-md text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="p-2 max-h-[42vh] overflow-y-auto">
            <ToolsPalette context="blocks" onAddBlock={onAddBlock} />
          </div>
        </div>
      )}
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
// Premium UI website templates (premium: true) are part of the paid library. A FREE
// creator still gets the full picker and can apply any base layout or start blank;
// premium cards wear a "Paid" lock badge and, when selected, the primary action
// becomes "Unlock in Pricing" (routes to /pricing via the parent's applyTemplate
// guard) instead of applying. This gates ONLY premium layouts, never the Studio,
// building from scratch, or the base set.
function TemplatePickerModal({ defaultId, isPaid = false, liveData, onPick, onBlank, onClose }) {
  // Never auto-select a locked premium layout for a free creator: if the suggested
  // default is premium and they cannot use it, fall back to the first free layout so
  // the primary CTA is immediately usable.
  const initialSel = useMemo(() => {
    const def = STARTER_TEMPLATES.find((t) => t.id === defaultId);
    if (def && (!def.premium || isPaid)) return defaultId;
    const firstFree = STARTER_TEMPLATES.find((t) => !t.premium);
    return firstFree ? firstFree.id : defaultId;
  }, [defaultId, isPaid]);
  const [sel, setSel] = useState(initialSel);
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  const selTpl = STARTER_TEMPLATES.find((t) => t.id === sel);
  const selLocked = !!(selTpl && selTpl.premium && !isPaid);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 light:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Start from a template" className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] light:border-slate-200">
          <div>
            <p className="text-sm font-black text-white light:text-slate-900">Start from a template</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">
              {isPaid
                ? 'Honest layouts, the full library unlocked. Tweak everything after.'
                : 'Base layouts are free. Premium layouts and building from scratch keep the canvas yours.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900"><X size={18} /></button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3 sm:gap-4">
          {STARTER_TEMPLATES.map((t) => {
            const active = sel === t.id;
            const locked = !!(t.premium && !isPaid);
            const blocks = pageBlockNames(t.data);
            return (
              <button key={t.id} onClick={() => setSel(t.id)}
                aria-label={locked ? `${t.name} (paid template)` : t.name}
                className={`relative text-left rounded-xl border overflow-hidden transition-all ${active ? 'border-kaspa-green bg-kaspa-green/[0.06]' : 'border-white/10 light:border-slate-200 hover:border-white/25 light:hover:border-slate-300'}`}>
                {/* Real, scaled read-only render of the starter layout so the user
                    sees it before applying. Pointer-events disabled inside. Locked
                    premium layouts are dimmed so the lock reads at a glance. */}
                <div className={locked ? 'opacity-55' : ''}>
                  <PuckPageThumb data={t.data} liveData={liveData} height={130} scale={0.135} className="border-b border-white/[0.06] light:border-slate-200" />
                </div>
                {/* Paid lock badge: only on premium layouts a free creator cannot apply. */}
                {locked && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40 light:bg-amber-100 light:text-amber-800 light:border-amber-300">
                    <Lock size={9} aria-hidden="true" /> Paid
                  </span>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-white light:text-slate-900">{t.name}</span>
                    {active && <Check size={15} className="text-kaspa-green shrink-0" />}
                    {!active && t.id === defaultId && (!t.premium || isPaid) && <span className="text-[9px] font-bold uppercase tracking-wider text-kaspa-green shrink-0">Suggested</span>}
                  </div>
                  <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">{t.desc}</p>
                  {/* T4 transparency: name every block this layout drops in. */}
                  {blocks.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {blocks.map((b) => (
                        <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 light:bg-slate-100 text-gray-400 light:text-slate-500 border border-white/[0.06] light:border-slate-200">{b}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.08] light:border-slate-200">
          <button onClick={onBlank} className="text-xs font-semibold text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900">Start blank</button>
          {selLocked ? (
            <button onClick={() => onPick(sel)} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:brightness-110 transition-all">
              <Lock size={14} aria-hidden="true" /> Unlock in Pricing
            </button>
          ) : (
            <button onClick={() => onPick(sel)} className="px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 transition-all">Use this template</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── "Preview page" overlay: the CLEAN public render, no editor chrome. ──
// Uses the SAME PuckRender + puckConfig + live metadata the public page uses, so
// it is exactly what a visitor sees, not a separate mock. Read-only by nature
// (PuckRender emits no drag handles), and pointer-events stay live so the user can
// scroll the page; only publishing is gated behind the Publish button. Also offers
// a direct link to the real /covenant/:id page in a new tab. Hoisted so it never
// remounts; wears the same focus trap as the other Studio dialogs.
function PagePreviewModal({ data, liveData, covenantId, onClose }) {
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  const hasContent = !!(data && data.content && data.content.length);
  const publicUrl = covenantId ? `/covenant/${encodeURIComponent(covenantId)}` : null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/75 light:bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Page preview" className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 light:border-slate-200 bg-[#0a0a0f] light:bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-white/[0.08] light:border-slate-200 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-black text-white light:text-slate-900 flex items-center gap-2"><Eye size={15} className="text-kaspa-green shrink-0" /> Preview page</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5 truncate">Exactly what visitors see. Nothing is published until you press Publish.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-9 rounded-lg border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
              >
                Open public page
              </a>
            )}
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white light:hover:text-slate-900"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {hasContent ? (
            <PuckRender config={puckConfig} data={data} metadata={{ live: liveData }} />
          ) : (
            <div className="px-5 py-16 text-center">
              <Sparkles size={20} className="text-kaspa-green mx-auto mb-2" />
              <p className="text-[13px] font-semibold text-white light:text-slate-900">Nothing to preview yet</p>
              <p className="text-[11px] text-gray-400 light:text-slate-500 mt-1 leading-relaxed">Pick a starter template or add a block, then preview.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── One-click page-theme picker from designPresets (accent + page background). ──
function ThemePickerModal({ onApply, onClose }) {
  // Use the dark-mood palettes only (one swatch per palette) for a clean grid.
  const presets = useMemo(() => getPresets().filter((p) => p.mood.id === 'dark'), []);
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 light:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Page theme" className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] light:border-slate-200">
          <div>
            <p className="text-sm font-black text-white light:text-slate-900">Page theme</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">Sets the accent color and page background in one click.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900"><X size={18} /></button>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {presets.map((p) => (
            <button key={p.id} onClick={() => onApply(p)} className="rounded-xl overflow-hidden border border-white/10 light:border-slate-200 hover:border-white/30 light:hover:border-slate-300 transition-all text-left">
              <div className="h-20" style={{ background: presetBackdrop(p) }} />
              <div className="px-3 py-2.5 flex items-center gap-2">
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

// ── Page settings drawer: stake amount + name / description override. These are the
// only unique controls the old Fix page had, absorbed into Studio so creators never
// need a second tool. Saves via the SAME terminal-config POST (no new endpoint). The
// stake is a default DISPLAY amount for the public page; it never sets a fund
// destination, which always derives from the indexed covenant record. Hoisted so it
// never remounts mid-typing. Full dark / light / mobile parity. ──
function PageSettingsModal({ covenant, saving, onSave, onClose }) {
  const [name, setName] = useState(covenant?.name || '');
  const [description, setDescription] = useState(covenant?.description || '');
  const [stake, setStake] = useState(() => {
    const s = covenant?.custom_ui_config?.theme?.default_stake;
    return Number.isFinite(Number(s)) && Number(s) > 0 ? Number(s) : 50;
  });
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 light:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Page settings" className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] light:border-slate-200">
          <div>
            <p className="text-sm font-black text-white light:text-slate-900">Page settings</p>
            <p className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">Stake amount, name and description. Saved with your page, one publish.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white light:hover:text-slate-900"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 light:text-slate-500 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={covenant?.name || 'Covenant name'}
              className="w-full rounded-xl bg-black/40 light:bg-slate-50 border border-white/10 light:border-slate-300 px-3.5 py-2.5 text-sm text-white light:text-slate-900 placeholder:text-gray-600 light:placeholder:text-slate-400 focus:outline-none focus:border-kaspa-green/50"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 light:text-slate-500 mb-1.5">Short description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={covenant?.description || 'What this covenant does'}
              className="w-full resize-none rounded-xl bg-black/40 light:bg-slate-50 border border-white/10 light:border-slate-300 px-3.5 py-2.5 text-sm text-white light:text-slate-900 placeholder:text-gray-600 light:placeholder:text-slate-400 focus:outline-none focus:border-kaspa-green/50"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 light:text-slate-500 mb-1.5">Default stake (KAS)</label>
            <div className="flex items-center gap-2 rounded-xl bg-black/40 light:bg-slate-50 border border-white/10 light:border-slate-300 px-3.5 py-2.5 focus-within:border-kaspa-green/50">
              <Coins size={16} className="text-kaspa-green shrink-0" />
              <input
                type="number"
                min={1}
                value={stake}
                onChange={(e) => {
                  // parseInt('') and parseInt('abc') both yield NaN, and Math.max(1, NaN) is
                  // NaN - which would make the input uncontrolled and save NaN. Guard to a
                  // finite >= 1 integer.
                  const n = parseInt(e.target.value, 10);
                  setStake(Number.isFinite(n) ? Math.max(1, n) : 1);
                }}
                className="w-full bg-transparent text-sm text-white light:text-slate-900 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-gray-500 light:text-slate-500 mt-1.5 leading-relaxed">
              This is the suggested stake shown on the public page. It never sets a fund destination, which is always derived from the indexed covenant record. Custody and payouts are consensus-enforced where the script supports it, or co-signed by an external resolver the deployer binds by pubkey at deploy, fail-closed.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-white/[0.08] light:border-slate-200">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors">Cancel</button>
          <button
            onClick={() => onSave({ name: name.trim(), description: description.trim(), stake })}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 disabled:opacity-60 transition-all flex items-center gap-2"
          >
            <Save size={15} /> {saving ? 'Saving...' : 'Save settings'}
          </button>
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
    <details className="cvx-cheatsheet fixed bottom-4 left-3 right-3 sm:left-4 sm:right-auto sm:w-72 z-[90] rounded-2xl border border-white/[0.1] light:border-slate-200 bg-[#0A0A0D]/95 light:bg-white/95 backdrop-blur shadow-2xl">
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

// ── Mobile token cheat sheet: same content as TokenCheatSheet, centered modal.
// Surfaced from the toolbar overflow menu on <md so the floating panel does not
// crowd the small canvas. ──
function TokenCheatSheetModal({ onClose }) {
  const [copied, setCopied] = useState('');
  const trapRef = useRef(null);
  useFocusTrap(trapRef, true);
  const copy = (tok) => {
    const text = `{{${tok}}}`;
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    } catch (_) { /* no-op */ }
    setCopied(tok);
    setTimeout(() => setCopied((c) => (c === tok ? '' : c)), 1200);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Live data tokens" className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl border border-white/[0.1] light:border-slate-200 bg-[#0A0A0D]/98 light:bg-white/98 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] light:border-slate-200">
          <p className="flex items-center gap-2 text-xs font-bold text-kaspa-green">
            <Zap size={13} /> Live data tokens
          </p>
          <button type="button" aria-label="Close" onClick={onClose} className="flex items-center justify-center h-9 w-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 light:hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
          <p className="text-[11px] text-gray-500 light:text-slate-500 mb-2 leading-relaxed">Tap a token to copy it, then paste it into any text field. It updates live from the chain.</p>
          <ul className="space-y-1">
            {LIVE_TOKENS.map((t) => (
              <li key={t.token}>
                <button
                  type="button"
                  onClick={() => copy(t.token)}
                  className="w-full flex items-center justify-between gap-2 text-[11px] px-2 py-2 rounded-lg hover:bg-kaspa-green/[0.08] light:hover:bg-teal-50 transition-colors text-left"
                >
                  <code className="text-kaspa-green font-mono shrink-0">{copied === t.token ? 'Copied!' : `{{${t.token}}}`}</code>
                  <span className="text-gray-500 light:text-slate-500 text-right min-w-0 truncate">{t.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Mobile interstitial. The Puck drag-and-drop canvas is unusable on phones
// (tiny drag targets, no hover, overlapping sidebar), so on <md we render a
// hero-style panel that explains this is a desktop tool, lets the creator mail
// themselves the studio link, and shows a read-only preview of the current
// design so the trip was not wasted. Hoisted so it never remounts. Full
// dark / light parity, no em dashes anywhere. ──
function MobileStudioInterstitial({ covenantId, data, liveData }) {
  const studioUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/covenant/${encodeURIComponent(covenantId)}/studio`;
  }, [covenantId]);
  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    try { if (navigator.clipboard) navigator.clipboard.writeText(studioUrl); } catch (_) { /* no-op */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [studioUrl]);
  const mailHref = useMemo(() => {
    const subject = encodeURIComponent('Open Covex Covenant Studio on desktop');
    const body = encodeURIComponent(`Open this on a desktop browser to design your covenant page:\n\n${studioUrl}\n\nThe studio uses drag and drop, which needs a larger screen.`);
    return `mailto:?subject=${subject}&body=${body}`;
  }, [studioUrl]);
  const hasContent = !!(data && data.content && data.content.length);
  return (
    <div className="px-3 py-4 sm:px-5 sm:py-6 space-y-4">
      {/* Hero shell: matches the studio's Card / panel idiom (dark + light parity). */}
      <div className="rounded-2xl border border-white/[0.08] light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-kaspa-green/15 light:bg-teal-50 text-kaspa-green">
              <Monitor size={18} />
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-kaspa-green">Desktop tool</span>
          </div>
          <p className="text-base font-black text-white light:text-slate-900 leading-tight">Studio is best on desktop</p>
          <p className="text-[12px] text-gray-400 light:text-slate-500 mt-1.5 leading-relaxed">
            The page builder uses drag and drop, which needs a larger screen. Open this link on a desktop browser to design and publish. Your visitors see the published page fine on any device.
          </p>
        </div>
        <div className="px-5 pb-4 space-y-2">
          <a
            href={mailHref}
            className="btn-shimmer w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 transition-all"
          >
            <Mail size={15} /> Email me the studio link
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-white/15 light:border-slate-300 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 text-xs font-semibold transition-colors"
          >
            {copied ? <Check size={15} className="text-kaspa-green" /> : <Copy size={15} />}
            {copied ? 'Link copied' : 'Copy link to clipboard'}
          </button>
        </div>
        <div className="px-5 py-3 border-t border-white/[0.06] light:border-slate-100 flex items-center gap-2">
          <Smartphone size={13} className="text-gray-500 light:text-slate-600 shrink-0" />
          <p className="text-[11px] text-gray-500 light:text-slate-500 leading-snug">
            Tip: page settings, theme and templates still work here from the toolbar overflow menu.
          </p>
        </div>
      </div>

      {/* Read-only preview of the saved design so the trip was not wasted. */}
      <div className="rounded-2xl border border-white/[0.08] light:border-slate-200 bg-[#0A0A0D] light:bg-slate-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] light:border-slate-200">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-300 light:text-slate-600">
            <Eye size={13} className="text-kaspa-green" /> Live preview
          </span>
          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 light:text-slate-500">Read only</span>
        </div>
        <div className="cvx-mobile-preview overflow-x-hidden">
          {hasContent ? (
            <PuckRender config={puckConfig} data={data} metadata={{ live: liveData }} />
          ) : (
            <div className="px-5 py-10 text-center">
              <Sparkles size={20} className="text-kaspa-green mx-auto mb-2" />
              <p className="text-[12px] font-semibold text-white light:text-slate-900">No design saved yet</p>
              <p className="text-[11px] text-gray-400 light:text-slate-500 mt-1 leading-relaxed">Open the studio on desktop to pick a starter template and publish your first page.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
