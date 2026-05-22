import { createContext, useContext, useCallback } from 'react';
import {
  KaspaWalletProvider as KasFlowProvider,
  kaswareAdapter,
  useWallet as useKasFlowWallet,
} from '@kasflow/wallet-connector/react';

const WalletContext = createContext(null);

const KASPA_NETWORK = 'kaspatest';

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

  const value = {
    activeWallet: kf.currentAdapter ? { id: kf.currentAdapter.metadata.name, name: kf.currentAdapter.metadata.displayName } : null,
    address: kf.address,
    balance: kf.balance ? Number(kf.balance.available) : null,
    connecting: kf.connecting,
    error: kf.error?.message || null,
    showModal: kf.isModalOpen,
    setShowModal: (v) => v ? kf.openModal() : kf.closeModal(),
    connect: (id) => kf.connect(id),
    disconnect: kf.disconnect,
    sendPayment,
    signTransaction: async (tx) => {
      throw new Error('signTransaction not implemented via KasFlow bridge');
    },
    buildUri,
    refreshBalance: kf.refreshBalance,
    wallets: kf.adapters.map(a => ({
      id: a.metadata.name,
      name: a.metadata.displayName,
      url: a.metadata.url,
      logo: a.metadata.icon,
      detect: () => a.readyState === 'installed',
      provider: () => a,
    })),
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
