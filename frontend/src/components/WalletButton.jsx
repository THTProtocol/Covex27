import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { explorerAddressUrl } from '../lib/explorer';
import { truncateHash } from '../lib/format.js';
import { Link } from 'react-router-dom';
import { useWallet, NETWORK_LABELS, getCurrentNetwork, onNetworkChange, walletPrimaryAction, isMobile } from './WalletContext';
import { X, Wallet, AlertTriangle, Copy, Check, LayoutDashboard, Palette, Landmark, ExternalLink, LogOut, RefreshCw, ArrowRight, Sparkles, Smartphone, Download, Loader2, QrCode, KeyRound, ShieldCheck } from '../lib/icons.js';
import { toast } from './ToastContext';

// Dot color must match the Stats.jsx EVENT_META / NETWORKS palette so the network
// signal reads as the same color family across the app. Mainnet shares Covex teal
// with `covenant_discovered`; TN12 shares the violet with `resolution_signed`.
const NETWORK_DOT = {
  'mainnet': '#49EACB',
  'mainnet-1': '#49EACB',
  'testnet-10': '#F59E0B',
  'testnet-12': '#A78BFA',
};
const networkDotColor = (net) => NETWORK_DOT[net] || '#9CA3AF';

// Wallet icon tile with graceful fallback to a letter avatar if the CDN logo fails.
function WalletLogo({ wallet }) {
  return (
    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-[#0a0a0a] light:bg-white border border-[#1f1f1f] light:border-slate-200">
      {wallet.logo ? (
        <img
          src={wallet.logo}
          alt={wallet.name}
          className="w-9 h-9 object-contain rounded-md"
          onError={(e) => {
            e.target.style.display = 'none';
            const fb = e.target.nextElementSibling;
            if (fb) fb.style.display = 'flex';
          }}
        />
      ) : null}
      <span className={`w-9 h-9 rounded-md items-center justify-center text-xs font-bold text-white/60 bg-white/5 ${wallet.logo ? 'hidden' : 'flex'}`}>
        {wallet.name?.charAt(0) || '?'}
      </span>
    </div>
  );
}

// ── Honest "Connecting on mobile" panel ──────────────────────────────────────
// Shown ONLY when we are on a phone AND no wallet provider is injected (i.e. a normal
// Safari/Chrome tab, where a Kaspa wallet extension cannot run). It does not fake a
// connection; it explains the real options:
//   1. Open Covex inside a wallet app's built-in dApp browser (per-wallet "Open in" deep
//      links + a scannable QR of this page so you can paste/scan it in that browser).
//   2. Use a key-based flow that needs NO extension and works in ANY mobile browser
//      (the Recover page + the standalone offline cold-recovery tool).
// `openWallets` are the device wallets that carry a real deep link (Kasanova / KSPR today).
// Hoisted to module scope so it never remounts on parent re-render.
function MobileConnectHelp({ openWallets, onOpen, pendingId, pageUrl }) {
  return (
    <div className="mt-5 rounded-xl border border-[#49EACB]/20 bg-[#49EACB]/[0.04] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Smartphone size={14} className="text-[#49EACB] shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-[#49EACB]/90">Connecting on mobile</span>
      </div>
      <p className="text-[12px] text-gray-300 light:text-slate-600 leading-relaxed">
        Kaspa has no WalletConnect and no mobile browser extension. On a phone, signing a covenant
        works inside a wallet's in-app browser (KasWare / OKX): open Covex there with one of the
        buttons below, then sign in the wallet popup. Or use a key-based flow that needs no extension.
      </p>

      {/* Per-wallet "Open in <app>" deep links (only wallets that actually expose one). */}
      {openWallets.length > 0 && (
        <div className="mt-3 space-y-2">
          {openWallets.map((w) => (
            <button
              key={w.id}
              onClick={() => onOpen(w)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-[#1f1f1f] light:border-slate-200 bg-[#111111] light:bg-white hover:border-[#49EACB] transition-all group text-left"
            >
              <WalletLogo wallet={w} />
              <div className="flex-1 min-w-0">
                <div className="text-white light:text-slate-900 font-medium text-[13px] truncate">Open in {w.name.replace(/ Wallet$/, '')}</div>
                <div className="text-[11px] text-gray-500 truncate">Launches the app's in-app browser</div>
              </div>
              {pendingId === w.id
                ? <Loader2 size={15} className="animate-spin text-[#49EACB] shrink-0" />
                : <ExternalLink size={14} className="text-[#49EACB] shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Scannable QR of this exact page: scan it from the wallet app's in-app browser to
          land back on Covex inside that browser, where the injected provider is detected. */}
      <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-black/30 light:bg-slate-50 border border-white/[0.06] light:border-slate-200">
        <div className="rounded-lg bg-white p-1.5 shrink-0 ring-1 ring-black/5">
          <QRCodeSVG value={pageUrl} size={64} level="M" bgColor="#ffffff" fgColor="#000000" aria-label="QR code of this page to open in your wallet's in-app browser" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-white light:text-slate-900 flex items-center gap-1.5"><QrCode size={12} className="text-[#49EACB] shrink-0" /> Scan in your wallet app</div>
          <p className="text-[11px] text-gray-400 light:text-slate-500 leading-snug mt-0.5">Open your wallet's in-app browser and scan to load Covex inside it.</p>
        </div>
      </div>

      {/* Key-based options that work in ANY mobile browser, no extension needed. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to="/recover"
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-white text-[12px] font-semibold text-gray-300 light:text-slate-600 hover:border-[#49EACB]/40 hover:text-[#49EACB] transition-colors"
        >
          <KeyRound size={13} className="shrink-0" /> Recover / claim
        </Link>
        <a
          href="/tools/cold-recovery/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-white text-[12px] font-semibold text-gray-300 light:text-slate-600 hover:border-[#49EACB]/40 hover:text-[#49EACB] transition-colors"
        >
          <ShieldCheck size={13} className="shrink-0" /> Cold tool
        </a>
      </div>
      <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
        Key-based flows derive and sign locally in your browser - your private key is never
        transmitted. They work for claiming covenant funds without any wallet extension.
      </p>
    </div>
  );
}

export default function WalletButton({ fullLabel = false } = {}) {
  const { address, balance, balanceLoading, activeWalletId, walletMeta, connecting, error, clearError, wallets, connect, disconnect, refreshBalance } = useWallet();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [panel, setPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllWallets, setShowAllWallets] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [, bumpDetect] = useState(0); // forces re-detect re-render for late-injecting extensions
  const [network, setNetwork] = useState(getCurrentNetwork());
  const panelRef = useRef(null);
  // Track the trigger that opened the account panel / drawer so we can restore focus on close
  // (a11y: a closing dialog should never drop focus to <body>). The connect button is a stable
  // node so we keep one ref for it; the address pill uses the same pattern.
  const connectBtnRef = useRef(null);
  const accountBtnRef = useRef(null);
  const netLabel = NETWORK_LABELS[network] || 'MAINNET';
  const netDot = networkDotColor(network);

  // Live network signal: the nav switcher emits 'kaspa-network-change' on toggle. Without this
  // subscription the badge would freeze at whatever network was active on mount.
  useEffect(() => onNetworkChange((n) => setNetwork(n)), []);

  // Cross-component open signal: DevWalletModal (and others) dispatch
  // 'covex:open-wallet-drawer' to ask the connect drawer to open. WalletButton
  // owns the drawer state, so it listens here and opens it.
  useEffect(() => {
    const openDrawer = () => { setLeaving(false); setOpen(true); };
    window.addEventListener('covex:open-wallet-drawer', openDrawer);
    return () => window.removeEventListener('covex:open-wallet-drawer', openDrawer);
  }, []);

  // Drawer dismiss: play the slide-out, then unmount on animationend. prefers-reduced-motion
  // skips the keyframes (covex-drawer-out becomes a no-op) so we still need the safety timeout.
  const closeDrawer = () => {
    if (leaving) return;
    setLeaving(true);
  };
  useEffect(() => {
    if (!leaving) return undefined;
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
      setOpen(false);
      setLeaving(false);
      return undefined;
    }
    // Belt-and-suspenders timeout in case animationend is missed (tab backgrounded, etc).
    const t = setTimeout(() => { setOpen(false); setLeaving(false); }, 260);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const onDoc = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setPanel(false); };
    if (panel) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [panel]);

  // Escape closes the account panel and restores focus to the address-pill trigger so
  // keyboard users do not get dumped at <body>. The drawer's Escape handler lives in
  // the disconnected branch because the trigger ref differs.
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPanel(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel]);
  // Restore focus to the trigger when the panel transitions from open to closed (not on mount).
  const panelWasOpen = useRef(false);
  useEffect(() => {
    if (panel) { panelWasOpen.current = true; return; }
    if (panelWasOpen.current && accountBtnRef.current) accountBtnRef.current.focus();
    panelWasOpen.current = false;
  }, [panel]);

  // Close the connect drawer the moment a wallet actually connects (covers the deep-link return
  // case: the in-app browser injects a provider, auto-connect fires, address appears).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
  useEffect(() => { if (address && open && !leaving) closeDrawer(); }, [address, open, leaving]);

  // Drawer: Escape closes it (matches the X button). Connect drawer is a modal so this is
  // expected keyboard behavior. The close-animation flow handles unmount + focus restore.
  useEffect(() => {
    if (!open || leaving) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, leaving]);
  // Drawer: restore focus to the connect button after it fully closes.
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    if (open) { drawerWasOpen.current = true; return; }
    if (drawerWasOpen.current && connectBtnRef.current) connectBtnRef.current.focus();
    drawerWasOpen.current = false;
  }, [open]);

  // Some wallet extensions inject their provider a beat after page load. While the drawer is
  // open, re-check detection a few times so a freshly-installed wallet surfaces as "Installed"
  // (and jumps to the one-click section) without the user having to reopen the drawer.
  useEffect(() => {
    if (!open) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    setShowAllWallets(false);
    let n = 0;
    const id = setInterval(() => { bumpDetect((t) => t + 1); if (++n >= 16) clearInterval(id); }, 400);
    return () => clearInterval(id);
  }, [open]);

  // Single source of truth: hand EVERY tap to the unified connect(). It decides one-click
  // connect (provider present) vs mobile open-app deep-link vs install, and never bounces
  // straight to download. We only close the drawer on a real connection (address set).
  const handleWalletClick = async (wallet) => {
    clearError();
    const action = walletPrimaryAction(wallet);
    setPendingId(wallet.id);
    try {
      await connect(wallet.id);
      // Close only if we actually connected (provider path). Deep-link / install paths keep the
      // drawer open so the surfaced message is visible and the user can retry after returning.
      if (action.kind === 'connect') closeDrawer();
    } catch {
      // connect surfaces the reason via the context `error` state shown in the drawer; keep the
      // drawer open on failure so the user sees what went wrong instead of a silent dead-end.
    } finally {
      setPendingId(null);
    }
  };

  const copyAddr = () => {
    const p = navigator.clipboard?.writeText(address);
    if (!p || !p.then) {
      toast.error('Copy failed, select and copy manually');
      return;
    }
    p.then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      toast.error('Copy failed, select and copy manually');
    });
  };

  const meta = wallets?.find((w) => w.id === activeWalletId) || walletMeta;

  // ── Connected: address pill opens the account panel ──
  if (address) {
    return (
      <div className="relative" ref={panelRef}>
        <button
          ref={accountBtnRef}
          onClick={() => setPanel((p) => !p)}
          aria-haspopup="dialog"
          aria-expanded={panel}
          className="btn-transition flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#111111] light:bg-white border border-[#49EACB]/30 hover:border-[#49EACB]/70 text-[#49EACB] rounded-xl font-medium text-sm hover:shadow-[0_0_18px_rgba(73,234,203,0.2)] whitespace-nowrap"
          title="Account"
        >
          {meta?.logo
            ? <img src={meta.logo} alt="" className="w-4 h-4 rounded-sm shrink-0" />
            : <span className="w-1.5 h-1.5 rounded-full bg-[#49EACB] shadow-[0_0_6px_#49EACB] shrink-0" />}
          <span className="font-mono shrink-0">{truncateHash(address, 6, 4)}</span>
          {balance !== null ? (
            <span className="hidden sm:inline text-gray-300 light:text-slate-600 text-xs tabular-nums shrink-0">{(balance / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })} KAS</span>
          ) : balanceLoading ? (
            <span className="hidden sm:inline text-gray-500 text-xs animate-pulse shrink-0">···</span>
          ) : null}
        </button>

        {panel && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Account"
            className="absolute right-0 top-[calc(100%+8px)] w-[calc(100vw-1.5rem)] sm:w-80 max-w-[20rem] z-[90] rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="p-4 border-b border-white/[0.06] light:border-slate-100 flex items-center gap-3">
              {meta?.logo
                ? <img src={meta.logo} alt={meta?.name || 'wallet'} className="w-9 h-9 rounded-lg" />
                : <span className="w-9 h-9 rounded-lg bg-[#49EACB]/10 flex items-center justify-center"><Wallet size={16} className="text-[#49EACB]" /></span>}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white light:text-slate-900 truncate">{meta?.name || 'Wallet'}</p>
                <p className="text-[10px] font-mono text-gray-500 truncate flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: netDot, boxShadow: `0 0 6px ${netDot}` }}
                  />
                  {netLabel}
                </p>
              </div>
              <button onClick={() => { refreshBalance && refreshBalance(); }} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-[#49EACB] hover:bg-white/5" title="Refresh balance">
                <RefreshCw size={13} />
              </button>
            </div>

            <div className="p-4 border-b border-white/[0.06] light:border-slate-100">
              <p className="kicker mb-1.5">Balance</p>
              <p className="text-2xl font-black text-white light:text-slate-900 tabular-nums">
                {balance !== null ? (balance / 1e8).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '...'}
                <span className="text-sm font-bold text-[#49EACB] ml-1.5">KAS</span>
              </p>
              <button onClick={copyAddr} className="mt-2 w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] light:bg-slate-50 border border-white/[0.06] light:border-slate-200 text-[10px] font-mono text-gray-400 hover:border-[#49EACB]/40 transition-colors">
                <span className="truncate">{address}</span>
                {copied ? <Check size={12} className="text-[#49EACB] shrink-0" /> : <Copy size={12} className="shrink-0" />}
              </button>
            </div>

            <div className="p-2">
              {/* Navigate: internal portfolio/builder/treasury links + the external explorer
                  link grouped under one kicker so the panel reads as Header / Balance / Navigate
                  / Disconnect rather than four undifferentiated rows. */}
              <p className="kicker px-3 pt-1 pb-1.5">Navigate</p>
              {[
                { to: `/address/${encodeURIComponent(address)}`, icon: LayoutDashboard, label: 'My portfolio' },
                { to: `/address/${encodeURIComponent(address)}`, icon: Palette, label: 'My covenants and looks' },
                { to: '/treasury', icon: Landmark, label: 'Treasury transparency' },
              ].map((i) => (
                <Link key={i.label} to={i.to} onClick={() => setPanel(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-300 light:text-slate-700 hover:bg-[#49EACB]/[0.07] hover:text-white light:hover:text-slate-900 transition-colors">
                  <i.icon size={15} className="text-[#49EACB]" /> {i.label}
                </Link>
              ))}
              <a href={explorerAddressUrl(address)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-300 light:text-slate-700 hover:bg-[#49EACB]/[0.07] hover:text-white transition-colors">
                <ExternalLink size={15} className="text-[#49EACB]" /> View on Kaspa Explorer
              </a>
              <div className="h-px bg-white/[0.06] light:bg-slate-100 my-1.5 mx-3" />
              <button onClick={() => { disconnect(); setPanel(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-300 light:text-red-600 hover:bg-red-500/10 transition-colors">
                <LogOut size={15} /> Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Disconnected: connect button + wallet drawer ──
  // Surface installed wallets first (one-click connect); everything else is an install link,
  // recommended wallets ahead of the rest, collapsed behind "Show more" so the drawer stays calm.
  const isDet = (w) => (w.detect ? w.detect() : false);
  const detected = wallets.filter(isDet);
  const others = wallets.filter((w) => !isDet(w)).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  const collapsedCount = detected.length ? 3 : 5;
  const shownOthers = showAllWallets ? others : others.slice(0, collapsedCount);
  const topPick = others.find((w) => w.recommended) || others[0];

  // ── Mobile-only honest helper ──
  // On a phone with NO injected provider (a normal Safari/Chrome tab), surface the honest
  // mobile-connect panel: open Covex inside a wallet app's in-app browser, or use a
  // key-based flow. `mobile` is the UA test; `detected.length` tells us a provider IS
  // injected (we are already inside a wallet's in-app browser), in which case the one-click
  // "Ready to connect" row already covers it and the helper is unnecessary.
  const mobile = isMobile();
  const showMobileHelp = mobile && detected.length === 0;
  // Wallets that expose a real "open the app" deep link (Kasanova / KSPR today). Built from
  // the device wallet list so it stays honest: only wallets with a deepLink appear.
  const openWallets = wallets.filter((w) => w.deepLink);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://hightable.pro';

  // Render the drawer through a portal to <body>. The nav that hosts this button has a
  // backdrop-filter (.glass-panel), which establishes a containing block for fixed-position
  // descendants - without the portal the "fixed inset-0" drawer was trapped inside the 58px
  // navbar instead of covering the viewport on mobile.
  const drawer = open ? (
        <div className={`fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm ${leaving ? 'covex-scrim-out' : 'covex-scrim-in'}`} onClick={closeDrawer}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect Wallet"
            className={`absolute top-0 right-0 h-[100dvh] max-h-[100dvh] w-full sm:w-[420px] bg-[#0a0a0a] light:bg-white border-l border-[#1f1f1f] light:border-slate-200 shadow-2xl flex flex-col ${leaving ? 'covex-drawer-out' : 'covex-drawer-in'}`}
            onClick={(e) => e.stopPropagation()}
            onAnimationEnd={(e) => {
              if (leaving && (e.animationName === 'covex-drawer-out' || e.animationName === 'covex-scrim-out')) {
                setOpen(false);
                setLeaving(false);
              }
            }}
          >
            <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-[#1f1f1f] light:border-slate-200 shrink-0">
              <h2 className="text-lg sm:text-xl font-semibold text-white light:text-slate-900">Connect Wallet</h2>
              <button onClick={closeDrawer} className="p-1.5 -mr-1.5 rounded-lg text-gray-200 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-white/5 transition-colors" aria-label="Close">
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <p className="text-sm text-gray-300 light:text-slate-600 mb-4">Select a Kaspa wallet to connect to Covex ({netLabel})</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-300 light:text-red-700">{error}</p>
                    <button onClick={clearError} className="text-xs text-red-400 hover:text-red-300 mt-1 underline">Dismiss</button>
                  </div>
                </div>
              )}

              {connecting && (
                <div className="mb-4 p-3 rounded-lg bg-[#49EACB]/[0.06] border border-[#49EACB]/20 text-center">
                  <p className="text-sm text-[#49EACB] flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span>Approve the connection in your wallet popup</span>
                  </p>
                </div>
              )}

              {/* Installed wallets: one-click connect, surfaced first and visually prominent */}
              {detected.length > 0 && (
                <div className="mb-5">
                  <div className="text-[10px] uppercase tracking-widest text-[#49EACB]/80 font-bold flex items-center gap-1.5 mb-2">
                    <Check size={11} /> Ready to connect
                  </div>
                  <div className="space-y-2">
                    {detected.map((wallet) => {
                      const isPending = pendingId === wallet.id;
                      return (
                        <button
                          key={wallet.id}
                          onClick={() => handleWalletClick(wallet)}
                          disabled={connecting}
                          aria-busy={isPending}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#49EACB]/40 bg-[#49EACB]/[0.06] hover:bg-[#49EACB]/[0.12] hover:border-[#49EACB]/70 transition-all group disabled:opacity-50 text-left shadow-[0_0_20px_-8px_rgba(73,234,203,0.5)]"
                        >
                          <WalletLogo wallet={wallet} />
                          <div className="flex-1 min-w-0">
                            <div className="text-white light:text-slate-900 font-semibold text-sm flex items-center gap-2 flex-wrap">
                              <span className="truncate">{wallet.name}</span>
                              <span className="text-[9px] uppercase tracking-wider bg-[#49EACB]/15 text-[#49EACB] light:text-[#0d9488] px-1.5 py-0.5 rounded-sm shrink-0 inline-flex items-center gap-1"><Check size={9} /> Installed</span>
                              {wallet.canSignCovenants && (
                                <span title="Can sign covenant deploy and redeem in the wallet popup (the primary money path). A recovery key tool is the backup." className="text-[9px] uppercase tracking-wider bg-emerald-500/15 text-emerald-300 light:text-emerald-700 border border-emerald-500/30 px-1.5 py-0.5 rounded-sm shrink-0 inline-flex items-center gap-1"><ShieldCheck size={9} /> Signs covenants</span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate">{wallet.sub}</div>
                          </div>
                          {isPending
                            ? <Loader2 size={16} className="animate-spin text-[#49EACB] shrink-0" />
                            : <ArrowRight size={16} className="text-[#49EACB] group-hover:translate-x-0.5 transition-transform shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Other wallets: install links, recommended first, collapsed for calm */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
                  {detected.length ? 'Other wallets' : 'Choose a wallet'}
                </div>
                <div className="space-y-2">
                  {shownOthers.map((wallet) => {
                    const action = walletPrimaryAction(wallet);
                    const isOpen = action.kind === 'open';
                    const isPending = pendingId === wallet.id;
                    return (
                      <button
                        key={wallet.id}
                        onClick={() => handleWalletClick(wallet)}
                        disabled={connecting}
                        aria-busy={isPending}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#1f1f1f] light:border-slate-200 bg-[#111111] light:bg-slate-50 hover:border-[#49EACB] hover:bg-[#1a1a1a] light:hover:bg-white transition-all group disabled:opacity-50 text-left"
                      >
                        <WalletLogo wallet={wallet} />
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-white light:text-slate-900 font-medium text-sm flex items-center gap-2 flex-wrap">
                            <span className="truncate">{wallet.name}</span>
                            {wallet.recommended && (
                              <span className="text-[9px] uppercase tracking-wider bg-[#E8AF34]/10 text-[#E8AF34] px-1.5 py-0.5 rounded-sm shrink-0">Recommended</span>
                            )}
                            {wallet.canSignCovenants && (
                              <span title="Can sign covenant deploy and redeem in the wallet popup (the primary money path). A recovery key tool is the backup." className="text-[9px] uppercase tracking-wider bg-emerald-500/10 text-emerald-300 light:text-emerald-700 border border-emerald-500/25 px-1.5 py-0.5 rounded-sm shrink-0 inline-flex items-center gap-1"><ShieldCheck size={9} /> Signs covenants</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">{isOpen ? action.label : wallet.sub}</div>
                        </div>
                        {isPending
                          ? <Loader2 size={16} className="animate-spin text-[#49EACB] shrink-0" />
                          : isOpen
                            ? <Smartphone size={14} className="text-[#49EACB] shrink-0" />
                            : <Download size={13} className="text-gray-600 group-hover:text-gray-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {others.length > collapsedCount && (
                  <button
                    onClick={() => setShowAllWallets((s) => !s)}
                    className="mt-2 w-full text-center text-[11px] font-semibold text-[#49EACB] hover:text-[#49EACB]/80 py-1.5 transition-colors"
                  >
                    {showAllWallets ? 'Show fewer' : `Show ${others.length - collapsedCount} more wallets`}
                  </button>
                )}
              </div>

              {detected.length === 0 && topPick && (
                <button
                  onClick={() => handleWalletClick(topPick)}
                  className="mt-5 w-full flex items-center gap-2.5 p-3 rounded-xl border border-[#49EACB]/20 bg-[#49EACB]/[0.04] hover:bg-[#49EACB]/[0.08] hover:border-[#49EACB]/40 transition-all text-left group"
                >
                  <span className="w-8 h-8 rounded-lg bg-[#49EACB]/10 flex items-center justify-center shrink-0">
                    <Sparkles size={15} className="text-[#49EACB]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white light:text-slate-900">New to Kaspa?</div>
                    <div className="text-[11px] text-gray-500 break-words">{walletPrimaryAction(topPick).kind === 'open' ? `Open ${topPick.name} to get started.` : `Install ${topPick.name} to create a wallet in a minute.`}</div>
                  </div>
                  <ArrowRight size={15} className="text-[#49EACB] group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              )}

              <p className="mt-6 text-[11px] text-gray-500 leading-relaxed">
                Installed wallets connect in one click. On a phone, an installed wallet opens its app; if it is not installed you go to its app page. Covex is non-custodial: keys never leave your wallet, every transaction is signed by you.
              </p>

              {showMobileHelp && (
                <MobileConnectHelp
                  openWallets={openWallets}
                  onOpen={handleWalletClick}
                  pendingId={pendingId}
                  pageUrl={pageUrl}
                />
              )}
            </div>

            {/* Tightened footer copy: drop the redundant "Keys stay in your wallet" tail; the
                drawer body already explains keys never leave the wallet. Footer stays as a
                quiet network + posture signal, not a recap. */}
            <div className="p-3 border-t border-[#1f1f1f] light:border-slate-200 text-center text-[10px] font-mono text-gray-500 shrink-0 flex items-center justify-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: netDot, boxShadow: `0 0 6px ${netDot}` }}
              />
              {netLabel} · Non-custodial
            </div>
          </div>
        </div>
  ) : null;

  return (
    <>
      <button
        ref={connectBtnRef}
        onClick={() => { clearError(); setLeaving(false); setOpen(true); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Connect wallet"
        className="btn-transition flex items-center justify-center gap-2 px-2.5 sm:px-5 py-2.5 bg-[#111111] light:bg-white border border-[#1f1f1f] light:border-slate-300 hover:border-[#49EACB] text-white light:text-slate-900 rounded-xl font-medium hover:shadow-[0_0_15px_rgba(73,234,203,0.15)] text-sm whitespace-nowrap"
      >
        <Wallet size={16} className="text-[#49EACB] shrink-0" />
        {/* Icon-only below sm so the cramped 320px top nav still fits the hamburger;
            the full "CONNECT WALLET" label returns at sm+. aria-label keeps it named.
            fullLabel callers (e.g. the full-width action-rail button) always show text. */}
        <span className={fullLabel ? 'inline' : 'hidden sm:inline'}>CONNECT&nbsp;WALLET</span>
      </button>
      {typeof document !== 'undefined' && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
