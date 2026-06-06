import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet, NETWORK_LABELS, getCurrentNetwork, onNetworkChange } from './WalletContext';
import { Key, Terminal, X, AlertTriangle, Wand2, Wallet, ExternalLink } from 'lucide-react';

// ── Standalone Dev Wallet Modal ──
// Now network-aware - derives keys for the currently selected network (TN10/TN12/Mainnet).
// Uses kaspa-wasm to derive keys locally from mnemonic or hex private key.

let _wasmModule = null;

async function ensureWasm() {
  if (_wasmModule) return _wasmModule;
  const wasm = await import('@onekeyfe/kaspa-wasm');
  if (typeof wasm.default === 'function') {
    await wasm.default();
  }
  _wasmModule = wasm;
  return _wasmModule;
}

function deriveFromMnemonic(phrase, networkId = 'kaspatest') {
  return ensureWasm().then(async (wasm) => {
    const { Mnemonic, XPrv } = wasm;
    const mnemonic = new Mnemonic(phrase);
    const seed = mnemonic.toSeed('');
    const xprv = new XPrv(seed);
    const derived = xprv.derivePath("m/44'/111111'/0'/0/0");
    const privateKeyHex = derived.toPrivateKey().toString();
    const address = derived.toPrivateKey().toAddress(networkId);
    const addressStr = address.toString();
    mnemonic.free(); xprv.free(); derived.free();
    return { privateKeyHex, address: addressStr };
  });
}

function deriveFromPrivateKey(hexKey, networkId = 'kaspatest') {
  return ensureWasm().then(async (wasm) => {
    const { PrivateKey } = wasm;
    const cleanHex = hexKey.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
      throw new Error('Invalid private key hex. Must be 64 hex characters (32 bytes).');
    }
    const pk = new PrivateKey(cleanHex);
    const address = pk.toAddress(networkId);
    const addressStr = address.toString();
    pk.free();
    return { privateKeyHex: cleanHex, address: addressStr };
  });
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
  const { connectDevMode, disconnect, isDevMode, address: currentAddr } = useWallet();
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

    const netPrefix = network === 'mainnet' || network === 'mainnet-1' ? 'kaspa' : 'kaspatest';

    try {
      let result;
      if (tab === 'mnemonic') {
        const trimmed = mnemonic.trim();
        if (!trimmed) throw new Error('Enter a 12 or 24-word mnemonic phrase');
        result = await deriveFromMnemonic(trimmed, netPrefix);
      } else {
        const trimmed = hexKey.trim();
        if (!trimmed) throw new Error('Enter a 64-character hex private key');
        result = await deriveFromPrivateKey(trimmed, netPrefix);
      }

      setDerivedAddr(result.address);
      connectDevMode({
        phrase: tab === 'mnemonic' ? mnemonic.trim() : undefined,
        hexKey: tab === 'hex' ? hexKey.trim() : undefined,
        privateKeyHex: result.privateKeyHex,
        address: result.address,
      });
    } catch (err) {
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
    return <MainnetWalletModal walletContext={useWallet()} onClose={onClose} />;
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

// ── Mainnet Wallet Modal - real wallet extensions only, no dev mnemonic/hex ──
function MainnetWalletModal({ walletContext, onClose }) {
  const { wallets, connect, connecting, error, clearError } = walletContext;

  const handleClick = async (wallet) => {
    const detected = wallet.detect ? wallet.detect() : false;
    if (detected) {
      try {
        await connect(wallet.id);
        onClose();
      } catch (_) {}
    } else {
      window.open(wallet.url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0a0a0c] shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-red-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            <div>
              <h3 className="text-base font-bold text-white">MAINNET Connect</h3>
              <p className="text-[10px] text-red-400/70 font-mono uppercase tracking-wider">Real KAS · Real Wallet Extension Only</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-lg bg-red-500/[0.04] border border-red-500/15">
            <p className="text-xs text-red-300 leading-relaxed">
              MAINNET uses real KAS. Connect a Kaspa wallet extension to deploy real covenants with paid tiers. No mnemonic or hex key input - your keys stay in your wallet.
            </p>
          </div>

          {/* Wallet grid */}
          <div className="space-y-2">
            {wallets.map((wallet) => {
              const detected = wallet.detect ? wallet.detect() : false;
              return (
                <button
                  key={wallet.id}
                  onClick={() => handleClick(wallet)}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-red-500/10 bg-red-500/[0.02] hover:border-red-500/30 hover:bg-red-500/[0.06] transition-all group disabled:opacity-50 text-left"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-black/40 border border-red-500/10">
                    {wallet.logo ? (
                      <img src={wallet.logo} alt={wallet.name} className="w-8 h-8 object-contain rounded-md"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <Wallet size={18} className="text-red-400/60" />
                    )}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-white font-medium text-sm flex items-center gap-2">
                      {wallet.name}
                      {detected && (
                        <span className="text-[9px] uppercase tracking-wider bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-sm shrink-0 font-mono">Detected</span>
                      )}
                      {wallet.recommended && !detected && (
                        <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-sm shrink-0 font-mono">Recommended</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {detected ? 'Click to connect' : wallet.sub || 'Install'}
                    </div>
                  </div>
                  {!detected ? (
                    <ExternalLink size={14} className="text-gray-400 group-hover:text-red-400 transition-colors shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_4px_rgba(239,68,68,0.5)] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

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
            <div className="p-3 rounded-lg bg-red-500/[0.04] border border-red-500/15 text-center">
              <p className="text-sm text-red-400 animate-pulse">Connecting to wallet...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-red-500/10">
          <p className="text-[10px] text-gray-400 text-center">
            MAINNET · Non-custodial · Real KAS only · Keys never leave your wallet
          </p>
        </div>
      </div>
    </div>
  );
}
