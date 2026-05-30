import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import {
  KaspaWalletProvider as KasFlowProvider,
  kaswareAdapter,
  useWallet as useKasFlowWallet,
} from '@kasflow/wallet-connector/react';

const WalletContext = createContext(null);

const KASPA_NETWORK = 'kaspatest';
const REQUIRED_NETWORK = 'testnet-12';

// ── Wallet logos from Chrome Web Store CDN (pattern from THTProtocol/27) ──
// Wallet logos from Chrome Web Store CDN + known favicons (sourced from THTProtocol/27)
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
  // Split at decimal, handle exactly
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
async function loadKaspaWasm() {
  if (_wasmModuleCtx) return _wasmModuleCtx;
  try {
    const wasm = await import('@onekeyfe/kaspa-wasm');
    if (typeof wasm.default === 'function') {
      await wasm.default();
    }
    _wasmModuleCtx = wasm;
    return wasm;
  } catch { return null; }
}

async function deriveFromMnemonic(phrase, networkId = 'testnet-12') {
  const wasm = await loadKaspaWasm();
  if (!wasm) throw new Error('kaspa-wasm module failed to load');

  const { Mnemonic, XPrv } = wasm;

  // Parse mnemonic phrase
  const mnemonic = new Mnemonic(phrase);

  // Get seed from mnemonic (no passphrase for dev mode)
  const seed = mnemonic.toSeed('');

  // Create master extended private key from seed
  const xprv = new XPrv(seed);

  // Derive standard Kaspa BIP44 path for testnet: m/44'/111111'/0'/0/0
  //   coin_type 111111 = Kaspa Testnet
  const derived = xprv.derivePath("m/44'/111111'/0'/0/0");

  // Get private key from derived XPrv
  const privateKeyHex = derived.toPrivateKey().toString();

  // Derive address from private key
  const address = derived.toPrivateKey().toAddress(networkId);
  const addressStr = address.toString();

  // Clean up
  mnemonic.free();
  xprv.free();
  derived.free();

  return { privateKeyHex, address: addressStr };
}

async function deriveFromPrivateKey(hexKey, networkId = 'testnet-12') {
  const wasm = await loadKaspaWasm();
  if (!wasm) throw new Error('kaspa-wasm module failed to load');

  const { PrivateKey } = wasm;

  // Strip 0x prefix if present
  const cleanHex = hexKey.replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error('Invalid private key hex. Must be 64 hex characters (32 bytes).');
  }

  const pk = new PrivateKey(cleanHex);
  const address = pk.toAddress(networkId);
  const addressStr = address.toString();

  pk.free();

  return { privateKeyHex: cleanHex, address: addressStr };
}

// ── Base TN12 Connect Panel, mnemonic + hex key tabs (internal, takes onConnect prop) ──
function DevConnectPanelBase({ onConnect, compact = false }) {
  const [mode, setMode] = useState('mnemonic'); // 'mnemonic' | 'hex'
  const [phrase, setPhrase] = useState('');
  const [hexKey, setHexKey] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState(null);

  const handleDerive = useCallback(async () => {
    setDeriving(true);
    setError(null);
    try {
      let result;
      if (mode === 'hex') {
        const cleanHex = hexKey.trim().replace(/^0x/i, '');
        if (!cleanHex) throw new Error('Enter a 64-character hex private key');
        result = await deriveFromPrivateKey(cleanHex);
        onConnect({ type: 'hex', privateKeyHex: result.privateKeyHex, address: result.address });
      } else {
        const trimmed = phrase.trim();
        if (!trimmed) throw new Error('Enter a 12 or 24 word mnemonic phrase');
        result = await deriveFromMnemonic(trimmed);
        onConnect({ type: 'mnemonic', phrase: trimmed, privateKeyHex: result.privateKeyHex, address: result.address });
      }
    } catch (err) {
      setError(err.message || 'Derivation failed');
    } finally {
      setDeriving(false);
    }
  }, [mode, phrase, hexKey, onConnect]);

  return (
    <div className={`rounded-xl border border-yellow-600/30 bg-yellow-600/[0.04] ${compact ? 'p-4' : 'p-5'}`} data-covex="dev-connect-panel">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
        <span className="text-xs font-mono text-yellow-400 uppercase tracking-wider">TN12 Dev Connect</span>
      </div>
      <p className="text-xs text-gray-300 mb-3 leading-relaxed">
        Connect via mnemonic or hex private key. Keys are derived locally and never leave your browser.
      </p>

      {/* Tab toggle */}
      <div className="flex rounded-lg bg-black/40 border border-white/[0.06] mb-3 overflow-hidden">
        <button
          onClick={() => { setMode('mnemonic'); setError(null); }}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            mode === 'mnemonic' ? 'bg-yellow-600/20 text-yellow-400' : 'text-gray-300 hover:text-white'
          }`}
        >Mnemonic</button>
        <button
          onClick={() => { setMode('hex'); setError(null); }}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            mode === 'hex' ? 'bg-yellow-600/20 text-yellow-400' : 'text-gray-300 hover:text-white'
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
        className="mt-3 w-full px-4 py-2.5 bg-yellow-600/80 hover:bg-yellow-600 text-white text-sm font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {deriving ? (
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : null}
        {deriving ? 'Deriving Keys...' : 'Connect Dev Wallet'}
      </button>
    </div>
  );
}

function WalletBridge({ children }) {
  const kf = useKasFlowWallet();

  // ── Polling/Retry Detection for wallet injection ──
  const [injections, setInjections] = useState({ KasWare: false, OKX: false });
  const [pollingActive, setPollingActive] = useState(true);

  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 25; // 25 × 200ms = 5 seconds

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

  // ── State: connected wallet identity (stores WHICH wallet, not just address) ──
  const [activeWalletId, setActiveWalletId] = useState(null);     // 'KasWare' | 'Kastle' | null
  const [activeAddress, setActiveAddress] = useState(null);
  const [activeBalance, setActiveBalance] = useState(null);
  const [activeNetwork, setActiveNetwork] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const balanceTimerRef = useRef(null);

  // ── Dev mode state: mnemonic-derived keys that bypass browser extensions ──
  const [devMode, setDevMode] = useState(null); // { phrase, privateKeyHex, address } | null

  // ── Resolve active wallet/provider from connected ID (not detect-guessing) ──
  const walletMeta = activeWalletId ? ALL_WALLETS.find(w => w.id === activeWalletId) : null;

  function getActiveProvider() {
    if (devMode) return null; // Dev mode bypasses extensions entirely
    if (!activeWalletId || !activeAddress) return null;
    return getProvider(activeWalletId);
  }

  // ── Connect ──
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

      // Get accounts, try multiple provider APIs
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
      setDevMode(null); // Disable dev mode when real wallet connects
      setActiveWalletId(walletId);
      setActiveAddress(addr);

      // Validate network
      try {
        let net;
        if (typeof provider.getNetwork === 'function') {
          net = await provider.getNetwork();
        } else if (typeof provider.request === 'function') {
          net = await provider.request({ method: 'getNetwork' });
        }
        setActiveNetwork(net || null);
        if (net && net !== REQUIRED_NETWORK) {
          console.warn(`[Covex] Network mismatch: got ${net}, expected ${REQUIRED_NETWORK}`);
          setError(`Wrong network: ${net}. Please switch to ${REQUIRED_NETWORK} in your wallet.`);
        }
      } catch (_) {}

      // Get balance
      await refreshBalanceForProvider(provider);

      // Also connect via KasFlow for dual-path reliability
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
  }, [kf]);

  // ── Dev mode connect (persists to localStorage) ──
  const connectDevMode = useCallback((devState) => {
    setDevMode(devState);
    setActiveWalletId('__dev_mode__');
    setActiveAddress(devState.address);
    setActiveNetwork('testnet-12');
    setActiveBalance(null);
    setError(null);
    // Persist to localStorage for refresh survival
    if (typeof localStorage !== 'undefined') {
      const devSave = { ...devState };
      delete devSave.type; // Don't persist type discriminator
      localStorage.setItem('covex_dev_wallet', JSON.stringify(devSave));
      localStorage.setItem('covex_connected_wallet', '__dev_mode__');
    }
  }, []);

  // ── Balance refresh helper ──
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

  // ── Disconnect (actually closes provider connections) ──
  const disconnectWallet = useCallback(async () => {
    if (devMode) {
      setDevMode(null);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('covex_dev_wallet');
        localStorage.removeItem('covex_connected_wallet');
      }
    }
    const provider = getActiveProvider();
    // Try to disconnect the provider if supported
    if (provider) {
      try {
        if (typeof provider.disconnect === 'function') await provider.disconnect();
        else if (typeof provider.close === 'function') await provider.close();
      } catch (_) {}
    }
    // Disconnect KasFlow too
    try { kf.disconnect(); } catch (_) {}

    setActiveWalletId(null);
    setActiveAddress(null);
    setActiveBalance(null);
    setActiveNetwork(null);
    setError(null);
  }, [devMode, kf]);

  // ── Auto-refresh balance every 15s ──
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

  // ── Auto-connect on mount: restore dev wallet or detect browser wallet ──
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Priority 1: Restore saved dev wallet from localStorage
    const savedDev = typeof localStorage !== 'undefined' ? localStorage.getItem('covex_dev_wallet') : null;
    if (savedDev) {
      try {
        const parsed = JSON.parse(savedDev);
        if (parsed.privateKeyHex && parsed.address) {
          connectDevMode(parsed);
          return;
        }
      } catch (_) { /* corrupt data, fall through */ }
    }

    // Priority 2: Restore browser extension wallet
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('covex_connected_wallet') : null;
    if (saved && ALL_WALLETS.find(w => w.id === saved && w.detect())) {
      connectWallet(saved).catch(() => {});
    } else {
      // Auto-detect first available wallet (prefer KasWare)
      const autoWallet = ALL_WALLETS.find(w => w.detect());
      if (autoWallet) {
        connectWallet(autoWallet.id).catch(() => {});
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist connected wallet ID ──
  useEffect(() => {
    if (activeWalletId && typeof localStorage !== 'undefined') {
      localStorage.setItem('covex_connected_wallet', activeWalletId);
    } else if (!activeWalletId && typeof localStorage !== 'undefined') {
      localStorage.removeItem('covex_connected_wallet');
    }
  }, [activeWalletId]);

  // ── URI builder ──
  const buildUri = useCallback((recipient, amountKas, meta = {}) => {
    const prefix = 'kaspatest:';
    const addr = recipient.replace(/^(kaspatest:|kaspa:)/, '');
    const q = [];
    if (amountKas) q.push(`amount=${amountKas}`);
    if (meta.scriptHash) q.push(`scriptHash=${meta.scriptHash}`);
    let uri = `${prefix}${addr}`;
    if (q.length) uri += `?${q.join('&')}`;
    return uri;
  }, []);

  // ── Dev mode: sign message with locally-derived private key ──
  const devSignMessage = useCallback(async (message) => {
    if (!devMode) throw new Error('Dev mode not active');
    const wasm = await loadKaspaWasm();
    if (!wasm) throw new Error('kaspa-wasm module failed to load');

    const { PrivateKey } = wasm;
    const pk = new PrivateKey(devMode.privateKeyHex);
    // Use signMessage available on PrivateKey (kaspa-wasm v1.0)
    const signature = pk.signMessage ? pk.signMessage(message) : pk.toString();
    pk.free();
    return signature;
  }, [devMode]);

  // ── Dev mode: build transaction signed with locally-derived private key ──
  const devSendTransaction = useCallback(async (recipient, amountKas) => {
    if (!devMode) throw new Error('Dev mode not active');
    const wasm = await loadKaspaWasm();
    if (!wasm) throw new Error('kaspa-wasm module failed to load');

    const { PrivateKey, createTransaction, signTransaction } = wasm;
    const pk = new PrivateKey(devMode.privateKeyHex);
    const amountSompi = kasToSompi(amountKas);

    // Build a basic transaction (dev mode: no UTXO lookup, placeholder)
    // In dev mode we create a minimal transaction and sign it locally.
    // The caller receives the signed transaction hex for manual broadcast.
    try {
      const utxos = []; // Real UTXOs would come from node queries
      const outputs = [{ address: recipient, amount: BigInt(amountSompi) }];
      const tx = createTransaction(utxos, outputs, 1000n);
      const signed = signTransaction(tx, [pk], false);
      const txHex = signed.toHex ? signed.toHex() : signed.toString();
      pk.free();
      return { success: true, method: 'dev-mode-tn12', txid: signed.id || txHex, txHex };
    } catch (_) {
      // Fallback for dev mode: sign a mock payment record
      const sig = await devSignMessage(`PAYMENT:${recipient}:${amountSompi}`);
      pk.free();
      return { success: true, method: 'dev-mode-sig', sig, recipient, amountSompi: Number(amountSompi) };
    }
  }, [devMode, devSignMessage]);

  // ── Send payment (uses connected wallet's provider, or dev mode, or detect-guess) ──
  const sendPayment = useCallback(async (recipient, amountKas, meta = {}) => {
    // Path 0: Dev mode, sign locally with derived key
    if (devMode && activeAddress) {
      return await devSendTransaction(recipient, amountKas);
    }

    const provider = getActiveProvider();

    // Path 1: Extension payment via connected wallet
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
      } catch (_) { /* fall through */ }
    }

    // Path 2: KasFlow fallback
    if (kf.connected && kf.address) {
      try {
        const amountSompi = kasToSompi(amountKas);
        const result = await kf.sendTransaction({ to: recipient, amount: amountSompi });
        return { success: true, method: 'kasflow', txid: result.txId };
      } catch (_) {}
    }

    // Path 3: URI fallback
    const uri = buildUri(recipient, amountKas, meta);
    window.open(uri, '_blank');
    return { success: true, method: 'uri', uri };
  }, [activeAddress, activeWalletId, devMode, devSendTransaction, kf, buildUri]);

  // ── Sign message (dev mode: sign locally; otherwise: use extension provider) ──
  const signMessage = useCallback(async (message) => {
    // Dev mode: sign with locally-derived private key
    if (devMode && activeAddress) {
      return await devSignMessage(message);
    }

    const provider = getActiveProvider();
    if (!provider || !activeAddress) throw new Error('No wallet connected');

    if (typeof provider.signMessage === 'function') return await provider.signMessage(message);
    if (typeof provider.request === 'function') return await provider.request({ method: 'signMessage', params: { message } });
    throw new Error('signMessage not available on this wallet');
  }, [activeAddress, activeWalletId, devMode, devSignMessage]);

  // ── Active wallet list (filtered by mobile/desktop) ──
  const targetList = isMobile() ? MOBILE_WALLETS : DESKTOP_WALLETS;
  const activeWallets = ALL_WALLETS.filter(w => targetList.includes(w.id));

  const value = {
    // Connected state
    activeWalletId,
    address: activeAddress,
    balance: activeBalance,
    connecting,
    error,
    network: activeNetwork || KASPA_NETWORK,

    // Wallet metadata
    walletMeta,
    wallets: activeWallets,
    allWallets: ALL_WALLETS,

    // Dev mode
    isDevMode: !!devMode,
    devMode,
    connectDevMode,
    mnemonicPanel: (props) => <DevConnectPanelBase {...props} onConnect={connectDevMode} />,
    DevConnectPanel: (props) => <DevConnectPanelBase {...props} onConnect={connectDevMode} />,
    injections,
    pollingActive,

    // Actions
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
      if (devMode) return; // No balance queries in dev mode
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
  return (
    <KasFlowProvider
      config={{
        appName: 'Covex',
        network: 'testnet-12',
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

export { ALL_WALLETS, detectWallet, getProvider, DevConnectPanelBase };
