import { useWallet } from './WalletContext';
import { Wallet, LogOut, Link2 } from 'lucide-react';

const TRUNC = (s, n = 6) => (s ? `${s.slice(0, n)}...${s.slice(-4)}` : '');

const WALLET_LOGOS = {
  kasware: (
    <img
      src="https://kasware.xyz/favicon.ico"
      alt="KasWare"
      className="h-6 w-6 rounded-md object-contain"
    />
  ),
  kaspium: (
    <img
      src="https://kaspium.io/favicon.ico"
      alt="Kaspium"
      className="h-6 w-6 rounded-md object-contain"
    />
  ),
  onekey: (
    <img
      src="https://onekey.so/favicon.ico"
      alt="OneKey"
      className="h-6 w-6 rounded-md object-contain bg-white"
    />
  ),
  tangem: (
    <img
      src="https://tangem.com/favicon.ico"
      alt="Tangem"
      className="h-6 w-6 rounded-md object-contain"
    />
  ),
  kdx: (
    <img
      src="https://kdx.app/favicon.ico"
      alt="KDX"
      className="h-6 w-6 rounded-md object-contain"
    />
  ),
  uri: <Link2 className="h-6 w-6 text-gray-500" />,
};

export default function WalletButton() {
  const {
    address,
    balance,
    connecting,
    showModal,
    setShowModal,
    connect,
    disconnect,
    wallets,
    network,
  } = useWallet();

  const available = wallets.filter((w) => w.id !== 'uri' && w.detect());
  const detected = wallets.filter((w) => w.detect());

  return (
    <>
      {address ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono uppercase">{network}</span>
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-kaspa-green/10 border border-kaspa-green/30">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-sm font-mono text-kaspa-green">{TRUNC(address)}</span>
            {balance !== null && (
              <span className="text-sm text-gray-300 ml-2 border-l border-white/10 pl-3">
                {(balance / 1e8).toFixed(2)} KAS
              </span>
            )}
            <button
              onClick={disconnect}
              className="ml-2 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors text-gray-400"
              title="Disconnect"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          disabled={connecting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 bg-kaspa-green text-black hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] disabled:opacity-50"
        >
          <Wallet size={16} />
          {connecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
          <div className="w-full max-w-md glass-panel rounded-3xl p-8 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">Connect Wallet</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Non-custodial connection · Keys never leave your wallet
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-white transition-colors text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            <div className="space-y-3">
              {/* Detected wallets */}
              {detected
                .filter((w) => w.id !== 'uri')
                .map((w) => (
                  <button
                    key={w.id}
                    onClick={() => connect(w.id)}
                    disabled={connecting}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 bg-white/[0.03] border-kaspa-green/30 hover:bg-white/[0.08] hover:border-kaspa-green/60"
                  >
                    <div className="shrink-0">{WALLET_LOGOS[w.id] || WALLET_LOGOS.uri}</div>
                    <div className="text-left flex-1">
                      <p className="text-base font-semibold text-white">{w.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <p className="text-xs text-emerald-400">Installed</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-kaspa-green px-3 py-1 rounded-full bg-kaspa-green/10 border border-kaspa-green/20">
                      CONNECT
                    </span>
                  </button>
                ))}

              {/* Not-detected wallets */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                {wallets
                  .filter((w) => !w.detect() && w.id !== 'uri')
                  .map((w) => (
                    <a
                      key={w.id}
                      href={w.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.01] border border-white/5 opacity-50 hover:opacity-80 transition-opacity"
                    >
                      <div className="shrink-0">{WALLET_LOGOS[w.id] || WALLET_LOGOS.uri}</div>
                      <span className="text-xs text-gray-500">{w.name}</span>
                    </a>
                  ))}
              </div>

              {/* URI fallback */}
              <button
                onClick={() => connect('uri')}
                disabled={connecting}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
              >
                <div className="shrink-0">{WALLET_LOGOS.uri}</div>
                <div className="text-left flex-1">
                  <p className="text-base font-semibold text-white">Universal Wallet Link</p>
                  <p className="text-xs text-gray-500">
                    Opens any Kaspa-compatible wallet via deep-link
                  </p>
                </div>
              </button>
            </div>

            <p className="text-xs text-gray-600 text-center">
              Covex never stores or has access to your private keys.
              All signing happens in your wallet.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
