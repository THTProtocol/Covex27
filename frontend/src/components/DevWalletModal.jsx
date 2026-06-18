import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet, NETWORK_LABELS, getCurrentNetwork, onNetworkChange, deriveFromMnemonic, deriveFromPrivateKey, loadKaspaWasm, walletPrimaryAction } from './WalletContext';
import { Key, Terminal, X, AlertTriangle, Wand2, Wallet, ShieldCheck, ArrowRight, Check, Smartphone, Download } from 'lucide-react';

// ── Standalone Dev Wallet Modal ──
// Now network-aware - derives keys for the currently selected network (TN10/TN12/Mainnet).
// Uses kaspa-wasm to derive keys locally from mnemonic or hex private key.

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
        result = await deriveFromMnemonic(trimmed, network);  // pass 'testnet-12' etc, normalized inside
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
  const accentColor = isMainnet ? 'red' : 'yellow';

  if (isMainnet) {
    return <MainnetWalletModal walletContext={walletCtx} onClose={onClose} />;
  }

  if (isConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-[#0a0a0c] p-6" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto mb-3 animate-pulse" />
            <div className="text-emerald-400 text-sm font-mono mb-1">Dev Mode Active ({netLabel})</div>
            <p className="text-xs font-mono text-white break-all mb-4">{currentAddr}</p>
            <button onClick={handleDisconnect} className="w-full px-4 py-2.5 bg-red-600/10 border border-red-600/30 text-red-400 hover:bg-red-600/20 text-sm font-bold rounded-lg">
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
        className="w-full max-w-md bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-[#1f1f1f] bg-[#0d0d0d]">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-lg bg-${accentColor}-600/20 border border-${accentColor}-600/30 flex items-center justify-center`}>
              <Key size={18} className={`text-${accentColor}-400`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{netLabel} Dev Wallet</h3>
              <p className={`text-[10px] text-${accentColor}-500/80 font-mono uppercase tracking-wider`}>
                Isolated · Kaspa WASM · No Extensions
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Network indicator */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-${accentColor}-500/[0.06] border border-${accentColor}-500/20`}>
            <div className={`w-2 h-2 rounded-full bg-${accentColor}-400`} />
            <span className="text-xs text-gray-200">Keys will be derived for <strong className={`text-${accentColor}-400}`}>{netLabel}</strong></span>
          </div>

          {!isWasmReady && !isConnected && (
            <div className={`p-4 rounded-xl bg-${accentColor}-600/[0.04] border border-${accentColor}-600/20 flex items-center gap-3`}>
              <span className={`inline-block w-5 h-5 border-2 border-${accentColor}-500/30 border-t-${accentColor}-400 rounded-full animate-spin`} />
              <div>
                <p className={`text-sm text-${accentColor}-400 font-semibold`}>Loading WASM...</p>
                <p className={`text-[10px] text-${accentColor}-500/60`}>
                  Initializing kaspa-wasm cryptographic module (~11MB)
                </p>
              </div>
            </div>
          )}

          {isConnected && (
            <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-mono uppercase tracking-wider">Dev Mode Active</span>
              </div>
              <p className="text-sm font-mono text-white break-all">{currentAddr}</p>
              <p className="text-[10px] text-emerald-400/50 mt-1">{netLabel} · Signing with locally-derived key</p>
              <button
                onClick={handleDisconnect}
                className="mt-3 w-full px-4 py-2 bg-red-600/10 border border-red-600/30 text-red-400 hover:bg-red-600/20 text-sm font-bold rounded-lg transition-all"
              >
                Disconnect Dev Wallet
              </button>
            </div>
          )}

          {!isConnected && (
            <>
              <div className="flex rounded-lg bg-[#111] border border-[#1f1f1f] overflow-hidden">
                <button
                  onClick={() => { setTab('mnemonic'); setError(null); }}
                  disabled={!isWasmReady}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                    tab === 'mnemonic'
                      ? `bg-${accentColor}-600/20 text-${accentColor}-400 border-b-2 border-${accentColor}-500`
                      : 'text-gray-300 hover:text-gray-300'
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
                      ? `bg-${accentColor}-600/20 text-${accentColor}-400 border-b-2 border-${accentColor}-500`
                      : 'text-gray-300 hover:text-gray-300'
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
                  className="w-full px-3 py-2.5 text-xs font-mono bg-black/50 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-200 focus:outline-none focus:border-yellow-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
                  className="w-full px-3 py-2.5 text-xs font-mono bg-black/50 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-200 focus:outline-none focus:border-yellow-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {derivedAddr && !error && (
                <div className={`p-3 rounded-lg bg-${accentColor}-500/[0.04] border border-${accentColor}-500/20`}>
                  <p className={`text-[10px] text-${accentColor}-400/60 uppercase tracking-wider`}>Derived Address ({netLabel})</p>
                  <p className={`text-sm font-mono text-${accentColor}-400 break-all mt-1`}>{derivedAddr}</p>
                </div>
              )}

              <button
                onClick={handleDerive}
                disabled={!isWasmReady || deriving || (tab === 'mnemonic' ? !mnemonic.trim() : !hexKey.trim())}
                className={`w-full px-5 py-3 bg-${accentColor}-600 hover:bg-${accentColor}-500 text-black font-bold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(${isMainnet ? '239,68,68,0.2' : '234,179,8,0.2'})]`}
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
          <p className="text-[10px] text-gray-200 text-center leading-relaxed">
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
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 1400); } catch (_) {}
  };

  const useThis = () => {
    if (!ack1 || !ack2) return;
    connectDevMode({ phrase, privateKeyHex: pk, address }); // stored in-browser only; never POSTed
    onConnected?.();
  };

  if (phase === 'idle') {
    return (
      <div className="rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.03] p-4">
        <div className="flex items-center gap-2 text-white font-semibold text-sm mb-1"><Wand2 size={15} className="text-kaspa-green" /> No wallet yet? Generate one</div>
        <p className="text-[11px] text-gray-300 leading-relaxed mb-3">Create a brand-new Kaspa mainnet wallet right here. It starts at 0 KAS, so fund it by sending KAS from any exchange. Your keys are generated in your browser and never leave it.</p>
        <button onClick={generate} disabled={busy} className="btn-shimmer w-full px-4 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Wand2 size={15} />} Generate a new wallet
        </button>
        {err && <p className="text-[11px] text-red-300 mt-2">{err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-kaspa-green/25 bg-black/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-kaspa-green font-bold text-sm"><ShieldCheck size={15} /> Your new wallet</div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">Recovery phrase (24 words)</span>
          <button onClick={() => copy(phrase, 'phrase')} className="text-[10px] text-kaspa-green hover:underline">{copied === 'phrase' ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
          {phrase.split(' ').map((w, i) => (
            <div key={i} className="px-1.5 py-1 rounded bg-white/[0.03] border border-white/10 text-gray-200"><span className="text-gray-500 mr-1">{i + 1}</span>{w}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">Your address (fund it from a CEX)</span>
          <button onClick={() => copy(address, 'addr')} className="text-[10px] text-kaspa-green hover:underline">{copied === 'addr' ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="text-[11px] font-mono text-kaspa-green break-all bg-black/40 border border-white/10 rounded-lg p-2">{address}</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setShowKey(v => !v)} className="text-[10px] text-gray-400 hover:text-gray-200">{showKey ? 'Hide' : 'Show'} private key (advanced)</button>
        {showKey && <button onClick={() => copy(pk, 'pk')} className="text-[10px] text-kaspa-green hover:underline">{copied === 'pk' ? 'Copied' : 'Copy key'}</button>}
      </div>
      {showKey && <p className="text-[10px] font-mono text-amber-300 break-all bg-black/40 border border-amber-500/20 rounded-lg p-2">{pk}</p>}

      <div className="rounded-lg bg-red-500/[0.06] border border-red-500/20 p-3">
        <p className="text-[11px] text-red-200 leading-relaxed">Save your recovery phrase offline now. Anyone with it can spend your funds. Covex cannot recover it, and clearing this browser without the phrase loses the funds forever.</p>
      </div>

      <label className="flex items-start gap-2 text-[11px] text-gray-300 cursor-pointer"><input type="checkbox" checked={ack1} onChange={e => setAck1(e.target.checked)} className="mt-0.5 accent-kaspa-green" /> I have saved my recovery phrase somewhere safe and offline.</label>
      <label className="flex items-start gap-2 text-[11px] text-gray-300 cursor-pointer"><input type="checkbox" checked={ack2} onChange={e => setAck2(e.target.checked)} className="mt-0.5 accent-kaspa-green" /> I understand Covex cannot recover a lost phrase, and that browser-generated wallets are best for getting started (use a hardware wallet or extension for large amounts).</label>

      <button onClick={useThis} disabled={!ack1 || !ack2} className="w-full px-4 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">Use this wallet</button>
      <p className="text-[10px] text-gray-500 text-center">Generated in your browser via the Kaspa WASM SDK. Your key is held only on this device and is never sent to Covex.</p>
    </div>
  );
}

// ── Mainnet Wallet Modal - real wallet extensions + trustless in-app wallet generation ──
function MainnetWalletModal({ walletContext, onClose }) {
  const { wallets, connect, connecting, error, clearError, connectDevMode } = walletContext;
  const [showAll, setShowAll] = useState(false);
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
    } catch (_) { /* error surfaces in the modal's error state; keep it open */ }
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
            ? 'border-kaspa-green/40 bg-kaspa-green/[0.07] hover:border-kaspa-green/60 hover:bg-kaspa-green/[0.12]'
            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
        }`}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-black/40 border border-white/[0.06]">
          {wallet.logo ? (
            <img src={wallet.logo} alt={wallet.name} className="w-8 h-8 object-contain rounded-md" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <Wallet size={18} className="text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm flex items-center gap-2">
            {wallet.name}
            {det && <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide bg-kaspa-green/15 text-kaspa-green border border-kaspa-green/30 px-1.5 py-0.5 rounded-full shrink-0 font-bold"><Check size={9} /> Installed</span>}
            {!det && wallet.recommended && <span className="text-[9px] uppercase tracking-wide bg-white/[0.06] text-gray-300 px-1.5 py-0.5 rounded-full shrink-0 font-semibold">Recommended</span>}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{det ? 'Tap to connect' : isOpen ? action.label : (wallet.sub || 'Install')}</div>
        </div>
        {det
          ? <ArrowRight size={16} className="text-kaspa-green shrink-0 group-hover:translate-x-0.5 transition-transform" />
          : isOpen
            ? <Smartphone size={15} className="text-kaspa-green shrink-0" />
            : <Download size={14} className="text-gray-500 group-hover:text-gray-300 transition-colors shrink-0" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0c] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
              <Wallet size={18} className="text-kaspa-green" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Connect a wallet</h3>
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-red-300 bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Mainnet</span>
                Non-custodial · keys stay in your wallet
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Installed wallets - one-click, surfaced first */}
          {detected.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-kaspa-green/80 font-bold flex items-center gap-1.5"><Check size={11} /> Ready to connect</div>
              {detected.map((w) => <WalletRow key={w.id} wallet={w} primary />)}
            </div>
          )}

          {detected.length === 0 && (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs text-gray-300 leading-relaxed flex items-start gap-2">
              <ShieldCheck size={15} className="text-kaspa-green shrink-0 mt-0.5" />
              <span>No Kaspa wallet detected yet. Pick one below to install it (one click), or create a new wallet right here. Mainnet uses real KAS — your keys never leave your wallet.</span>
            </div>
          )}

          {/* Other / installable wallets */}
          {others.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">{detected.length ? 'Other wallets' : 'Choose a wallet'}</div>
              {(showAll ? others : others.slice(0, detected.length ? 3 : 5)).map((w) => <WalletRow key={w.id} wallet={w} />)}
              {others.length > (detected.length ? 3 : 5) && (
                <button onClick={() => setShowAll((s) => !s)} className="w-full text-center text-[11px] font-semibold text-kaspa-green hover:text-kaspa-green/80 py-1.5">
                  {showAll ? 'Show fewer' : `Show ${others.length - (detected.length ? 3 : 5)} more wallets`}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-300">{error}</p>
                <button onClick={clearError} className="text-[10px] text-red-400/70 hover:text-red-300 mt-1">Dismiss</button>
              </div>
            </div>
          )}

          {connecting && (
            <div className="p-3 rounded-lg bg-kaspa-green/[0.05] border border-kaspa-green/20 text-center flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-kaspa-green/30 border-t-kaspa-green rounded-full animate-spin" />
              <p className="text-sm text-kaspa-green">Approve the connection in your wallet…</p>
            </div>
          )}

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] uppercase tracking-widest text-gray-500">new to Kaspa?</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <GenerateWalletSection connectDevMode={connectDevMode} onConnected={onClose} />
        </div>

        <div className="p-5 border-t border-white/[0.06]">
          <p className="text-[10px] text-gray-500 text-center leading-relaxed">
            Non-custodial. Covex never holds your keys or funds. Mainnet activity uses real KAS from your own wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
