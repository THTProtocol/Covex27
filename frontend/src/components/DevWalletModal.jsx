import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet, NETWORK_LABELS, getCurrentNetwork, onNetworkChange, deriveFromMnemonic, deriveFromPrivateKey, loadKaspaWasm, walletPrimaryAction } from './WalletContext';
import { useDialog } from '../lib/useDialog';
import { Key, Terminal, X, AlertTriangle, Wand2, Wallet, ShieldCheck, ArrowRight, Check, Smartphone, Download } from 'lucide-react';

// ── Standalone Dev Wallet Modal ──
// Covex is mainnet-only, so this always presents the mainnet connect flow (real wallet
// extensions + a non-custodial in-browser wallet generator). Keys are derived locally via
// kaspa-wasm and never leave the browser.

let _wasmModule = null;

async function ensureWasm() {
  if (_wasmModule) return _wasmModule;
  const wasm = await loadKaspaWasm();
  _wasmModule = wasm;
  return _wasmModule;
}

function generateRandomMnemonic() {
  return ensureWasm().then((wasm) => {
    const { Mnemonic } = wasm;
    const mnemonic = Mnemonic.random(24);
    const phrase = mnemonic.phrase;
    mnemonic.free();
    return phrase;
  });
}

export default function DevWalletModal({ isOpen, onClose }) {
  const walletCtx = useWallet();
  const { connectDevMode, disconnect, isDevMode, address: currentAddr } = walletCtx;
  const [network, setNetwork] = useState(() => getCurrentNetwork());
  const [tab, setTab] = useState('mnemonic');
  const [mnemonic, setMnemonic] = useState('');
  const [hexKey, setHexKey] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState(null);
  const [derivedAddr, setDerivedAddr] = useState(null);
  const [isWasmReady, setIsWasmReady] = useState(false);
  const wasmLoadAttempted = useRef(false);
  const titleId = 'dev-wallet-modal-title';
  const dialogRef = useDialog({ open: isOpen, onClose });

  // Listen for network changes while modal is open
  useEffect(() => {
    if (!isOpen) return;
    return onNetworkChange(setNetwork);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || wasmLoadAttempted.current) return;
    wasmLoadAttempted.current = true;
    ensureWasm()
      .then(() => setIsWasmReady(true))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      wasmLoadAttempted.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
      setIsWasmReady(false);
    }
  }, [isOpen]);

  const handleDerive = useCallback(async () => {
    setError(null);
    setDerivedAddr(null);
    setDeriving(true);

    const isMainLocal = network === 'mainnet' || network === 'mainnet-1';
    if (isMainLocal) {
      setError('Dev mode (mnemonic or hex) is disabled on mainnet. Connect using a real wallet extension instead.');
      setDeriving(false);
      return;
    }

    try {
      let result;
      if (tab === 'mnemonic') {
        const trimmed = mnemonic.trim();
        if (!trimmed) throw new Error('Enter a 12 or 24-word mnemonic phrase');
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount !== 12 && wordCount !== 24) throw new Error('Mnemonic must be exactly 12 or 24 words');
        result = await deriveFromMnemonic(trimmed, network);  // normalized to mainnet inside
      } else {
        const trimmed = hexKey.trim();
        if (!trimmed) throw new Error('Enter a 64-character hex private key');
        result = await deriveFromPrivateKey(trimmed, network);
      }

      setDerivedAddr(result.address);
      connectDevMode({
        phrase: tab === 'mnemonic' ? mnemonic.trim() : undefined,
        hexKey: tab === 'hex' ? hexKey.trim() : undefined,
        privateKeyHex: result.privateKeyHex,
        address: result.address,
      });
    } catch (err) {
      console.error('Dev derivation error:', err);
      setError(err.message || 'Derivation failed');
    } finally {
      setDeriving(false);
    }
  }, [tab, mnemonic, hexKey, connectDevMode, network]);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setDerivedAddr(null);
    setDeriving(true);
    try {
      const phrase = await generateRandomMnemonic();
      setMnemonic(phrase);
      setTab('mnemonic');
    } catch (err) {
      setError(err.message || 'Failed to generate wallet');
    } finally {
      setDeriving(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  if (!isOpen) return null;

  const isConnected = isDevMode && currentAddr;
  const netLabel = NETWORK_LABELS[network] || network;
  const isMainnet = network === 'mainnet' || network === 'mainnet-1';

  // Tailwind v4 only emits classes that appear as literal strings, so dynamic
  // bg-${accentColor}-* interpolation renders blank. Use full literal class
  // strings per network instead.
  const A = isMainnet
    ? {
        tile: 'bg-red-600/20 border-red-600/30',
        icon: 'text-red-400',
        sub: 'text-red-500/80',
        netDot: 'bg-red-400',
        netBox: 'bg-red-500/[0.06] border-red-500/20 light:bg-red-50 light:border-red-200',
        strong: 'text-red-400 light:text-red-600',
        tabActive: 'bg-red-600/20 text-red-400 border-red-500',
        loadBox: 'bg-red-600/[0.04] border-red-600/20 light:bg-red-50 light:border-red-200',
        spinner: 'border-red-500/30 border-t-red-400',
        loadText: 'text-red-400 light:text-red-600',
        loadSub: 'text-red-500/60 light:text-red-500',
        derivedBox: 'bg-red-500/[0.04] border-red-500/20 light:bg-red-50 light:border-red-200',
        derivedLabel: 'text-red-400/60 light:text-red-500',
        derivedAddr: 'text-red-400 light:text-red-600',
        deriveBtn: 'bg-red-600 hover:bg-red-500',
      }
    : {
        tile: 'bg-yellow-600/20 border-yellow-600/30',
        icon: 'text-yellow-400',
        sub: 'text-yellow-500/80',
        netDot: 'bg-yellow-400',
        netBox: 'bg-yellow-500/[0.06] border-yellow-500/20 light:bg-yellow-50 light:border-yellow-200',
        strong: 'text-yellow-400 light:text-yellow-600',
        tabActive: 'bg-yellow-600/20 text-yellow-400 border-yellow-500',
        loadBox: 'bg-yellow-600/[0.04] border-yellow-600/20 light:bg-yellow-50 light:border-yellow-200',
        spinner: 'border-yellow-500/30 border-t-yellow-400',
        loadText: 'text-yellow-400 light:text-yellow-600',
        loadSub: 'text-yellow-500/60 light:text-yellow-500',
        derivedBox: 'bg-yellow-500/[0.04] border-yellow-500/20 light:bg-yellow-50 light:border-yellow-200',
        derivedLabel: 'text-yellow-400/60 light:text-yellow-600',
        derivedAddr: 'text-yellow-400 light:text-yellow-600',
        deriveBtn: 'bg-yellow-600 hover:bg-yellow-500',
      };

  if (isMainnet) {
    return <MainnetWalletModal walletContext={walletCtx} onClose={onClose} />;
  }

  if (isConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Dev wallet connected (${netLabel})`}
          className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-[#0a0a0c] light:bg-white p-6 outline-none"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto mb-3 animate-pulse" />
            <div className="text-emerald-400 light:text-emerald-600 text-sm font-mono mb-1">Dev Mode Active ({netLabel})</div>
            <p className="text-xs font-mono text-white light:text-slate-900 break-all mb-4">{currentAddr}</p>
            <button onClick={handleDisconnect} className="w-full px-4 py-2.5 bg-red-600/10 border border-red-600/30 text-red-400 light:text-red-600 hover:bg-red-600/20 text-sm font-bold rounded-lg">
              Disconnect Dev Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md bg-[#0a0a0a] light:bg-white border border-[#1f1f1f] light:border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-[#1f1f1f] light:border-slate-200 bg-[#0d0d0d] light:bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-lg ${A.tile} border flex items-center justify-center`}>
              <Key size={18} className={A.icon} />
            </div>
            <div>
              <h3 id={titleId} className="text-base font-bold text-white light:text-slate-900">{netLabel} Dev Wallet</h3>
              <p className={`text-[10px] ${A.sub} font-mono uppercase tracking-wider`}>
                Isolated · Kaspa WASM · No Extensions
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 light:text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Network indicator */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${A.netBox}`}>
            <div className={`w-2 h-2 rounded-full ${A.netDot}`} />
            <span className="text-xs text-gray-200 light:text-slate-600">Keys will be derived for <strong className={A.strong}>{netLabel}</strong></span>
          </div>

          {!isWasmReady && !isConnected && (
            <div className={`p-4 rounded-xl border ${A.loadBox} flex items-center gap-3`}>
              <span className={`inline-block w-5 h-5 border-2 ${A.spinner} rounded-full animate-spin`} />
              <div>
                <p className={`text-sm ${A.loadText} font-semibold`}>Loading WASM...</p>
                <p className={`text-[10px] ${A.loadSub}`}>
                  Initializing kaspa-wasm cryptographic module (~11MB)
                </p>
              </div>
            </div>
          )}

          {isConnected && (
            <div className="p-4 rounded-xl bg-emerald-500/[0.06] light:bg-emerald-50 border border-emerald-500/30 light:border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 light:text-emerald-600 font-mono uppercase tracking-wider">Dev Mode Active</span>
              </div>
              <p className="text-sm font-mono text-white light:text-slate-900 break-all">{currentAddr}</p>
              <p className="text-[10px] text-emerald-400/50 light:text-emerald-600/70 mt-1">{netLabel} · Signing with locally-derived key</p>
              <button
                onClick={handleDisconnect}
                className="mt-3 w-full px-4 py-2 bg-red-600/10 border border-red-600/30 text-red-400 light:text-red-600 hover:bg-red-600/20 text-sm font-bold rounded-lg transition-all"
              >
                Disconnect Dev Wallet
              </button>
            </div>
          )}

          {!isConnected && (
            <>
              <div className="flex rounded-lg bg-[#111] light:bg-slate-100 border border-[#1f1f1f] light:border-slate-200 overflow-hidden">
                <button
                  onClick={() => { setTab('mnemonic'); setError(null); }}
                  disabled={!isWasmReady}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                    tab === 'mnemonic'
                      ? `${A.tabActive} border-b-2`
                      : 'text-gray-300 light:text-slate-500 hover:text-gray-300 light:hover:text-slate-700'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Terminal size={12} className="inline mr-1" />
                  Mnemonic
                </button>
                <button
                  onClick={() => { setTab('hex'); setError(null); }}
                  disabled={!isWasmReady}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                    tab === 'hex'
                      ? `${A.tabActive} border-b-2`
                      : 'text-gray-300 light:text-slate-500 hover:text-gray-300 light:hover:text-slate-700'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Key size={12} className="inline mr-1" />
                  Hex Key
                </button>
              </div>

              {tab === 'mnemonic' && (
                <button
                  onClick={handleGenerate}
                  disabled={!isWasmReady || deriving}
                  className="w-full px-4 py-2 bg-[#49EACB]/[0.06] border border-[#49EACB]/20 text-[#49EACB] hover:bg-[#49EACB]/[0.12] text-xs font-semibold rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deriving ? (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-[#49EACB]/30 border-t-[#49EACB] rounded-full animate-spin" />
                  ) : (
                    <Wand2 size={14} />
                  )}
                  Generate New Wallet
                </button>
              )}

              {tab === 'mnemonic' && (
                <textarea
                  value={mnemonic}
                  onChange={(e) => { setMnemonic(e.target.value); setError(null); }}
                  rows={3}
                  placeholder="witch collapse practice feed shame open despair creek road again ice least"
                  disabled={!isWasmReady}
                  className="w-full px-3 py-2.5 text-xs font-mono bg-black/50 light:bg-white border border-gray-700 light:border-slate-300 rounded-lg text-gray-200 light:text-slate-900 placeholder:text-gray-500 light:placeholder:text-slate-400 focus:outline-none focus:border-yellow-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              )}

              {tab === 'hex' && (
                <textarea
                  value={hexKey}
                  onChange={(e) => { setHexKey(e.target.value); setError(null); }}
                  rows={2}
                  placeholder="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                  disabled={!isWasmReady}
                  className="w-full px-3 py-2.5 text-xs font-mono bg-black/50 light:bg-white border border-gray-700 light:border-slate-300 rounded-lg text-gray-200 light:text-slate-900 placeholder:text-gray-500 light:placeholder:text-slate-400 focus:outline-none focus:border-yellow-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-500/[0.06] light:bg-red-50 border border-red-500/20 light:border-red-200 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 light:text-red-700">{error}</p>
                </div>
              )}

              {derivedAddr && !error && (
                <div className={`p-3 rounded-lg border ${A.derivedBox}`}>
                  <p className={`text-[10px] ${A.derivedLabel} uppercase tracking-wider`}>Derived Address ({netLabel})</p>
                  <p className={`text-sm font-mono ${A.derivedAddr} break-all mt-1`}>{derivedAddr}</p>
                </div>
              )}

              <button
                onClick={handleDerive}
                disabled={!isWasmReady || deriving || (tab === 'mnemonic' ? !mnemonic.trim() : !hexKey.trim())}
                className={`w-full px-5 py-3 ${A.deriveBtn} text-black font-bold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(${isMainnet ? '239,68,68,0.2' : '234,179,8,0.2'})]`}
              >
                {deriving ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Deriving Keys...
                  </>
                ) : !isWasmReady ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Loading WASM...
                  </>
                ) : (
                  <>
                    <Terminal size={16} />
                    Connect {netLabel} Dev Wallet
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <p className="text-[10px] text-gray-200 light:text-slate-500 text-center leading-relaxed">
            Keys are derived locally via kaspa-wasm. Never leaves your browser.
            For covenant testing only, no real funds. {netLabel}.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Trustless in-app wallet generator (client-side keygen; key never leaves the browser) ──
function GenerateWalletSection({ connectDevMode, onConnected }) {
  const [phase, setPhase] = useState('idle'); // idle | generated
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [phrase, setPhrase] = useState('');
  const [address, setAddress] = useState('');
  const [pk, setPk] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(null);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);

  const generate = useCallback(async () => {
    setErr(null); setBusy(true);
    try {
      const ph = await generateRandomMnemonic();               // Mnemonic.random(24), client-side
      const { privateKeyHex, address } = await deriveFromMnemonic(ph, 'mainnet'); // derived locally
      setPhrase(ph); setAddress(address); setPk(privateKeyHex); setPhase('generated');
    } catch (e) { setErr(e.message || 'Generation failed'); }
    finally { setBusy(false); }
  }, []);

  const copy = async (text, which) => {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 1400); } catch { /* best-effort; failure is non-fatal here */ }
  };

  const useThis = () => {
    if (!ack1 || !ack2) return;
    connectDevMode({ phrase, privateKeyHex: pk, address }); // stored in-browser only; never POSTed
    onConnected?.();
  };

  if (phase === 'idle') {
    return (
      <div className="rounded-xl border border-kaspa-green/20 light:border-kaspa-green/40 bg-kaspa-green/[0.03] light:bg-kaspa-green/[0.06] p-4">
        <div className="flex items-center gap-2 text-white light:text-slate-900 font-semibold text-sm mb-1"><Wand2 size={15} className="text-kaspa-green" /> No wallet yet? Generate one</div>
        <p className="text-[11px] text-gray-300 light:text-slate-600 leading-relaxed mb-3">Create a brand-new Kaspa mainnet wallet right here. It starts at 0 KAS, so fund it by sending KAS from any exchange. Your keys are generated in your browser and never leave it.</p>
        <button onClick={generate} disabled={busy} className="btn-shimmer w-full px-4 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Wand2 size={15} />} Generate a new wallet
        </button>
        {err && <p className="text-[11px] text-red-300 light:text-red-700 mt-2">{err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-kaspa-green/25 light:border-kaspa-green/40 bg-black/40 light:bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-kaspa-green light:text-[#0d9488] font-bold text-sm"><ShieldCheck size={15} /> Your new wallet</div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 light:text-slate-500">Recovery phrase (24 words)</span>
          <button onClick={() => copy(phrase, 'phrase')} className="text-[10px] text-kaspa-green light:text-[#0d9488] hover:underline">{copied === 'phrase' ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px] font-mono">
          {phrase.split(' ').map((w, i) => (
            <div key={i} className="px-1.5 py-1 rounded bg-white/[0.03] light:bg-white border border-white/10 light:border-slate-200 text-gray-200 light:text-slate-800"><span className="text-gray-500 light:text-slate-600 mr-1">{i + 1}</span>{w}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 light:text-slate-500">Your address (fund it from a CEX)</span>
          <button onClick={() => copy(address, 'addr')} className="text-[10px] text-kaspa-green light:text-[#0d9488] hover:underline">{copied === 'addr' ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="text-[11px] font-mono text-kaspa-green light:text-[#0d9488] break-all bg-black/40 light:bg-white border border-white/10 light:border-slate-200 rounded-lg p-2">{address}</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setShowKey(v => !v)} className="text-[10px] text-gray-400 light:text-slate-500 hover:text-gray-200 light:hover:text-slate-700">{showKey ? 'Hide' : 'Show'} private key (advanced)</button>
        {showKey && <button onClick={() => copy(pk, 'pk')} className="text-[10px] text-kaspa-green light:text-[#0d9488] hover:underline">{copied === 'pk' ? 'Copied' : 'Copy key'}</button>}
      </div>
      {showKey && <p className="text-[10px] font-mono text-amber-300 light:text-amber-700 break-all bg-black/40 light:bg-amber-50 border border-amber-500/20 light:border-amber-200 rounded-lg p-2">{pk}</p>}

      <div className="rounded-lg bg-red-500/[0.06] light:bg-red-50 border border-red-500/20 light:border-red-200 p-3">
        <p className="text-[11px] text-red-200 light:text-red-700 leading-relaxed">Save your recovery phrase offline now. Anyone with it can spend your funds. Covex cannot recover it, and clearing this browser without the phrase loses the funds forever.</p>
      </div>

      <label className="flex items-start gap-2 text-[11px] text-gray-300 light:text-slate-600 cursor-pointer"><input type="checkbox" checked={ack1} onChange={e => setAck1(e.target.checked)} className="mt-0.5 accent-kaspa-green" /> I have saved my recovery phrase somewhere safe and offline.</label>
      <label className="flex items-start gap-2 text-[11px] text-gray-300 light:text-slate-600 cursor-pointer"><input type="checkbox" checked={ack2} onChange={e => setAck2(e.target.checked)} className="mt-0.5 accent-kaspa-green" /> I understand Covex cannot recover a lost phrase, and that browser-generated wallets are best for getting started (use a hardware wallet or extension for large amounts).</label>

      <button onClick={useThis} disabled={!ack1 || !ack2} className="w-full px-4 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">Use this wallet</button>
      <p className="text-[10px] text-gray-500 light:text-slate-600 text-center">Generated in your browser via the Kaspa WASM SDK. Your key is held only on this device and is never sent to Covex.</p>
    </div>
  );
}

// ── Mainnet Wallet Modal - real wallet extensions + trustless in-app wallet generation ──
function MainnetWalletModal({ walletContext, onClose }) {
  const { wallets, connect, connecting, error, clearError, connectDevMode } = walletContext;
  const [showAll, setShowAll] = useState(false);
  const titleId = 'mainnet-wallet-modal-title';
  const dialogRef = useDialog({ open: true, onClose });
  // Re-detect periodically so a wallet extension that injects a moment after the modal opens
  // shows up as "Installed" without the user having to reopen.
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 400);
    const stop = setTimeout(() => clearInterval(iv), 8000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, []);

  const isDet = (w) => !!(w.detect && w.detect());
  const detected = wallets.filter(isDet);
  const others = wallets.filter((w) => !isDet(w)).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));

  // Single source of truth: every tap goes through the unified connect(). It decides one-click
  // connect (provider present) vs mobile open-app deep-link vs install, and never bounces
  // straight to download. Close the modal only on a real (provider) connection.
  const handleConnect = async (wallet) => {
    const action = walletPrimaryAction(wallet);
    try {
      await connect(wallet.id);
      if (action.kind === 'connect') onClose();
    } catch { /* error surfaces in the modal's error state; keep it open */ }
  };

  const WalletRow = ({ wallet, primary }) => {
    const det = isDet(wallet);
    const action = walletPrimaryAction(wallet);
    const isOpen = action.kind === 'open';
    return (
      <button
        onClick={() => handleConnect(wallet)}
        disabled={connecting}
        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all group disabled:opacity-50 text-left motion-safe:hover:-translate-y-px ${
          primary
            ? 'border-kaspa-green/40 bg-kaspa-green/[0.07] light:bg-kaspa-green/[0.1] hover:border-kaspa-green/60 hover:bg-kaspa-green/[0.12]'
            : 'border-white/[0.07] light:border-slate-200 bg-white/[0.02] light:bg-slate-50 hover:border-white/20 light:hover:border-slate-300 hover:bg-white/[0.04] light:hover:bg-white'
        }`}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-black/40 light:bg-white border border-white/[0.06] light:border-slate-200">
          {wallet.logo ? (
            <img src={wallet.logo} alt={wallet.name} className="w-8 h-8 object-contain rounded-md" loading="lazy" decoding="async" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <Wallet size={18} className="text-gray-400 light:text-slate-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white light:text-slate-900 font-semibold text-sm flex items-center gap-2">
            {wallet.name}
            {det && <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide bg-kaspa-green/15 text-kaspa-green light:text-[#0d9488] border border-kaspa-green/30 px-1.5 py-0.5 rounded-full shrink-0 font-bold"><Check size={9} /> Installed</span>}
            {!det && wallet.recommended && <span className="text-[9px] uppercase tracking-wide bg-white/[0.06] light:bg-slate-100 text-gray-300 light:text-slate-600 px-1.5 py-0.5 rounded-full shrink-0 font-semibold">Recommended</span>}
          </div>
          <div className="text-xs text-gray-400 light:text-slate-500 mt-0.5">{det ? 'Tap to connect' : isOpen ? action.label : (wallet.sub || 'Install')}</div>
        </div>
        {det
          ? <ArrowRight size={16} className="text-kaspa-green shrink-0 group-hover:translate-x-0.5 transition-transform" />
          : isOpen
            ? <Smartphone size={15} className="text-kaspa-green shrink-0" />
            : <Download size={14} className="text-gray-500 light:text-slate-600 group-hover:text-gray-300 transition-colors shrink-0" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-white/10 light:border-slate-200 bg-[#0a0a0c] light:bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] light:border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
              <Wallet size={18} className="text-kaspa-green" />
            </div>
            <div>
              <h3 id={titleId} className="text-base font-bold text-white light:text-slate-900">Connect a wallet</h3>
              <p className="text-[11px] text-gray-400 light:text-slate-500 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-red-300 light:text-red-600 bg-red-500/10 light:bg-red-50 border border-red-500/25 light:border-red-200 px-1.5 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Mainnet</span>
                Non-custodial · keys stay in your wallet
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Installed wallets - one-click, surfaced first */}
          {detected.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-kaspa-green/80 light:text-[#0d9488] font-bold flex items-center gap-1.5"><Check size={11} /> Ready to connect</div>
              {detected.map((w) => <WalletRow key={w.id} wallet={w} primary />)}
            </div>
          )}

          {detected.length === 0 && (
            <div className="p-3 rounded-xl bg-white/[0.03] light:bg-slate-50 border border-white/[0.07] light:border-slate-200 text-xs text-gray-300 light:text-slate-600 leading-relaxed flex items-start gap-2">
              <ShieldCheck size={15} className="text-kaspa-green shrink-0 mt-0.5" />
              <span>No Kaspa wallet detected yet. Pick one below to install it (one click), or create a new wallet right here. Mainnet uses real KAS - your keys never leave your wallet.</span>
            </div>
          )}

          {/* Other / installable wallets */}
          {others.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500 font-bold">{detected.length ? 'Other wallets' : 'Choose a wallet'}</div>
              {(showAll ? others : others.slice(0, detected.length ? 3 : 5)).map((w) => <WalletRow key={w.id} wallet={w} />)}
              {others.length > (detected.length ? 3 : 5) && (
                <button onClick={() => setShowAll((s) => !s)} className="w-full text-center text-[11px] font-semibold text-kaspa-green light:text-[#0d9488] hover:text-kaspa-green/80 py-1.5">
                  {showAll ? 'Show fewer' : `Show ${others.length - (detected.length ? 3 : 5)} more wallets`}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/[0.06] light:bg-red-50 border border-red-500/20 light:border-red-200 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-red-300 light:text-red-700 break-words">{error}</p>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      clearError();
                      onClose();
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('covex:open-wallet-drawer'));
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-kaspa-green/15 hover:bg-kaspa-green/25 border border-kaspa-green/30 text-[11px] font-bold text-kaspa-green light:text-[#0d9488] transition-colors"
                  >
                    <Wallet size={11} /> Open the wallet connector
                    <ArrowRight size={11} />
                  </button>
                  <button onClick={clearError} className="text-[10px] text-red-400/70 light:text-red-500 hover:text-red-300">Dismiss</button>
                </div>
              </div>
            </div>
          )}

          {connecting && (
            <div className="p-3 rounded-lg bg-kaspa-green/[0.05] light:bg-kaspa-green/[0.1] border border-kaspa-green/20 text-center flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-kaspa-green/30 border-t-kaspa-green rounded-full animate-spin" />
              <p className="text-sm text-kaspa-green light:text-[#0d9488]">Approve the connection in your wallet...</p>
            </div>
          )}

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/10 light:bg-slate-200" />
            <span className="text-[10px] uppercase tracking-widest text-gray-500 light:text-slate-600">new to Kaspa?</span>
            <div className="flex-1 h-px bg-white/10 light:bg-slate-200" />
          </div>
          <GenerateWalletSection connectDevMode={connectDevMode} onConnected={onClose} />
        </div>

        <div className="p-5 border-t border-white/[0.06] light:border-slate-200">
          <p className="text-[10px] text-gray-500 light:text-slate-600 text-center leading-relaxed">
            Non-custodial. Covex never holds your keys or funds. Mainnet activity uses real KAS from your own wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
