import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from './WalletContext';
import { Key, Terminal, X, AlertTriangle, Wand2 } from 'lucide-react';

// ── Standalone TN12 Dev Wallet Modal ──
// Isolated from browser extension wallet flow. Uses kaspa-wasm to derive
// keys locally from mnemonic or hex private key. Stores result in devSigner
// state via connectDevMode. Zero interaction with window.kasware/kastle/etc.

let _wasmModule = null; // cached WASM module

async function ensureWasm() {
  if (_wasmModule) return _wasmModule;
  const wasm = await import('@onekeyfe/kaspa-wasm');
  // Must explicitly init WASM binary before using any class
  if (typeof wasm.default === 'function') {
    await wasm.default();
  }
  _wasmModule = wasm;
  return _wasmModule;
}

function deriveFromMnemonic(phrase, networkId = 'testnet-12') {
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

function deriveFromPrivateKey(hexKey, networkId = 'testnet-12') {
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
  const [tab, setTab] = useState('mnemonic'); // 'mnemonic' | 'hex'
  const [mnemonic, setMnemonic] = useState('');
  const [hexKey, setHexKey] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState(null);
  const [derivedAddr, setDerivedAddr] = useState(null);
  const [isWasmReady, setIsWasmReady] = useState(false);
  const wasmLoadAttempted = useRef(false);

  // Preload WASM on mount (or when modal opens)
  useEffect(() => {
    if (!isOpen || wasmLoadAttempted.current) return;
    wasmLoadAttempted.current = true;
    ensureWasm()
      .then(() => setIsWasmReady(true))
      .catch(() => {}); // error state handled by UI
  }, [isOpen]);

  // Reset WASM flag when modal closes so it reloads next time if needed
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

    try {
      let result;
      if (tab === 'mnemonic') {
        const trimmed = mnemonic.trim();
        if (!trimmed) throw new Error('Enter a 12 or 24-word mnemonic phrase');
        result = await deriveFromMnemonic(trimmed);
      } else {
        const trimmed = hexKey.trim();
        if (!trimmed) throw new Error('Enter a 64-character hex private key');
        result = await deriveFromPrivateKey(trimmed);
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
  }, [tab, mnemonic, hexKey, connectDevMode]);

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
            <div className="w-9 h-9 rounded-lg bg-yellow-600/20 border border-yellow-600/30 flex items-center justify-center">
              <Key size={18} className="text-yellow-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">TN12 Dev Wallet</h3>
              <p className="text-[10px] text-yellow-500/80 font-mono uppercase tracking-wider">
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
          {/* WASM loading overlay */}
          {!isWasmReady && !isConnected && (
            <div className="p-4 rounded-xl bg-yellow-600/[0.04] border border-yellow-600/20 flex items-center gap-3">
              <span className="inline-block w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-400 rounded-full animate-spin" />
              <div>
                <p className="text-sm text-yellow-400 font-semibold">Loading WASM...</p>
                <p className="text-[10px] text-yellow-500/60">
                  Initializing kaspa-wasm cryptographic module (~11MB)
                </p>
              </div>
            </div>
          )}

          {/* Already connected state */}
          {isConnected && (
            <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-mono uppercase tracking-wider">Dev Mode Active</span>
              </div>
              <p className="text-sm font-mono text-white break-all">{currentAddr}</p>
              <p className="text-[10px] text-emerald-400/50 mt-1">testnet-12 · Signing with locally-derived key</p>
              <button
                onClick={handleDisconnect}
                className="mt-3 w-full px-4 py-2 bg-red-600/10 border border-red-600/30 text-red-400 hover:bg-red-600/20 text-sm font-bold rounded-lg transition-all"
              >
                Disconnect Dev Wallet
              </button>
            </div>
          )}

          {/* Connection form (hidden when already connected) */}
          {!isConnected && (
            <>
              {/* Tab switcher */}
              <div className="flex rounded-lg bg-[#111] border border-[#1f1f1f] overflow-hidden">
                <button
                  onClick={() => { setTab('mnemonic'); setError(null); }}
                  disabled={!isWasmReady}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                    tab === 'mnemonic'
                      ? 'bg-yellow-600/20 text-yellow-400 border-b-2 border-yellow-500'
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
                      ? 'bg-yellow-600/20 text-yellow-400 border-b-2 border-yellow-500'
                      : 'text-gray-300 hover:text-gray-300'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Key size={12} className="inline mr-1" />
                  Hex Key
                </button>
              </div>

              {/* Generate New Wallet button */}
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

              {/* Mnemonic input */}
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

              {/* Hex private key input */}
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

              {/* Error */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Derived address preview */}
              {derivedAddr && !error && (
                <div className="p-3 rounded-lg bg-[#49EACB]/[0.04] border border-[#49EACB]/20">
                  <p className="text-[10px] text-[#49EACB]/60 uppercase tracking-wider">Derived Address (TN12)</p>
                  <p className="text-sm font-mono text-[#49EACB] break-all mt-1">{derivedAddr}</p>
                </div>
              )}

              {/* Connect button */}
              <button
                onClick={handleDerive}
                disabled={!isWasmReady || deriving || (tab === 'mnemonic' ? !mnemonic.trim() : !hexKey.trim())}
                className="w-full px-5 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.2)]"
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
                    Connect TN12 Dev Wallet
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
            For covenant testing only, no real funds. TN12 Testnet (Toccata).
          </p>
        </div>
      </div>
    </div>
  );
}
