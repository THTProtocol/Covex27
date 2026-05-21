import { useState } from 'react';
import { useWallet } from './WalletContext';
import { Wallet, LogOut, AlertCircle, QrCode, ExternalLink } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const TRUNC = (s, n = 6) => (s ? `${s.slice(0, n)}...${s.slice(-4)}` : '');

const WALLET_LIST = [
  {
    id: 'kasware',
    name: 'KasWare',
    url: 'https://kasware.xyz',
    logo: 'https://kasware.xyz/favicon.ico',
    bg: 'bg-[#49EACB]/10',
    border: 'border-[#49EACB]/30',
    color: '#49EACB',
  },
  {
    id: 'kaspium',
    name: 'Kaspium',
    url: 'https://kaspium.io',
    logo: 'https://kaspium.io/favicon.ico',
    bg: 'bg-[#E8AF34]/10',
    border: 'border-[#E8AF34]/30',
    color: '#E8AF34',
  },
  {
    id: 'kastle',
    name: 'Kastle',
    url: 'https://kastle.app',
    logo: 'https://kastle.app/favicon.ico',
    bg: 'bg-[#8B5CF6]/10',
    border: 'border-[#8B5CF6]/30',
    color: '#8B5CF6',
  },
  {
    id: 'onekey',
    name: 'OneKey',
    url: 'https://onekey.so',
    logo: 'https://onekey.so/favicon.ico',
    bg: 'bg-[#3B82F6]/10',
    border: 'border-[#3B82F6]/30',
    color: '#3B82F6',
  },
  {
    id: 'tangem',
    name: 'Tangem',
    url: 'https://tangem.com',
    logo: 'https://tangem.com/favicon.ico',
    bg: 'bg-[#10B981]/10',
    border: 'border-[#10B981]/30',
    color: '#10B981',
  },
  {
    id: 'kdx',
    name: 'KDX',
    url: 'https://kdx.app',
    logo: 'https://kdx.app/favicon.ico',
    bg: 'bg-[#F59E0B]/10',
    border: 'border-[#F59E0B]/30',
    color: '#F59E0B',
  },
];

export default function WalletButton() {
  const {
    address,
    balance,
    connecting,
    error,
    showModal,
    setShowModal,
    connect,
    disconnect,
    wallets,
    buildUri,
    network,
  } = useWallet();

  const [qrMode, setQrMode] = useState(false);
  const [qrUri, setQrUri] = useState('');

  const detectedIds = new Set(wallets.filter((w) => w.id !== 'uri' && w.detect()).map((w) => w.id));

  const openQr = (uri) => {
    setQrUri(uri);
    setQrMode(true);
  };

  return (
    <>
      {address ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono uppercase tracking-wider">{network}</span>
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
          data-wallet-trigger
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 bg-kaspa-green text-black hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] disabled:opacity-50"
        >
          <Wallet size={16} />
          {connecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>
      )}

      {/* Wallet Modal */}
      {showModal && !qrMode && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-[420px] bg-[#0f0f14] rounded-3xl border border-white/[0.06] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-7 pt-7 pb-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white tracking-tight">Connect Wallet</h3>
                <button
                  onClick={() => { setShowModal(false); setQrMode(false); }}
                  className="text-gray-500 hover:text-white transition-colors text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Non-custodial connection. Keys never leave your wallet.
              </p>
            </div>

            {error && (
              <div className="mx-7 mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Installed wallets */}
            <div className="px-7 pb-5 space-y-3">
              {WALLET_LIST.filter((w) => detectedIds.has(w.id)).map((w) => (
                <button
                  key={w.id}
                  onClick={() => connect(w.id)}
                  disabled={connecting}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/15 group"
                >
                  <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${w.bg} ${w.border}`}>
                    <img
                      src={w.logo}
                      alt={w.name}
                      className="h-5 w-5 object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-white transition-colors">{w.name}</p>
                    <p className="text-[11px] text-emerald-400 mt-0.5">Detected</p>
                  </div>
                  <span className="text-xs font-semibold text-kaspa-green px-3 py-1 rounded-full bg-kaspa-green/10 border border-kaspa-green/20 shrink-0">
                    CONNECT
                  </span>
                </button>
              ))}

              {/* Not installed wallets */}
              {WALLET_LIST.filter((w) => !detectedIds.has(w.id)).map((w) => (
                <a
                  key={w.id}
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/[0.04] bg-white/[0.01] opacity-60 hover:opacity-85 transition-all duration-200 group"
                >
                  <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${w.bg} ${w.border}`}>
                    <img
                      src={w.logo}
                      alt={w.name}
                      className="h-5 w-5 object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{w.name}</p>
                  </div>
                  <span className="text-[11px] text-gray-500 border border-gray-700 px-3 py-1 rounded-full flex items-center gap-1">
                    <ExternalLink size={10} />
                    Install
                  </span>
                </a>
              ))}

              {/* Universal URI */}
              <button
                onClick={() => connect('uri')}
                disabled={connecting}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200"
              >
                <div className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/[0.02]">
                  <Wallet size={18} className="text-gray-400" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-white">Universal Wallet Link</p>
                  <p className="text-[11px] text-gray-500">Opens any Kaspa-compatible wallet</p>
                </div>
              </button>
            </div>

            {/* QR Code option */}
            <div className="px-7 pb-5">
              <button
                onClick={() => openQr(buildUri(window.location.origin, 0))}
                className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200 text-sm text-gray-400 hover:text-white"
              >
                <QrCode size={16} />
                Pay with QR Code
              </button>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 text-center">
              <p className="text-[11px] text-gray-600">
                Covex never stores or has access to your private keys.
                All signing happens in your wallet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal (nested inside wallet flow) */}
      {showModal && qrMode && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
          <div className="w-full max-w-sm bg-[#0f0f14] rounded-3xl border border-white/[0.06] shadow-2xl p-7 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white tracking-tight">Pay with QR Code</h3>
              <button
                onClick={() => setQrMode(false)}
                className="text-gray-500 hover:text-white transition-colors text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col items-center space-y-5">
              <div className="p-4 bg-white rounded-xl">
                <QRCodeCanvas value={qrUri || 'kaspatest:'} size={200} level="H" includeMargin={false} />
              </div>

              <div className="w-full">
                <p className="text-xs text-gray-500 text-center">
                  Scan with any Kaspa wallet to connect or pay. Your keys never leave your device.
                </p>
              </div>

              <button
                onClick={() => { setQrMode(false); setShowModal(false); }}
                className="w-full py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
