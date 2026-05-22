import { createContext, useContext, useCallback } from 'react';
import {
  KaspaWalletProvider as KasFlowProvider,
  kaswareAdapter,
  useWallet as useKasFlowWallet,
} from '@kasflow/wallet-connector/react';

const WalletContext = createContext(null);

const KASPA_NETWORK = 'kaspatest';

// Real Kaspa wallet logos as inline SVG data URIs
const WALLET_LOGOS = {
  kasware: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#0A0A0D"/><path d="M24 6L40 14.5v19L24 41.5 8 33.5v-19L24 6z" fill="#49EACB" opacity="0.9"/><text x="24" y="31" text-anchor="middle" font-family="Arial Black" font-size="18" fill="#0A0A0D" font-weight="900">K</text></svg>'
  ),
  kaspium: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#1a1a2e"/><defs><linearGradient id="kg" x1="10" y1="10" x2="38" y2="38"><stop stop-color="#3B82F6"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs><path d="M14 24l10-14 10 14-10 14-10-14z" fill="url(#kg)" stroke="#60A5FA" stroke-width="1"/><circle cx="24" cy="24" r="5" fill="#1a1a2e" stroke="#60A5FA" stroke-width="1.5"/></svg>'
  ),
  kastle: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#0F0F1A"/><path d="M8 34V16l16-8 16 8v18H8z" fill="none" stroke="#A78BFA" stroke-width="2"/><path d="M14 28h6v8h-6zM26 20h6v16h-6z" fill="#A78BFA" opacity="0.8"/><path d="M14 36h20" stroke="#A78BFA" stroke-width="2"/></svg>'
  ),
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
  }, [kf.connected, kf.address, kf.sendTransaction, buildUri]);

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
    activeWallet: kf.currentAdapter
      ? { id: kf.currentAdapter.metadata.name, name: kf.currentAdapter.metadata.displayName }
      : null,
    address: kf.address,
    balance: kf.balance ? Number(kf.balance.available) : null,
    connecting: kf.connecting,
    error: kf.error?.message || null,
    showModal: kf.isModalOpen,
    setShowModal: (v) => v ? kf.openModal() : kf.closeModal(),
    connect: (id) => kf.connect(id),
    disconnect: kf.disconnect,
    sendPayment,
    signTransaction: async () => {
      throw new Error('signTransaction not implemented via KasFlow bridge');
    },
    buildUri,
    refreshBalance: kf.refreshBalance,
    wallets: allWallets,
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
