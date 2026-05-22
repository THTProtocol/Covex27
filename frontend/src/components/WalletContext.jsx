import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WalletContext = createContext(null);

const KASPA_NETWORK = 'kaspatest';

// Inline SVG wallet logos (for rendering in modals)
const KasWareLogoSvg = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#111"/><path d="M24 8L38 16v16L24 40 10 32V16L24 8z" fill="#49EACB" opacity="0.9"/><path d="M24 14L33 19.5v11L24 35.5 15 30.5v-11L24 14z" fill="#111"/><circle cx="24" cy="25" r="4" fill="#49EACB"/></svg>`;
const KaspiumLogoSvg = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#1a1a2e"/><defs><linearGradient id="kg2" x1="14" y1="10" x2="34" y2="38"><stop stopColor="#3B82F6"/><stop offset="1" stopColor="#8B5CF6"/></linearGradient></defs><path d="M14 24l10-14 10 14-10 14-10-14z" fill="url(#kg2)" stroke="#3B82F6" strokeWidth="1.5"/><circle cx="24" cy="24" r="5" fill="#1a1a2e" stroke="#60A5FA" strokeWidth="1.5"/></svg>`;
const KastleLogoSvg = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#0f0f1a"/><path d="M10 36V14l14-8 14 8v22H10z" fill="none" stroke="#A78BFA" strokeWidth="2"/><path d="M16 28h6v8h-6zM26 20h6v16h-6z" fill="#A78BFA" opacity="0.8"/><path d="M16 36h16" stroke="#A78BFA" strokeWidth="2"/></svg>`;
const KaspaWebLogoSvg = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#0a1628"/><circle cx="24" cy="24" r="14" fill="none" stroke="#49EACB" strokeWidth="2"/><path d="M24 10A14 14 0 0110 24" fill="none" stroke="#E8AF34" strokeWidth="2.5" strokeLinecap="round"/><path d="M13 17l7 7-7 7" fill="none" stroke="#49EACB" strokeWidth="1.5" strokeLinecap="round"/><circle cx="24" cy="24" r="3" fill="#49EACB"/></svg>`;

const WALLET_REGISTRY = [
  {
    id: 'kasware',
    name: 'KasWare',
    url: 'https://kasware.xyz',
    logo: `data:image/svg+xml,${encodeURIComponent(KasWareLogoSvg)}`,
    detect: () => typeof window !== 'undefined' && !!window.kasware,
    provider: () => window.kasware,
  },
  {
    id: 'kaspium',
    name: 'Kaspium',
    url: 'https://kaspium.io',
    logo: `data:image/svg+xml,${encodeURIComponent(KaspiumLogoSvg)}`,
    detect: () => typeof window !== 'undefined' && !!window.__kaspium,
    provider: () => window.__kaspium,
  },
  {
    id: 'kastle',
    name: 'Kastle',
    url: 'https://kastle.app',
    logo: `data:image/svg+xml,${encodeURIComponent(KastleLogoSvg)}`,
    detect: () => typeof window !== 'undefined' && !!window.kastle?.kaspa,
    provider: () => window.kastle?.kaspa,
  },
  {
    id: 'kaspa-web',
    name: 'Kaspa Web Wallet',
    url: 'https://kaspa-ng.org',
    logo: `data:image/svg+xml,${encodeURIComponent(KaspaWebLogoSvg)}`,
    detect: () => false,
    provider: () => null,
  },
  {
    id: 'uri',
    name: 'Kaspa URI',
    url: '#',
    logo: '',
    detect: () => true,
    provider: () => null,
  },
];

export function WalletProvider({ children }) {
  const [activeWallet, setActiveWallet] = useState(null);
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Auto-detect available wallets
  useEffect(() => {
    const detected = WALLET_REGISTRY.find(
      (w) => w.id !== 'uri' && w.id !== 'kaspa-web' && w.detect()
    );
    if (detected && !activeWallet) {
      setActiveWallet(detected);
    }
    const id = setInterval(() => {
      if (!activeWallet || activeWallet.id === 'uri') {
        const d = WALLET_REGISTRY.find(
          (w) => w.id !== 'uri' && w.id !== 'kaspa-web' && w.detect()
        );
        if (d) setActiveWallet(d);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [activeWallet]);

  const connect = useCallback(async (walletId) => {
    setConnecting(true);
    setError(null);
    try {
      const w = WALLET_REGISTRY.find((x) => x.id === walletId) || activeWallet;
      if (!w) throw new Error('No wallet selected');
      if (w.id === 'uri' || w.id === 'kaspa-web') {
        setActiveWallet(w);
        setShowModal(false);
        setConnecting(false);
        return null;
      }
      const provider = w.provider();
      if (!provider) throw new Error(`Wallet ${w.name} not available`);
      const accounts = await provider.request({ method: 'kaspa_requestAccounts' });
      if (accounts && accounts[0]) {
        const addr = accounts[0];
        setActiveWallet(w);
        setAddress(addr);
        setShowModal(false);
        try {
          const bal = await provider.request({ method: 'kaspa_getBalance', params: [addr] });
          setBalance(bal?.confirmed ?? bal ?? 0);
        } catch (_) {
          setBalance(0);
        }
        setConnecting(false);
        return addr;
      }
      throw new Error('No accounts returned');
    } catch (e) {
      setError(e.message || 'Connection failed');
      setConnecting(false);
      return null;
    }
  }, [activeWallet]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
    setError(null);
    setActiveWallet(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address || !activeWallet || activeWallet.id === 'uri' || activeWallet.id === 'kaspa-web') return;
    try {
      const provider = activeWallet.provider();
      if (!provider) return;
      const bal = await provider.request({ method: 'kaspa_getBalance', params: [address] });
      setBalance(bal?.confirmed ?? bal ?? 0);
    } catch (_) {}
  }, [address, activeWallet]);

  // Auto-refresh balance every 30s
  useEffect(() => {
    if (!address) return;
    refreshBalance();
    const id = setInterval(refreshBalance, 30000);
    return () => clearInterval(id);
  }, [address, refreshBalance]);

  const buildUri = useCallback(
    (recipient, amountKas, meta = {}) => {
      const prefix = KASPA_NETWORK === 'kaspatest' ? 'kaspatest:' : 'kaspa:';
      const addr = recipient.replace(/^(kaspatest:|kaspa:)/, '');
      const q = [];
      if (amountKas) q.push(`amount=${amountKas}`);
      if (meta.scriptHash) q.push(`scriptHash=${meta.scriptHash}`);
      let uri = `${prefix}${addr}`;
      if (q.length) uri += `?${q.join('&')}`;
      return uri;
    },
    []
  );

  const signTransaction = useCallback(async (tx) => {
    if (!activeWallet || activeWallet.id === 'uri' || !address) {
      throw new Error('No wallet connected');
    }
    const provider = activeWallet.provider();
    if (!provider?.request) throw new Error('Wallet does not support signing');
    return provider.request({ method: 'kaspa_signTransaction', params: [tx] });
  }, [activeWallet, address]);

  const sendPayment = useCallback(
    async (recipient, amountKas, meta = {}) => {
      const amountSompi = Math.floor(parseFloat(amountKas) * 100_000_000);
      const uri = buildUri(recipient, amountKas, meta);
      if (activeWallet && activeWallet.id !== 'uri' && activeWallet.id !== 'kaspa-web' && address) {
        try {
          const provider = activeWallet.provider();
          if (provider?.request) {
            const result = await provider.request({
              method: 'kaspa_sendTransaction',
              params: [{ to: recipient, amount: amountSompi, ...meta }],
            });
            await refreshBalance();
            return { success: true, method: 'extension', txid: result };
          }
        } catch (e) {
          window.open(uri, '_blank');
          return { success: true, method: 'uri', uri, error: e.message };
        }
      }
      window.open(uri, '_blank');
      return { success: true, method: 'uri', uri };
    },
    [activeWallet, address, buildUri, refreshBalance]
  );

  const value = {
    activeWallet,
    address,
    balance,
    connecting,
    error,
    showModal,
    setShowModal,
    connect,
    disconnect,
    sendPayment,
    signTransaction,
    buildUri,
    refreshBalance,
    wallets: WALLET_REGISTRY,
    network: KASPA_NETWORK,
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
