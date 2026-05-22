import { createContext, useContext, useCallback, useState, useEffect } from 'react';
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

const DESKTOP_WALLETS = ['KasWare', 'Kastle', 'Kasperia', 'OKX', 'KaspaCom'];
const MOBILE_WALLETS = ['Kasanova', 'Kaspium', 'OKX', 'KaspaCom', 'Tangem'];
function isMobile() { return typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }

// ── All wallets unified ──
const ALL_WALLETS = [
  {
    id: 'KasWare',
    name: 'KasWare Wallet',
    url: WALLET_INSTALL_URLS.KasWare,
    logo: WALLET_LOGOS.KasWare,
    sub: 'Chrome · Firefox',
    detect: () => detectWallet('KasWare'),
    provider: () => getProvider('KasWare'),
    recommended: true,
  },
  {
    id: 'Kastle',
    name: 'Kastle',
    url: WALLET_INSTALL_URLS.Kastle,
    logo: WALLET_LOGOS.Kastle,
    sub: 'Chrome',
    detect: () => detectWallet('Kastle'),
    provider: () => getProvider('Kastle'),
  },
  {
    id: 'Kasperia',
    name: 'Kasperia',
    url: WALLET_INSTALL_URLS.Kasperia,
    logo: WALLET_LOGOS.Kasperia,
    sub: 'Chrome',
    detect: () => detectWallet('Kasperia'),
    provider: () => getProvider('Kasperia'),
  },
  {
    id: 'OKX',
    name: 'OKX Wallet',
    url: WALLET_INSTALL_URLS.OKX,
    logo: WALLET_LOGOS.OKX,
    sub: 'Chrome · Mobile',
    detect: () => detectWallet('OKX'),
    provider: () => getProvider('OKX'),
  },
  {
    id: 'Kasanova',
    name: 'Kasanova',
    url: WALLET_INSTALL_URLS.Kasanova,
    logo: WALLET_LOGOS.Kasanova,
    sub: 'iOS · Android',
    detect: () => detectWallet('Kasanova'),
    provider: () => getProvider('Kasanova'),
  },
  {
    id: 'Kaspium',
    name: 'Kaspium',
    url: WALLET_INSTALL_URLS.Kaspium,
    logo: WALLET_LOGOS.Kaspium,
    sub: 'iOS · Android',
    detect: () => detectWallet('Kaspium'),
    provider: () => getProvider('Kaspium'),
  },
  {
    id: 'KaspaCom',
    name: 'Kaspa Web Wallet',
    url: WALLET_INSTALL_URLS.KaspaCom,
    logo: WALLET_LOGOS.KaspaCom,
    sub: 'Web · Mobile',
    detect: () => detectWallet('KaspaCom'),
    provider: () => getProvider('KaspaCom'),
  },
  {
    id: 'Tangem',
    name: 'Tangem',
    url: WALLET_INSTALL_URLS.Tangem,
    logo: WALLET_LOGOS.Tangem,
    sub: 'iOS · Android',
    detect: () => detectWallet('Tangem'),
    provider: () => getProvider('Tangem'),
  },
];

function WalletBridge({ children }) {
  const kf = useKasFlowWallet();

  // Direct extension state (primary path)
  const [activeAddress, setActiveAddress] = useState(null);
  const [activeBalance, setActiveBalance] = useState(null);
  const [activeNetwork, setActiveNetwork] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async (walletId) => {
    const wallet = ALL_WALLETS.find(w => w.id === walletId);
    if (!wallet) return;

    const detected = wallet.detect();
    if (!detected) {
      // Not installed — open install page
      window.open(wallet.url, '_blank');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const provider = wallet.provider();
      if (!provider) throw new Error('Provider not available');

      // Get accounts
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
        throw new Error('No accounts returned');
      }

      const addr = accounts[0];
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
          console.warn(`[Covex] Network mismatch: ${net} — expected ${REQUIRED_NETWORK}`);
        }
      } catch (_) {}

      // Get balance
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
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setActiveAddress(null);
    setActiveBalance(null);
    setActiveNetwork(null);
    setError(null);
  }, []);

  // Auto-refresh balance
  useEffect(() => {
    if (!activeAddress) return;
    const wallet = ALL_WALLETS.find(w => w.detect());
    if (!wallet) return;
    const interval = setInterval(async () => {
      try {
        const provider = wallet.provider();
        if (!provider) return;
        let bal;
        if (typeof provider.getBalance === 'function') {
          bal = await provider.getBalance();
        }
        if (bal) {
          const available = bal.available !== undefined ? Number(bal.available)
            : bal.confirmed !== undefined ? Number(bal.confirmed) : null;
          setActiveBalance(available);
        }
      } catch (_) {}
    }, 15000);
    return () => clearInterval(interval);
  }, [activeAddress]);

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

  const sendPayment = useCallback(async (recipient, amountKas, meta = {}) => {
    const wallet = ALL_WALLETS.find(w => w.detect());
    const provider = wallet ? wallet.provider() : null;

    if (provider && activeAddress) {
      try {
        const amountSompi = BigInt(Math.floor(parseFloat(amountKas) * 100_000_000));
        let txid;
        if (typeof provider.sendKaspa === 'function') {
          txid = await provider.sendKaspa(recipient, amountSompi);
        } else if (typeof provider.sendTransaction === 'function') {
          const result = await provider.sendTransaction({ to: recipient, amount: amountSompi });
          txid = result.txId || result.txid;
        } else if (typeof provider.request === 'function') {
          const result = await provider.request({
            method: 'sendTransaction',
            params: { to: recipient, amount: String(amountSompi) },
          });
          txid = result.txId || result.txid;
        }
        if (txid) return { success: true, method: 'extension', txid };
      } catch (_) {
        // Fall through to URI
      }
    }

    // Also try KasFlow bridge
    if (kf.connected && kf.address) {
      try {
        const amountSompi = BigInt(Math.floor(parseFloat(amountKas) * 100_000_000));
        const result = await kf.sendTransaction({ to: recipient, amount: amountSompi });
        return { success: true, method: 'kasflow', txid: result.txId };
      } catch (_) {}
    }

    const uri = buildUri(recipient, amountKas, meta);
    window.open(uri, '_blank');
    return { success: true, method: 'uri', uri };
  }, [activeAddress, kf, buildUri]);

  // Get active wallet list (filtered by mobile/desktop)
  const targetList = isMobile() ? MOBILE_WALLETS : DESKTOP_WALLETS;
  const activeWallets = ALL_WALLETS.filter(w => targetList.includes(w.id));

  const value = {
    address: activeAddress,
    balance: activeBalance,
    connecting: connecting || kf.connecting,
    error: error || kf.error?.message || null,
    network: activeNetwork || KASPA_NETWORK,

    // Wallet list for UI
    wallets: activeWallets,
    allWallets: ALL_WALLETS,

    // Connection
    connect: connectWallet,
    disconnect: disconnectWallet,

    // Payment
    sendPayment,
    sendKaspa: async (recipient, amountSompi) => {
      const wallet = ALL_WALLETS.find(w => w.detect());
      const p = wallet ? wallet.provider() : null;
      if (!p || !activeAddress) throw new Error('No wallet connected');
      if (typeof p.sendKaspa === 'function') return await p.sendKaspa(recipient, amountSompi);
      throw new Error('sendKaspa not available on this wallet');
    },
    signMessage: async (message) => {
      const wallet = ALL_WALLETS.find(w => w.detect());
      const p = wallet ? wallet.provider() : null;
      if (!p || !activeAddress) throw new Error('No wallet connected');
      if (typeof p.signMessage === 'function') return await p.signMessage(message);
      if (typeof p.request === 'function') return await p.request({ method: 'signMessage', params: { message } });
      throw new Error('signMessage not available on this wallet');
    },
    signTransaction: async () => {
      throw new Error('signTransaction not implemented');
    },
    buildUri,
    refreshBalance: async () => {
      const wallet = ALL_WALLETS.find(w => w.detect());
      if (!wallet || !activeAddress) return;
      const p = wallet.provider();
      if (!p) return;
      try {
        let bal;
        if (typeof p.getBalance === 'function') bal = await p.getBalance();
        if (bal) setActiveBalance(bal.available !== undefined ? Number(bal.available) : Number(bal.confirmed || 0));
      } catch (_) {}
    },
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
