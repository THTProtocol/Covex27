import { useState, useEffect, useRef } from 'react';
import { explorerAddressUrl } from '../lib/explorer';
import { Link } from 'react-router-dom';
import { useWallet, NETWORK_LABELS, getCurrentNetwork } from './WalletContext';
import { X, Wallet, AlertTriangle, Copy, Check, LayoutDashboard, Palette, Landmark, ExternalLink, LogOut, RefreshCw, ArrowRight, Sparkles } from 'lucide-react';

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

export default function WalletButton() {
  const { address, balance, balanceLoading, activeWalletId, walletMeta, connecting, error, clearError, wallets, connect, disconnect, refreshBalance } = useWallet();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllWallets, setShowAllWallets] = useState(false);
  const [, bumpDetect] = useState(0); // forces re-detect re-render for late-injecting extensions
  const panelRef = useRef(null);
  const netLabel = NETWORK_LABELS[getCurrentNetwork()] || 'TN12 (Toccata)';

  useEffect(() => {
    const onDoc = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setPanel(false); };
    if (panel) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [panel]);

  // Some wallet extensions inject their provider a beat after page load. While the drawer is
  // open, re-check detection a few times so a freshly-installed wallet surfaces as "Installed"
  // (and jumps to the one-click section) without the user having to reopen the drawer.
  useEffect(() => {
    if (!open) return undefined;
    setShowAllWallets(false);
    let n = 0;
    const id = setInterval(() => { bumpDetect((t) => t + 1); if (++n >= 16) clearInterval(id); }, 400);
    return () => clearInterval(id);
  }, [open]);

  const handleWalletClick = async (wallet) => {
    const detected = wallet.detect ? wallet.detect() : false;
    if (!detected) { window.open(wallet.url, '_blank'); return; }
    clearError();
    try {
      await connect(wallet.id);
      setOpen(false); // only close on success
    } catch (_) {
      // connect surfaces the reason via the context `error` state shown in the drawer; keep the
      // drawer open on failure so the user sees what went wrong instead of a silent dead-end.
    }
  };

  const copyAddr = () => {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const meta = wallets?.find((w) => w.id === activeWalletId) || walletMeta;

  // ── Connected: address pill opens the account panel ──
  if (address) {
    return (
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setPanel((p) => !p)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#111111] light:bg-white border border-[#49EACB]/30 hover:border-[#49EACB]/70 text-[#49EACB] rounded-xl font-medium transition-all text-sm hover:shadow-[0_0_18px_rgba(73,234,203,0.2)] whitespace-nowrap"
          title="Account"
        >
          {meta?.logo
            ? <img src={meta.logo} alt="" className="w-4 h-4 rounded-sm shrink-0" />
            : <span className="w-1.5 h-1.5 rounded-full bg-[#49EACB] shadow-[0_0_6px_#49EACB] shrink-0" />}
          <span className="font-mono shrink-0">{address.slice(0, 6)}...{address.slice(-4)}</span>
          {balance !== null ? (
            <span className="hidden sm:inline text-gray-300 light:text-slate-600 text-xs tabular-nums shrink-0">{(balance / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })} KAS</span>
          ) : balanceLoading ? (
            <span className="hidden sm:inline text-gray-500 text-xs animate-pulse shrink-0">···</span>
          ) : null}
        </button>

        {panel && (
          <div className="absolute right-0 top-[calc(100%+8px)] w-[calc(100vw-1.5rem)] sm:w-80 max-w-[20rem] z-[90] rounded-2xl border border-white/10 light:border-slate-200 bg-[#0c0c12] light:bg-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="p-4 border-b border-white/[0.06] light:border-slate-100 flex items-center gap-3">
              {meta?.logo
                ? <img src={meta.logo} alt={meta?.name || 'wallet'} className="w-9 h-9 rounded-lg" />
                : <span className="w-9 h-9 rounded-lg bg-[#49EACB]/10 flex items-center justify-center"><Wallet size={16} className="text-[#49EACB]" /></span>}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white light:text-slate-900 truncate">{meta?.name || 'Wallet'}</p>
                <p className="text-[10px] font-mono text-gray-500 truncate">{netLabel}</p>
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
              {[
                { to: `/address/${encodeURIComponent(address)}`, icon: LayoutDashboard, label: 'My portfolio' },
                { to: '/fix', icon: Palette, label: 'My covenants and looks' },
                { to: '/treasury', icon: Landmark, label: 'Treasury transparency' },
              ].map((i) => (
                <Link key={i.to} to={i.to} onClick={() => setPanel(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-300 light:text-slate-700 hover:bg-[#49EACB]/[0.07] hover:text-white light:hover:text-slate-900 transition-colors">
                  <i.icon size={15} className="text-[#49EACB]" /> {i.label}
                </Link>
              ))}
              <a href={explorerAddressUrl(address)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-300 light:text-slate-700 hover:bg-[#49EACB]/[0.07] hover:text-white transition-colors">
                <ExternalLink size={15} className="text-[#49EACB]" /> View on Kaspa Explorer
              </a>
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

  return (
    <>
      <button
        onClick={() => { clearError(); setOpen(true); }}
        className="flex items-center gap-2 px-3.5 sm:px-5 py-2.5 bg-[#111111] light:bg-white border border-[#1f1f1f] light:border-slate-300 hover:border-[#49EACB] text-white light:text-slate-900 rounded-xl font-medium transition-all hover:shadow-[0_0_15px_rgba(73,234,203,0.15)] text-sm whitespace-nowrap"
      >
        <Wallet size={16} className="text-[#49EACB] shrink-0" />
        CONNECT<span className="hidden sm:inline">&nbsp;WALLET</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="absolute top-0 right-0 h-[100dvh] max-h-[100dvh] w-full sm:w-[420px] bg-[#0a0a0a] light:bg-white border-l border-[#1f1f1f] light:border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right-5 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-[#1f1f1f] light:border-slate-200 shrink-0">
              <h2 className="text-lg sm:text-xl font-semibold text-white light:text-slate-900">Connect Wallet</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 -mr-1.5 rounded-lg text-gray-200 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-white/5 transition-colors" aria-label="Close">
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
                  <p className="text-sm text-[#49EACB] animate-pulse">Connecting to wallet...</p>
                </div>
              )}

              {/* Installed wallets — one-click connect, surfaced first and visually prominent */}
              {detected.length > 0 && (
                <div className="mb-5">
                  <div className="text-[10px] uppercase tracking-widest text-[#49EACB]/80 font-bold flex items-center gap-1.5 mb-2">
                    <Check size={11} /> Ready to connect
                  </div>
                  <div className="space-y-2">
                    {detected.map((wallet) => (
                      <button
                        key={wallet.id}
                        onClick={() => handleWalletClick(wallet)}
                        disabled={connecting}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#49EACB]/40 bg-[#49EACB]/[0.06] hover:bg-[#49EACB]/[0.12] hover:border-[#49EACB]/70 transition-all group disabled:opacity-50 text-left shadow-[0_0_20px_-8px_rgba(73,234,203,0.5)]"
                      >
                        <WalletLogo wallet={wallet} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white light:text-slate-900 font-semibold text-sm flex items-center gap-2">
                            <span className="truncate">{wallet.name}</span>
                            <span className="text-[9px] uppercase tracking-wider bg-[#49EACB]/15 text-[#49EACB] light:text-[#0d9488] px-1.5 py-0.5 rounded-sm shrink-0 inline-flex items-center gap-1"><Check size={9} /> Installed</span>
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">{wallet.sub}</div>
                        </div>
                        <ArrowRight size={16} className="text-[#49EACB] group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Other wallets — install links, recommended first, collapsed for calm */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
                  {detected.length ? 'Other wallets' : 'Choose a wallet'}
                </div>
                <div className="space-y-2">
                  {shownOthers.map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => handleWalletClick(wallet)}
                      disabled={connecting}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#1f1f1f] light:border-slate-200 bg-[#111111] light:bg-slate-50 hover:border-[#49EACB] hover:bg-[#1a1a1a] light:hover:bg-white transition-all group disabled:opacity-50 text-left"
                    >
                      <WalletLogo wallet={wallet} />
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-white light:text-slate-900 font-medium text-sm flex items-center gap-2">
                          <span className="truncate">{wallet.name}</span>
                          {wallet.recommended && (
                            <span className="text-[9px] uppercase tracking-wider bg-[#E8AF34]/10 text-[#E8AF34] px-1.5 py-0.5 rounded-sm shrink-0">Recommended</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{wallet.sub}</div>
                      </div>
                      <ExternalLink size={13} className="text-gray-600 group-hover:text-gray-400 shrink-0" />
                    </button>
                  ))}
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
                  onClick={() => window.open(topPick.url, '_blank')}
                  className="mt-5 w-full flex items-center gap-2.5 p-3 rounded-xl border border-[#49EACB]/20 bg-[#49EACB]/[0.04] hover:bg-[#49EACB]/[0.08] hover:border-[#49EACB]/40 transition-all text-left group"
                >
                  <span className="w-8 h-8 rounded-lg bg-[#49EACB]/10 flex items-center justify-center shrink-0">
                    <Sparkles size={15} className="text-[#49EACB]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white light:text-slate-900">New to Kaspa?</div>
                    <div className="text-[11px] text-gray-500 break-words">Install {topPick.name} to create a wallet in a minute.</div>
                  </div>
                  <ArrowRight size={15} className="text-[#49EACB] group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              )}

              <p className="mt-6 text-[11px] text-gray-500 leading-relaxed">
                Installed wallets connect in one click. Others open the install page. Covex is non-custodial: keys never leave your wallet, every transaction is signed by you.
              </p>
            </div>

            <div className="p-4 border-t border-[#1f1f1f] light:border-slate-200 text-center text-[10px] font-mono text-gray-500 shrink-0">
              {netLabel} · Non-custodial · Keys stay in your wallet
            </div>
          </div>
        </div>
      )}
    </>
  );
}
