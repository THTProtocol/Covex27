import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import wasmBinaryUrl from '@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin?url';
import {
  KaspaWalletProvider as KasFlowProvider,
  kaswareAdapter,
  useWallet as useKasFlowWallet,
} from '@kasflow/wallet-connector/react';

const WalletContext = createContext(null);

// ── Network-aware helpers ──
export function getCurrentNetwork() {
  if (typeof window === 'undefined') return 'testnet-12';
  return localStorage.getItem('kaspaNetwork') || 'testnet-12';
}

export function onNetworkChange(fn) {
  const handler = (e) => {
    const net = e?.detail || localStorage.getItem('kaspaNetwork') || 'testnet-12';
    fn(net);
  };
  window.addEventListener('kaspa-network-change', handler);
  // Also listen to regular storage changes (for other tabs)
  const storageHandler = () => {
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
    fn(net);
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener('kaspa-network-change', handler);
    window.removeEventListener('storage', storageHandler);
  };
}

const NETWORK_LABELS = {
  'testnet-12': 'TN12 (Toccata)',
  'testnet-10': 'TN10',
  'mainnet': 'MAINNET',
  'mainnet-1': 'MAINNET',
};

function getDevStorageKey(net) {
  const safe = String(net || 'testnet-12').replace(/[^a-z0-9_-]/gi, '_');
  return `covex_dev_wallet_${safe}`;
}

// ── Wallet logos from Chrome Web Store CDN (pattern from THTProtocol/27) ──
const WALLET_LOGOS = {
  KasWare:  'https://lh3.googleusercontent.com/GWR2Bode3QAzDrsZJHVRsYhCN60azRCtL1xoOBxqCYcDpbMD_avwiFkuiAOAkuyLnEh9DGOAoZSbWDcNUhiZ7X6RZE8=s128',
  Kastle:   'https://lh3.googleusercontent.com/byDg7ykj9UUJRur0v8jFr9orcj7N1_M6LuqtwnJxlnVNk4GV0JrhFmS0Xp0U9QRgxGZa4wf7-8M29v7kfEBc-Ha9kg=s128',
  Kasperia: 'https://lh3.googleusercontent.com/b08QPuruZqIwLRmpcTrN54hmxY6YEQgVKS4y1s7LAYiIulTlZAaxvsWRUK2SIivLecsxgoCuoH66jNLnQLzjMWXtFr0=s128',
  OKX:      'https://lh3.googleusercontent.com/2bBevW79q6gRZTFdm42CzUetuEKndq4fn41HQGknMpKMF_d-Ae2sJJzgfFUAVb1bJKCBb4ptZ9EAPp-QhWYIvc35yw=s128',
  Kasanova: 'https://kasanova.app/favicon.ico',
  Kaspium:  'https://kaspium.io/favicon.ico',
  KaspaCom: 'https://wallet.kaspa.com/favicon.ico',
  Tangem:   'https://tangem.com/favicon.ico',
};

const WALLET_INSTALL_URLS = {
  KasWare:  'https://chromewebstore.google.com/detail/kasware-wallet/hklhheigdmpoolooomdihmhlpjjdbklf',
  Kastle:   'https://chromewebstore.google.com/detail/kastle/oambclflhjfppdmkghokjmpppmaebego',
  Kasperia: 'https://chromewebstore.google.com/detail/kasperia/ffalcabgggegkejjlknofllbaledgcob',
  OKX:      'https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
  Kasanova: 'https://kasanova.app',
  Kaspium:  'https://kaspium.io',
  KaspaCom: 'https://wallet.kaspa.com',
  Tangem:   'https://tangem.com/kaspa',
};

// ── Detection logic matching THTProtocol/27 _det() ──
function detectWallet(name) {
  if (typeof window === 'undefined') return false;
  const w = window;
  switch (name) {
    case 'KasWare':  return !!(w.kasware || w.kasWare);
    case 'Kastle':   return !!w.kastle;
    case 'Kasperia': return !!w.kasperia;
    case 'OKX':      return !!(w.okxwallet && w.okxwallet.kaspa);
    case 'Kasanova': return !!(w.kasanova && (w.kasanova.kasware || w.kasanova.requestAccounts));
    case 'Kaspium':  return !!(w.kaspium || w.KaspiumWallet);
    case 'KaspaCom': return !!(w.kaspacom || (w.kaspa && typeof w.kaspa.connect === 'function'));
    case 'Tangem':   return !!(w.tangem || w.tangemWallet);
    default:         return false;
  }
}

function getProvider(name) {
  if (typeof window === 'undefined') return null;
  const w = window;
  switch (name) {
    case 'KasWare':  return w.kasware || w.kasWare;
    case 'Kastle':   return w.kastle;
    case 'Kasperia': return w.kasperia;
    case 'OKX':      return (w.okxwallet && w.okxwallet.kaspa) ? w.okxwallet.kaspa : null;
    case 'Kasanova': return w.kasanova;
    case 'Kaspium':  return w.kaspium || w.KaspiumWallet;
    case 'KaspaCom': return w.kaspacom || w.kaspa;
    case 'Tangem':   return w.tangem || w.tangemWallet;
    default:         return null;
  }
}

// ── KAS → sompi conversion (BigInt-safe, no float precision loss) ──
function kasToSompi(amountKas) {
  const [whole = '0', frac = ''] = String(amountKas).split('.');
  const paddedFrac = (frac + '00000000').slice(0, 8);
  return BigInt(whole) * 100_000_000n + BigInt(paddedFrac);
}

const DESKTOP_WALLETS = ['KasWare', 'Kastle', 'Kasperia', 'OKX', 'KaspaCom'];
const MOBILE_WALLETS = ['Kasanova', 'Kaspium', 'OKX', 'KaspaCom', 'Tangem'];
function isMobile() { return typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }

// ── All wallets unified ──
const ALL_WALLETS = [
  { id: 'KasWare', name: 'KasWare Wallet', url: WALLET_INSTALL_URLS.KasWare, logo: WALLET_LOGOS.KasWare, sub: 'Chrome · Firefox', detect: () => detectWallet('KasWare'), provider: () => getProvider('KasWare'), recommended: true },
  { id: 'Kastle', name: 'Kastle', url: WALLET_INSTALL_URLS.Kastle, logo: WALLET_LOGOS.Kastle, sub: 'Chrome', detect: () => detectWallet('Kastle'), provider: () => getProvider('Kastle') },
  { id: 'Kasperia', name: 'Kasperia', url: WALLET_INSTALL_URLS.Kasperia, logo: WALLET_LOGOS.Kasperia, sub: 'Chrome', detect: () => detectWallet('Kasperia'), provider: () => getProvider('Kasperia') },
  { id: 'OKX', name: 'OKX Wallet', url: WALLET_INSTALL_URLS.OKX, logo: WALLET_LOGOS.OKX, sub: 'Chrome · Mobile', detect: () => detectWallet('OKX'), provider: () => getProvider('OKX') },
  { id: 'Kasanova', name: 'Kasanova', url: WALLET_INSTALL_URLS.Kasanova, logo: WALLET_LOGOS.Kasanova, sub: 'iOS · Android', detect: () => detectWallet('Kasanova'), provider: () => getProvider('Kasanova') },
  { id: 'Kaspium', name: 'Kaspium', url: WALLET_INSTALL_URLS.Kaspium, logo: WALLET_LOGOS.Kaspium, sub: 'iOS · Android', detect: () => detectWallet('Kaspium'), provider: () => getProvider('Kaspium') },
  { id: 'KaspaCom', name: 'Kaspa Web Wallet', url: WALLET_INSTALL_URLS.KaspaCom, logo: WALLET_LOGOS.KaspaCom, sub: 'Web · Mobile', detect: () => detectWallet('KaspaCom'), provider: () => getProvider('KaspaCom') },
  { id: 'Tangem', name: 'Tangem', url: WALLET_INSTALL_URLS.Tangem, logo: WALLET_LOGOS.Tangem, sub: 'iOS · Android', detect: () => detectWallet('Tangem'), provider: () => getProvider('Tangem') },
];

let _wasmModuleCtx = null;
let _wasmInitPromise = null;

export async function loadKaspaWasm() {
  if (_wasmModuleCtx) return _wasmModuleCtx;
  if (_wasmInitPromise) return _wasmInitPromise;

  _wasmInitPromise = (async () => {
    try {
      const mod = await import('@onekeyfe/kaspa-wasm');
      // initSync needs a compiled WebAssembly module directly
      // default() calls __wbg_init which internally does require("./kaspa_bg.wasm.js")
      // That CJS require fails in Vite's browser bundle
      // Instead: use the imported wasm URL, fetch+compile it, then call initSync
      if (typeof mod.initSync === 'function' && wasmBinaryUrl) {
        try {
          const resp = await fetch(wasmBinaryUrl);
          if (resp.ok) {
            const bytes = await resp.arrayBuffer();
            const compiled = await WebAssembly.compile(bytes);
            mod.initSync(compiled);
            _wasmModuleCtx = mod;
            return _wasmModuleCtx;
          }
        } catch (_) { /* fall through to default() */ }
      }
      // initSync path may have silently failed (catch{} above suppresses the error).
      // Fallback: use default() to initialize the internal wasm global, but return
      // the MODULE (which has Mnemonic/XPrv/PrivateKey classes), NOT default()'s
      // return value (which is raw WASM exports - no class constructors on it).
      if (typeof mod.default === 'function') {
        await mod.default();         // initializes wasm global, side-effect only
        _wasmModuleCtx = mod;        // return the module with the classes
      } else {
        // Last resort: if initSync worked earlier but we somehow returned, store mod
        // (Mnemonic et al. are present on mod regardless of init path)
        _wasmModuleCtx = mod;
      }
      return _wasmModuleCtx;
    } catch (e) {
      console.error('Failed to load kaspa-wasm:', e);
      _wasmInitPromise = null;
      return null;
    }
  })();

  return _wasmInitPromise;
}

export async function deriveFromMnemonic(phrase, networkId = 'testnet-12') {
  const wasm = await loadKaspaWasm();
  if (!wasm) throw new Error('kaspa-wasm module failed to load');

  const { Mnemonic, XPrv } = wasm;

  const mnemonic = new Mnemonic(phrase);
  const seed = mnemonic.toSeed('');
  const xprv = new XPrv(seed);
  const derived = xprv.derivePath("m/44'/111111'/0'/0/0");
  const privateKeyHex = derived.toPrivateKey().toString();
  // The wasm module expects 'kaspa' or 'testnet' strings, NOT 'kaspatest'
  const addrNetwork = (networkId && (String(networkId).includes('main') || String(networkId) === 'kaspa')) ? 'kaspa' : 'testnet';
  let address = derived.toPrivateKey().toAddress(addrNetwork);
  const addressStr = address.toString();
  mnemonic.free();
  xprv.free();
  derived.free();
  return { privateKeyHex, address: addressStr };
}

export async function deriveFromPrivateKey(hexKey, networkId = 'testnet-12') {
  const wasm = await loadKaspaWasm();
  if (!wasm) throw new Error('kaspa-wasm module failed to load');

  const { PrivateKey } = wasm;
  const cleanHex = hexKey.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error('Invalid private key hex. Must be 64 hex characters (32 bytes).');
  }
  const pk = new PrivateKey(cleanHex);
  // The wasm module expects 'kaspa' or 'testnet' strings, NOT 'kaspatest'
  const addrNetwork = (networkId && (String(networkId).includes('main') || String(networkId) === 'kaspa')) ? 'kaspa' : 'testnet';
  let address = pk.toAddress(addrNetwork);
  const addressStr = address.toString();
  pk.free();
  return { privateKeyHex: cleanHex, address: addressStr };
}

// ── Dev Connect Panel (internal, takes onConnect prop + network) ──
function DevConnectPanelBase({ onConnect, compact = false, network }) {
  const [mode, setMode] = useState('mnemonic');
  const [phrase, setPhrase] = useState('');
  const [hexKey, setHexKey] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState(null);

  const netLabel = NETWORK_LABELS[network] || network;

  const handleDerive = useCallback(async () => {
    setDeriving(true);
    setError(null);
    try {
      let result;
      if (mode === 'hex') {
        const cleanHex = hexKey.trim().replace(/^0x/i, '');
        if (!cleanHex) throw new Error('Enter a 64-character hex private key');
        result = await deriveFromPrivateKey(cleanHex, network);
        onConnect({ type: 'hex', privateKeyHex: result.privateKeyHex, address: result.address });
      } else {
        const trimmed = phrase.trim();
        if (!trimmed) throw new Error('Enter a 12 or 24 word mnemonic phrase');
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount !== 12 && wordCount !== 24) throw new Error('Mnemonic must be 12 or 24 words');
        result = await deriveFromMnemonic(trimmed, network);
        onConnect({ type: 'mnemonic', phrase: trimmed, privateKeyHex: result.privateKeyHex, address: result.address });
      }
    } catch (err) {
      console.error('Dev derivation error (panel):', err);
      setError(err.message || 'Derivation failed');
    } finally {
      setDeriving(false);
    }
  }, [mode, phrase, hexKey, onConnect, network]);

  const isMainnet = network === 'mainnet' || network === 'mainnet-1';
  const accentColor = isMainnet ? 'red' : 'yellow';
  if (isMainnet) {
    return (
      <div className={`rounded-xl border border-red-500/20 bg-red-500/[0.03] ${compact ? 'p-4' : 'p-5'}`} data-covex="dev-connect-panel">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
          <span className="text-xs font-mono text-red-400 uppercase tracking-wider">MAINNET · Real Wallet Only</span>
        </div>
        <p className="text-xs text-gray-300 mb-3 leading-relaxed">
          Connect a real Kaspa wallet extension. Dev mnemonic/hex connections are not supported on mainnet. All mainnet activity uses real KAS from your connected wallet.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-${accentColor}-600/30 bg-${accentColor}-600/[0.04] ${compact ? 'p-4' : 'p-5'}`} data-covex="dev-connect-panel">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full bg-${accentColor}-500 animate-pulse`} />
        <span className={`text-xs font-mono text-${accentColor}-400 uppercase tracking-wider`}>{netLabel} Dev Connect</span>
      </div>
      <p className="text-xs text-gray-300 mb-3 leading-relaxed">
        Connect via mnemonic or hex private key. Keys are derived locally and never leave your browser.
      </p>
      <>
        <div className="flex rounded-lg bg-black/40 border border-white/[0.06] mb-3 overflow-hidden">
          <button
            onClick={() => { setMode('mnemonic'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              mode === 'mnemonic' ? `bg-${accentColor}-600/20 text-${accentColor}-400` : 'text-gray-300 hover:text-white'
            }`}
          >Mnemonic</button>
          <button
            onClick={() => { setMode('hex'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              mode === 'hex' ? `bg-${accentColor}-600/20 text-${accentColor}-400` : 'text-gray-300 hover:text-white'
            }`}
          >Hex Key</button>
        </div>

        {mode === 'mnemonic' ? (
          <textarea
            value={phrase}
            onChange={(e) => { setPhrase(e.target.value); setError(null); }}
            rows={3}
            placeholder="witch collapse practice feed shame open despair creek road again ice least"
            className="w-full px-3 py-2 text-xs font-mono bg-black/50 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-300 focus:outline-none focus:border-[#49EACB] transition-all"
            spellCheck={false} autoCapitalize="none" autoCorrect="off"
          />
        ) : (
          <input
            type="password"
            value={hexKey}
            onChange={(e) => { setHexKey(e.target.value); setError(null); }}
            placeholder="64 hex characters (32 bytes)"
            className="w-full px-3 py-2 text-xs font-mono bg-black/50 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-300 focus:outline-none focus:border-[#49EACB] transition-all"
            spellCheck={false}
          />
        )}

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <button
          onClick={handleDerive}
          disabled={deriving}
          className={`mt-3 w-full px-4 py-2.5 bg-${accentColor}-600/80 hover:bg-${accentColor}-600 text-white text-sm font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
        >
          {deriving ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {deriving ? 'Deriving Keys...' : 'Connect Dev Wallet'}
        </button>
      </>
    </div>
  );
}

function WalletBridge({ children }) {
  const kf = useKasFlowWallet();

  const [injections, setInjections] = useState({ KasWare: false, OKX: false });
  const [pollingActive, setPollingActive] = useState(true);

  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 25;
    const interval = setInterval(() => {
      attempts++;
      const kaswareDetected = detectWallet('KasWare');
      const okxDetected = detectWallet('OKX');
      setInjections(prev => {
        if (prev.KasWare === kaswareDetected && prev.OKX === okxDetected) return prev;
        return { KasWare: kaswareDetected, OKX: okxDetected };
      });
      if (attempts >= MAX_ATTEMPTS) {
        setPollingActive(false);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const [activeWalletId, setActiveWalletId] = useState(null);
  const [activeAddress, setActiveAddress] = useState(null);
  const [activeBalance, setActiveBalance] = useState(null);
  const [activeWalletNetwork, setActiveWalletNetwork] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const balanceTimerRef = useRef(null);
  const prevNetworkRef = useRef(null);

  // ── Dev mode state (must be before useEffects that reference it) ──
  const [devMode, setDevMode] = useState(null);

  // ── Track the current app-level network for dev mode derivation ──
  const [appNetwork, setAppNetwork] = useState(() => getCurrentNetwork());
  useEffect(() => onNetworkChange(setAppNetwork), []);

  // When the global network toggle changes, load the dev wallet saved for *that* specific network (separate connections for TN10 vs TN12)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getDevStorageKey(appNetwork);
    const savedDev = localStorage.getItem(key);
    if (savedDev) {
      try {
        const parsed = JSON.parse(savedDev);
        if (parsed.privateKeyHex && parsed.address) {
          setDevMode(parsed);
          setActiveWalletId('__dev_mode__');
          setActiveAddress(parsed.address);
          setActiveWalletNetwork(appNetwork);
          setActiveBalance(null);
          return;
        }
      } catch (_) {}
    } else {
      // No saved dev for this network - clear any previous devMode so we don't show stale dev connection from another network
      if (devMode) {
        setDevMode(null);
        setActiveWalletId(null);
        setActiveAddress(null);
      }
    }
  }, [appNetwork]);

  const walletMeta = activeWalletId ? ALL_WALLETS.find(w => w.id === activeWalletId) : null;

  function getActiveProvider() {
    if (devMode) return null;
    if (!activeWalletId || !activeAddress) return null;
    return getProvider(activeWalletId);
  }

  const connectWallet = useCallback(async (walletId) => {
    const wallet = ALL_WALLETS.find(w => w.id === walletId);
    if (!wallet) { setError('Unknown wallet'); return; }

    const detected = wallet.detect();
    if (!detected) {
      setError(`${wallet.name} not installed. Opening download page...`);
      window.open(wallet.url, '_blank');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const provider = wallet.provider();
      if (!provider) throw new Error('Provider not available');

      let accounts;
      if (typeof provider.requestAccounts === 'function') {
        accounts = await provider.requestAccounts();
      } else if (typeof provider.getAccount === 'function') {
        const acct = await provider.getAccount();
        accounts = acct ? [(acct.address || acct)] : [];
      } else if (typeof provider.connect === 'function') {
        await provider.connect();
        const acct = await provider.getAccount();
        accounts = acct ? [(acct.address || acct)] : [];
      } else if (typeof provider.getAddresses === 'function') {
        const addrs = await provider.getAddresses();
        accounts = addrs && addrs.length > 0 ? addrs : [];
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet');
      }

      const addr = accounts[0];
      setDevMode(null);
      setActiveWalletId(walletId);
      setActiveAddress(addr);

      try {
        let net;
        if (typeof provider.getNetwork === 'function') {
          net = await provider.getNetwork();
        } else if (typeof provider.request === 'function') {
          net = await provider.request({ method: 'getNetwork' });
        }
        setActiveWalletNetwork(net || null);
        if (net && net !== appNetwork) {
          console.warn(`[Covex] Wallet network ${net} does not match app network ${appNetwork}`);
        }
      } catch (_) {}

      await refreshBalanceForProvider(provider);

      if (walletId === 'KasWare') {
        try { await kf.connect('kasware'); } catch (_) {}
      }
    } catch (err) {
      setError(err.message || 'Connection failed');
      setActiveWalletId(null);
      setActiveAddress(null);
    } finally {
      setConnecting(false);
    }
  }, [kf, appNetwork]);

  // ── Dev mode connect (persists to localStorage, per-network for TN10/TN12) ──
  const connectDevMode = useCallback((devState) => {
    const isMain = appNetwork === 'mainnet' || appNetwork === 'mainnet-1';
    if (isMain) {
      setError('Dev mode (mnemonic/hex) is disabled on mainnet. Use a real wallet extension (KasWare etc.) with real KAS.');
      return;
    }
    setDevMode(devState);
    setActiveWalletId('__dev_mode__');
    setActiveAddress(devState.address);
    setActiveWalletNetwork(appNetwork);
    setActiveBalance(null);
    setError(null);
    if (typeof localStorage !== 'undefined') {
      const devSave = { ...devState };
      delete devSave.type;
      const key = getDevStorageKey(appNetwork);
      localStorage.setItem(key, JSON.stringify(devSave));
      localStorage.setItem('covex_connected_wallet', '__dev_mode__');
    }
  }, [appNetwork]);

  async function refreshBalanceForProvider(provider) {
    if (!provider) return;
    try {
      let bal;
      if (typeof provider.getBalance === 'function') {
        bal = await provider.getBalance();
      } else if (typeof provider.request === 'function') {
        bal = await provider.request({ method: 'getBalance' });
      }
      if (bal) {
        const available = bal.available !== undefined ? Number(bal.available)
          : bal.confirmed !== undefined ? Number(bal.confirmed)
          : null;
        setActiveBalance(available);
      }
    } catch (_) {}
  }

  const disconnectWallet = useCallback(async () => {
    if (devMode) {
      setDevMode(null);
      if (typeof localStorage !== 'undefined') {
        const key = getDevStorageKey(appNetwork);
        localStorage.removeItem(key);
        localStorage.removeItem('covex_connected_wallet');
      }
    }
    const provider = getActiveProvider();
    if (provider) {
      try {
        if (typeof provider.disconnect === 'function') await provider.disconnect();
        else if (typeof provider.close === 'function') await provider.close();
      } catch (_) {}
    }
    try { kf.disconnect(); } catch (_) {}

    setActiveWalletId(null);
    setActiveAddress(null);
    setActiveBalance(null);
    setActiveWalletNetwork(null);
    setError(null);
  }, [devMode, kf]);

  // On network switch (after mount), disconnect any real (extension) wallet because wallet connections are network-specific.
  // User will re-connect the desired wallet while the chosen network (TN12/TN10/MAIN) is active.
  useEffect(() => {
    if (prevNetworkRef.current !== null && prevNetworkRef.current !== appNetwork) {
      if (activeWalletId && activeWalletId !== '__dev_mode__' && !devMode) {
        disconnectWallet().catch(() => {});
      }
    }
    prevNetworkRef.current = appNetwork;
  }, [appNetwork, activeWalletId, devMode, disconnectWallet]);

  useEffect(() => {
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    if (!activeAddress || devMode) return;
    balanceTimerRef.current = setInterval(() => {
      const provider = getActiveProvider();
      if (provider) refreshBalanceForProvider(provider);
    }, 15000);
    return () => {
      if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    };
  }, [activeAddress, activeWalletId, devMode]);

  // Auto-connect on mount (load dev wallet for the initial network)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialNet = getCurrentNetwork();
    const savedDevKey = getDevStorageKey(initialNet);
    const savedDev = typeof localStorage !== 'undefined' ? localStorage.getItem(savedDevKey) : null;
    if (savedDev) {
      try {
        const parsed = JSON.parse(savedDev);
        if (parsed.privateKeyHex && parsed.address) {
          // set directly to avoid double save
          setDevMode(parsed);
          setActiveWalletId('__dev_mode__');
          setActiveAddress(parsed.address);
          setActiveWalletNetwork(initialNet);
          localStorage.setItem('covex_connected_wallet', '__dev_mode__');
          return;
        }
      } catch (_) {}
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('covex_connected_wallet') : null;
    if (saved && ALL_WALLETS.find(w => w.id === saved && w.detect())) {
      connectWallet(saved).catch(() => {});
    } else {
      const autoWallet = ALL_WALLETS.find(w => w.detect());
      if (autoWallet) {
        connectWallet(autoWallet.id).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (activeWalletId && typeof localStorage !== 'undefined') {
      localStorage.setItem('covex_connected_wallet', activeWalletId);
    } else if (!activeWalletId && typeof localStorage !== 'undefined') {
      localStorage.removeItem('covex_connected_wallet');
    }
  }, [activeWalletId]);

  const buildUri = useCallback((recipient, amountKas, meta = {}) => {
    const prefix = appNetwork === 'mainnet' || appNetwork === 'mainnet-1' ? 'kaspa:' : 'kaspatest:';
    const addr = recipient.replace(/^(kaspatest:|kaspa:)/, '');
    const q = [];
    if (amountKas) q.push(`amount=${amountKas}`);
    if (meta.scriptHash) q.push(`scriptHash=${meta.scriptHash}`);
    let uri = `${prefix}${addr}`;
    if (q.length) uri += `?${q.join('&')}`;
    return uri;
  }, [appNetwork]);

  const devSignMessage = useCallback(async (message) => {
    if (!devMode) throw new Error('Dev mode not active');
    const wasm = await loadKaspaWasm();
    if (!wasm) throw new Error('kaspa-wasm module failed to load');
    const { PrivateKey } = wasm;
    const pk = new PrivateKey(devMode.privateKeyHex);
    const signature = pk.signMessage ? pk.signMessage(message) : pk.toString();
    pk.free();
    return signature;
  }, [devMode]);

  const devSendTransaction = useCallback(async (recipient, amountKas) => {
    if (!devMode) throw new Error('Dev mode not active');
    const wasm = await loadKaspaWasm();
    if (!wasm) throw new Error('kaspa-wasm module failed to load');
    const { PrivateKey, createTransaction, signTransaction } = wasm;
    const pk = new PrivateKey(devMode.privateKeyHex);
    const amountSompi = kasToSompi(amountKas);
    try {
      const utxos = [];
      const outputs = [{ address: recipient, amount: BigInt(amountSompi) }];
      const tx = createTransaction(utxos, outputs, 1000n);
      const signed = signTransaction(tx, [pk], false);
      const txHex = signed.toHex ? signed.toHex() : signed.toString();
      pk.free();
      return { success: true, method: 'dev-mode', txid: signed.id || txHex, txHex };
    } catch (_) {
      const sig = await devSignMessage(`PAYMENT:${recipient}:${amountSompi}`);
      pk.free();
      return { success: true, method: 'dev-mode-sig', sig, recipient, amountSompi: Number(amountSompi) };
    }
  }, [devMode, devSignMessage]);

  const sendPayment = useCallback(async (recipient, amountKas, meta = {}) => {
    if (devMode && activeAddress) {
      const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
      // Map amount to tier for backend signer - the backend constructs real TXs
      // with actual UTXOs from kaspad, schnorr signs, and broadcasts via wRPC.
      const tier = amountKas >= 1000 ? 'MAX' : amountKas >= 500 ? 'PRO' : amountKas >= 100 ? 'BUILDER' : null;
      const tierLabel = tier || 'FREE';
      // Pure tier payment (e.g. "Pay 100 KAS" upgrade button in CovenantInteractive) sends *only* the tier fee to treasury.
      // Deployments bundle 1 KAS covenant output + tier fee in one tx. Detect via exact tier amounts + memo/recipient.
      const isPureTierPayment = !!tier && (
        (recipient || '').includes('qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m') ||
        (meta.memo || '').toLowerCase().includes('upgrade') ||
        (meta.memo || '').toLowerCase().includes('tier') ||
        (meta.description || '').toLowerCase().includes('tier payment')
      );
      try {
        const resp = await fetch('/api/sign-and-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            private_key_hex: devMode.privateKeyHex,
            deployer_addr: activeAddress,
            script_hex: isPureTierPayment ? '' : 'aa20',
            tier: tierLabel,
            covenant_name: tier ? `Covex ${tier} Tier Payment` : 'Covex Payment',
            description: meta.memo || `Tier payment: ${tierLabel}`,
            use_dev_mode: true,
            network: net,
            pure_tier_payment: isPureTierPayment,
          }),
        });
        const data = await resp.json();
        if (data.success && data.tx_id) {
          return { success: true, method: 'dev-mode-backend', txid: data.tx_id };
        }
        return { success: false, error: data.error || 'Backend signer rejected payment' };
      } catch (err) {
        return { success: false, error: err.message || 'Network error during payment broadcast' };
      }
    }
    const provider = getActiveProvider();
    if (provider && activeAddress) {
      try {
        const amountSompi = kasToSompi(amountKas);
        let txid;
        if (typeof provider.sendKaspa === 'function') {
          txid = await provider.sendKaspa(recipient, amountSompi);
        } else if (typeof provider.sendTransaction === 'function') {
          const result = await provider.sendTransaction({ to: recipient, amount: amountSompi });
          txid = result.txId || result.txid;
        } else if (typeof provider.request === 'function') {
          const result = await provider.request({ method: 'sendTransaction', params: { to: recipient, amount: String(amountSompi) } });
          txid = result.txId || result.txid;
        }
        if (txid) return { success: true, method: 'extension', txid };
      } catch (_) {}
    }
    if (kf.connected && kf.address) {
      try {
        const amountSompi = kasToSompi(amountKas);
        const result = await kf.sendTransaction({ to: recipient, amount: amountSompi });
        return { success: true, method: 'kasflow', txid: result.txId };
      } catch (_) {}
    }
    const uri = buildUri(recipient, amountKas, meta);
    window.open(uri, '_blank');
    return { success: true, method: 'uri', uri };
  }, [activeAddress, activeWalletId, devMode, devSendTransaction, kf, buildUri]);

  const signMessage = useCallback(async (message) => {
    if (devMode && activeAddress) {
      return await devSignMessage(message);
    }
    const provider = getActiveProvider();
    if (!provider || !activeAddress) throw new Error('No wallet connected');
    if (typeof provider.signMessage === 'function') return await provider.signMessage(message);
    if (typeof provider.request === 'function') return await provider.request({ method: 'signMessage', params: { message } });
    throw new Error('signMessage not available on this wallet');
  }, [activeAddress, activeWalletId, devMode, devSignMessage]);

  const targetList = isMobile() ? MOBILE_WALLETS : DESKTOP_WALLETS;
  const activeWallets = ALL_WALLETS.filter(w => targetList.includes(w.id));

  const value = {
    activeWalletId,
    address: activeAddress,
    balance: activeBalance,
    connecting,
    error,
    network: activeWalletNetwork || (appNetwork === 'mainnet' || appNetwork === 'mainnet-1' ? 'mainnet' : 'kaspatest'),
    appNetwork,

    walletMeta,
    wallets: activeWallets,
    allWallets: ALL_WALLETS,

    isDevMode: !!devMode,
    devMode,
    connectDevMode,
    mnemonicPanel: (props) => <DevConnectPanelBase {...props} onConnect={connectDevMode} network={appNetwork} />,
    DevConnectPanel: (props) => <DevConnectPanelBase {...props} onConnect={connectDevMode} network={appNetwork} />,
    injections,
    pollingActive,

    connect: connectWallet,
    disconnect: disconnectWallet,
    sendPayment,
    signMessage,
    sendKaspa: async (recipient, amountSompi) => {
      if (devMode) {
        const result = await devSendTransaction(recipient, Number(amountSompi) / 100_000_000);
        return result;
      }
      const provider = getActiveProvider();
      if (!provider || !activeAddress) throw new Error('No wallet connected');
      if (typeof provider.sendKaspa === 'function') return await provider.sendKaspa(recipient, amountSompi);
      throw new Error('sendKaspa not supported');
    },
    buildUri,
    refreshBalance: async () => {
      if (devMode) return;
      const provider = getActiveProvider();
      if (provider) await refreshBalanceForProvider(provider);
    },
    clearError: () => setError(null),
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({ children }) {
  const network = getCurrentNetwork();
  return (
    <KasFlowProvider
      config={{
        appName: 'Covex',
        network: network === 'mainnet' || network === 'mainnet-1' ? network : 'testnet-12',
        autoConnect: false,
        adapters: [kaswareAdapter()],
      }}
    >
      <WalletBridge>
        {children}
      </WalletBridge>
    </KasFlowProvider>
  );
}

export { ALL_WALLETS, detectWallet, getProvider, DevConnectPanelBase, NETWORK_LABELS };
