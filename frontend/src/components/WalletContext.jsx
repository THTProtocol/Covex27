import { createContext, useContext, useCallback, useState, useEffect } from 'react';
import {
  KaspaWalletProvider as KasFlowProvider,
  kaswareAdapter,
  useWallet as useKasFlowWallet,
} from '@kasflow/wallet-connector/react';

const WalletContext = createContext(null);

const KASPA_NETWORK = 'kaspatest';
const REQUIRED_NETWORK = 'testnet-12';

// Wallet logo paths — point to real PNG assets in /public/wallets/
const WALLET_LOGOS = {
  kasware: '/wallets/kasware.png',
  kaspium: '/wallets/kaspium.png',
  kastle: '/wallets/kastle.png',
  kdx: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#0D1117"/><rect x="8" y="12" width="32" height="24" rx="2" fill="none" stroke="#58A6FF" stroke-width="2"/><rect x="12" y="16" width="24" height="14" rx="1" fill="#58A6FF" opacity="0.2"/><path d="M18 24h12" stroke="#58A6FF" stroke-width="2" stroke-linecap="round"/><rect x="14" y="36" width="20" height="3" rx="1.5" fill="#30363D"/></svg>'
  ),
  onekey: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#1C1C1E"/><path d="M24 8a16 16 0 100 32 16 16 0 000-32zm6 16c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6 6 2.7 6 6z" fill="none" stroke="#00D4AA" stroke-width="2"/><circle cx="24" cy="24" r="3" fill="#00D4AA"/><path d="M20 24h8" stroke="#1C1C1E" stroke-width="1.5" stroke-linecap="round"/></svg>'
  ),
  kaspang: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#0a1628"/><circle cx="24" cy="24" r="14" fill="none" stroke="#49EACB" stroke-width="2"/><path d="M24 10A14 14 0 0110 24" fill="none" stroke="#E8AF34" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="#49EACB"/></svg>'
  ),
};

// Direct kasware extension detection and helpers
const getKasware = () => (typeof window !== 'undefined' && window.kasware) ? window.kasware : null;

const EXTRA_WALLETS = [
  {
    id: 'kaspium',
    name: 'Kaspium',
    url: 'https://kaspium.io',
    logo: WALLET_LOGOS.kaspium,
    detect: () => typeof window !== 'undefined' && !!window.__kaspium,
    provider: () => window.__kaspium,
  },
  {
    id: 'kastle',
    name: 'Kastle Wallet',
    url: 'https://kastle.xyz',
    logo: WALLET_LOGOS.kastle,
    detect: () => typeof window !== 'undefined' && !!window.kastle?.kaspa,
    provider: () => window.kastle?.kaspa,
  },
  {
    id: 'kdx',
    name: 'KDX Desktop',
    url: 'https://kdx.app',
    logo: WALLET_LOGOS.kdx,
    detect: () => false,
    provider: () => null,
  },
  {
    id: 'onekey',
    name: 'OneKey',
    url: 'https://onekey.so',
    logo: WALLET_LOGOS.onekey,
    detect: () => false,
    provider: () => null,
  },
  {
    id: 'web',
    name: 'Kaspa Web Wallet',
    url: 'https://wallet.kaspanet.io',
    logo: WALLET_LOGOS.kaspang,
    detect: () => false,
    provider: () => null,
  },
];

function WalletBridge({ children }) {
  const kf = useKasFlowWallet();

  // Direct kasware state
  const [kaswareAddress, setKaswareAddress] = useState(null);
  const [kaswareBalance, setKaswareBalance] = useState(null);
  const [kaswareNetwork, setKaswareNetwork] = useState(null);
  const [kaswareConnecting, setKaswareConnecting] = useState(false);
  const [kaswareError, setKaswareError] = useState(null);

  const kaswareDetected = getKasware() !== null;

  // Direct connect via window.kasware
  const connectKasware = useCallback(async () => {
    const kw = getKasware();
    if (!kw) throw new Error('KasWare extension not detected. Install from kasware.xyz');

    setKaswareConnecting(true);
    setKaswareError(null);

    try {
      // Network validation
      const network = await kw.getNetwork();
      setKaswareNetwork(network);
      if (network !== REQUIRED_NETWORK) {
        alert(`Wrong network detected: ${network}. Please switch to ${REQUIRED_NETWORK} in your KasWare extension settings.`);
        setKaswareConnecting(false);
        return;
      }

      // Request accounts
      const accounts = await kw.requestAccounts();
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from KasWare');
      }

      const addr = accounts[0];
      setKaswareAddress(addr);

      // Fetch balance
      try {
        const bal = await kw.getBalance();
        setKaswareBalance(bal?.available !== undefined ? Number(bal.available) : null);
      } catch (_) {
        // Balance fetch is best-effort
      }
    } catch (err) {
      setKaswareError(err.message || 'Failed to connect to KasWare');
    } finally {
      setKaswareConnecting(false);
    }
  }, []);

  const disconnectKasware = useCallback(() => {
    setKaswareAddress(null);
    setKaswareBalance(null);
    setKaswareNetwork(null);
    setKaswareError(null);
  }, []);

  // Auto-refresh balance when address is set
  useEffect(() => {
    if (!kaswareAddress) return;
    const interval = setInterval(async () => {
      const kw = getKasware();
      if (!kw) return;
      try {
        const bal = await kw.getBalance();
        setKaswareBalance(bal?.available !== undefined ? Number(bal.available) : null);
      } catch (_) {}
    }, 15000);
    return () => clearInterval(interval);
  }, [kaswareAddress]);

  // Determine active state: prefer direct kasware, fall back to KasFlow
  const activeAddress = kaswareAddress || kf.address;
  const activeBalance = kaswareAddress ? kaswareBalance : (kf.balance ? Number(kf.balance.available) : null);
  const activeConnecting = kaswareConnecting || kf.connecting;
  const activeError = kaswareError || kf.error?.message || null;

  const buildUri = useCallback((recipient, amountKas, meta = {}) => {
    const prefix = KASPA_NETWORK === 'kaspatest' ? 'kaspatest:' : 'kaspa:';
    const addr = recipient.replace(/^(kaspatest:|kaspa:)/, '');
    const q = [];
    if (amountKas) q.push(`amount=${amountKas}`);
    if (meta.scriptHash) q.push(`scriptHash=${meta.scriptHash}`);
    let uri = `${prefix}${addr}`;
    if (q.length) uri += `?${q.join('&')}`;
    return uri;
  }, []);

  const sendPayment = useCallback(async (recipient, amountKas, meta = {}) => {
    // Try direct kasware first
    const kw = getKasware();
    if (kaswareAddress && kw) {
      try {
        const amountSompi = Math.floor(parseFloat(amountKas) * 100_000_000);
        const txid = await kw.sendKaspa(recipient, amountSompi);
        return { success: true, method: 'extension', txid };
      } catch (_) {
        const uri = buildUri(recipient, amountKas, meta);
        window.open(uri, '_blank');
        return { success: true, method: 'uri', uri };
      }
    }

    // Fall back to KasFlow bridge
    if (kf.connected && kf.address) {
      try {
        const amountSompi = BigInt(Math.floor(parseFloat(amountKas) * 100_000_000));
        const result = await kf.sendTransaction({ to: recipient, amount: amountSompi });
        return { success: true, method: 'extension', txid: result.txId };
      } catch (_) {
        const uri = buildUri(recipient, amountKas, meta);
        window.open(uri, '_blank');
        return { success: true, method: 'uri', uri };
      }
    }

    const uri = buildUri(recipient, amountKas, meta);
    window.open(uri, '_blank');
    return { success: true, method: 'uri', uri };
  }, [kaswareAddress, kf.connected, kf.address, kf.sendTransaction, buildUri]);

  // Merge KasFlow adapters + extra wallets into unified wallet list
  const kasflowWallets = (kf.adapters || []).map(a => ({
    id: a.metadata.name,
    name: a.metadata.displayName,
    url: a.metadata.url,
    logo: a.metadata.icon || WALLET_LOGOS[a.metadata.name] || '',
    detect: () => a.readyState === 'installed',
    provider: () => a,
  }));

  // Only add extra wallets that aren't already in the KasFlow adapter list
  const kasflowIds = new Set(kasflowWallets.map(w => w.id));
  const extraFiltered = EXTRA_WALLETS.filter(w => !kasflowIds.has(w.id));

  const allWallets = [...kasflowWallets, ...extraFiltered];

  const value = {
    // Active wallet info
    activeWallet: activeAddress
      ? { id: 'kasware', name: 'KasWare Wallet' }
      : (kf.currentAdapter
        ? { id: kf.currentAdapter.metadata.name, name: kf.currentAdapter.metadata.displayName }
        : null),
    address: activeAddress,
    balance: activeBalance,
    connecting: activeConnecting,
    error: activeError,
    network: KASPA_NETWORK,

    // Direct kasware info
    kaswareDetected,
    kaswareNetwork,

    // Modal state
    showModal: kf.isModalOpen,
    setShowModal: (v) => v ? kf.openModal() : kf.closeModal(),

    // Connection actions
    connect: async (id) => {
      if (id === 'kasware' && kaswareDetected) {
        await connectKasware();
      } else {
        await kf.connect(id);
      }
    },
    disconnect: () => {
      disconnectKasware();
      kf.disconnect();
    },

    // Payment / signing
    sendPayment,
    sendKaspa: async (recipient, amountSompi) => {
      const kw = getKasware();
      if (!kw || !kaswareAddress) throw new Error('KasWare not connected');
      return await kw.sendKaspa(recipient, amountSompi);
    },
    signMessage: async (message) => {
      const kw = getKasware();
      if (!kw || !kaswareAddress) throw new Error('KasWare not connected');
      return await kw.signMessage(message);
    },
    signTransaction: async () => {
      throw new Error('signTransaction not implemented via KasFlow bridge');
    },
    buildUri,
    refreshBalance: async () => {
      const kw = getKasware();
      if (kw && kaswareAddress) {
        try {
          const bal = await kw.getBalance();
          setKaswareBalance(bal?.available !== undefined ? Number(bal.available) : null);
        } catch (_) {}
      }
      kf.refreshBalance();
    },

    wallets: allWallets,
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
        network: 'testnet-10',
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
