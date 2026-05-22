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

function WalletBridge({ children }) {
  const kf = useKasFlowWallet();

  // ── State: connected wallet identity (stores WHICH wallet, not just address) ──
  const [activeWalletId, setActiveWalletId] = useState(null);     // 'KasWare' | 'Kastle' | null
  const [activeAddress, setActiveAddress] = useState(null);
  const [activeBalance, setActiveBalance] = useState(null);
  const [activeNetwork, setActiveNetwork] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const balanceTimerRef = useRef(null);

  // ── Resolve active wallet/provider from connected ID (not detect-guessing) ──
  const walletMeta = activeWalletId ? ALL_WALLETS.find(w => w.id === activeWalletId) : null;

  function getActiveProvider() {
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

      // Get accounts — try multiple provider APIs
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
  }, [kf]);

  // ── Auto-refresh balance every 15s ──
  useEffect(() => {
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    if (!activeAddress) return;

    balanceTimerRef.current = setInterval(() => {
      const provider = getActiveProvider();
      if (provider) refreshBalanceForProvider(provider);
    }, 15000);

    return () => {
      if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    };
  }, [activeAddress, activeWalletId]);

  // ── Auto-connect on mount if wallet was previously connected ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Check if any wallet is already authorized (kasware auto-detection)
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

  // ── Send payment (uses connected wallet's provider, not detect-guess) ──
  const sendPayment = useCallback(async (recipient, amountKas, meta = {}) => {
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
  }, [activeAddress, activeWalletId, kf, buildUri]);

  // ── Sign message ──
  const signMessage = useCallback(async (message) => {
    const provider = getActiveProvider();
    if (!provider || !activeAddress) throw new Error('No wallet connected');

    if (typeof provider.signMessage === 'function') return await provider.signMessage(message);
    if (typeof provider.request === 'function') return await provider.request({ method: 'signMessage', params: { message } });
    throw new Error('signMessage not available on this wallet');
  }, [activeAddress, activeWalletId]);

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

    // Actions
    connect: connectWallet,
    disconnect: disconnectWallet,
    sendPayment,
    signMessage,
    sendKaspa: async (recipient, amountSompi) => {
      const provider = getActiveProvider();
      if (!provider || !activeAddress) throw new Error('No wallet connected');
      if (typeof provider.sendKaspa === 'function') return await provider.sendKaspa(recipient, amountSompi);
      throw new Error('sendKaspa not supported');
    },
    buildUri,
    refreshBalance: async () => {
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
        autoConnect: true,
        adapters: [kaswareAdapter()],
      }}
    >
      <WalletBridge>
        {children}
      </WalletBridge>
    </KasFlowProvider>
  );
}
