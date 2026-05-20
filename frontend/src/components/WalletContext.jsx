import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WalletContext = createContext(null);
const KASPA_NETWORK = 'kaspatest';

const WALLETS = [
  {
    id: 'kasware', name: 'KasWare', url: 'https://kasware.xyz',
    logo: 'K', detect: () => typeof window !== 'undefined' && !!window.kasware,
    connect: async () => { const a = await window.kasware.request({ method: 'kaspa_requestAccounts' }); return a?.[0] || null; },
    getBalance: async (addr) => { const b = await window.kasware.request({ method: 'kaspa_getBalance', params: [addr] }); return b?.confirmed || 0; },
    send: async (tx) => window.kasware.request({ method: 'kaspa_sendTransaction', params: [tx] }),
  },
  {
    id: 'kaspium', name: 'Kaspium', url: 'https://kaspium.io',
    logo: 'M', detect: () => typeof window !== 'undefined' && !!window.__kaspium,
    connect: async () => { const a = await window.__kaspium.request({ method: 'kaspa_requestAccounts' }); return a?.[0] || null; },
    getBalance: async (addr) => { const b = await window.__kaspium.request({ method: 'kaspa_getBalance', params: [addr] }); return b?.confirmed || 0; },
    send: async (tx) => window.__kaspium.request({ method: 'kaspa_sendTransaction', params: [tx] }),
  },
  {
    id: 'onekey', name: 'OneKey', url: 'https://onekey.so',
    logo: 'O', detect: () => typeof window !== 'undefined' && !!window.$onekey?.kaspa,
    connect: async () => { const a = await window.$onekey.kaspa.request({ method: 'kaspa_requestAccounts' }); return a?.[0] || null; },
    getBalance: async (addr) => { const b = await window.$onekey.kaspa.request({ method: 'kaspa_getBalance', params: [addr] }); return b?.confirmed || 0; },
    send: async (tx) => window.$onekey.kaspa.request({ method: 'kaspa_sendTransaction', params: [tx] }),
  },
  { id: 'uri', name: 'Kaspa URI', url: '#', logo: 'URI', detect: () => true, connect: async () => null, getBalance: async () => null, send: async () => { throw new Error('URI flow'); } },
];

export function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(null);
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { const d = WALLETS.find(w => w.detect()); if (d) setWallet(d); }, []);
  useEffect(() => { const id = setInterval(() => { if (!wallet || wallet.id==='uri') { const d = WALLETS.find(w => w.detect()); if (d && d.id!=='uri') setWallet(d); } }, 2000); return () => clearInterval(id); }, [wallet]);

  const connect = useCallback(async (walletId) => {
    setConnecting(true); setError(null);
    try {
      const w = WALLETS.find(x => x.id === walletId) || wallet;
      if (!w) throw new Error('No wallet');
      if (w.id === 'uri') { setWallet(w); setShowModal(false); setConnecting(false); return null; }
      const addr = await w.connect();
      if (addr) { setWallet(w); setAddress(addr); setShowModal(false); try { setBalance(await w.getBalance(addr)); } catch(_){} }
      setConnecting(false); return addr;
    } catch(e) { setError(e.message); setConnecting(false); return null; }
  }, [wallet]);

  const disconnect = () => { setAddress(null); setBalance(null); setError(null); };

  const buildUri = useCallback((recipient, amount, meta = {}) => {
    const p = ['kaspatest:' + recipient];
    const q = [];
    if (amount) q.push('amount=' + amount);
    if (meta.scriptHash) q.push('scriptHash=' + meta.scriptHash);
    if (q.length) p.push('?' + q.join('&'));
    return p.join('');
  }, []);

  const sendPayment = useCallback(async (recipient, amountSompi, meta = {}) => {
    const uri = buildUri(recipient, amountSompi / 1e8, meta);
    if (wallet?.send) { try { return { success: true, method: 'extension', txid: await wallet.send({ to: recipient, amount: amountSompi, ...meta }) }; } catch(_){} }
    window.location.href = uri;
    return { success: true, method: 'uri', uri };
  }, [wallet, buildUri]);

  return (
    <WalletContext.Provider value={{ wallet, address, balance, connecting, error, showModal, setShowModal, connect, disconnect, sendPayment, buildUri, wallets: WALLETS, network: KASPA_NETWORK }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() { return useContext(WalletContext); }
