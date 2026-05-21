import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WalletContext = createContext(null);

const KASPA_NETWORK = 'kaspatest';

const WALLET_REGISTRY = [
  {
    id: 'kasware',
    name: 'KasWare',
    url: 'https://kasware.xyz',
    logo: 'https://kasware.xyz/favicon.ico',
    detect: () => typeof window !== 'undefined' && !!window.kasware,
    provider: () => window.kasware,
  },
  {
    id: 'kaspium',
    name: 'Kaspium',
    url: 'https://kaspium.io',
    logo: 'https://kaspium.io/favicon.ico',
    detect: () => typeof window !== 'undefined' && !!window.__kaspium,
    provider: () => window.__kaspium,
  },
  {
    id: 'onekey',
    name: 'OneKey',
    url: 'https://onekey.so',
    logo: 'https://onekey.so/favicon.ico',
    detect: () => typeof window !== 'undefined' && !!window.$onekey?.kaspa,
    provider: () => window.$onekey?.kaspa,
  },
  {
    id: 'tangem',
    name: 'Tangem',
    url: 'https://tangem.com',
    logo: 'https://tangem.com/favicon.ico',
    detect: () => typeof window !== 'undefined' && !!window.TangemSdk,
    provider: () => ({ request: async () => { throw new Error('Tangem SDK requires card tap'); } }),
  },
  {
    id: 'kdx',
    name: 'KDX',
    url: 'https://kdx.app',
    logo: 'https://kdx.app/favicon.ico',
    detect: () => typeof window !== 'undefined' && !!window.kdx,
    provider: () => window.kdx,
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
      (w) => w.id !== 'uri' && w.detect()
    );
    if (detected && !activeWallet) {
      setActiveWallet(detected);
    }
    const id = setInterval(() => {
      if (!activeWallet || activeWallet.id === 'uri') {
        const d = WALLET_REGISTRY.find(
          (w) => w.id !== 'uri' && w.detect()
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
      if (w.id === 'uri') {
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
    if (!address || !activeWallet || activeWallet.id === 'uri') return;
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
      if (activeWallet && activeWallet.id !== 'uri' && address) {
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
