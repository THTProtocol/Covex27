import { useState } from 'react';
import { useWallet } from './WalletContext';
import { Wallet, LogOut, AlertCircle, QrCode, ExternalLink } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const TRUNC = (s, n = 6) => (s ? `${s.slice(0, n)}...${s.slice(-4)}` : '');

const HOT_WALLETS = [
  {
    id: 'kasware',
    name: 'KasWare',
    url: 'https://kasware.xyz',
    logo: 'https://kasware.xyz/favicon.ico',
    bg: 'bg-[#49EACB]/10',
    border: 'border-[#49EACB]/30',
    color: '#49EACB',
    desc: 'Browser extension wallet',
  },
  {
    id: 'kaspium',
    name: 'Kaspium',
    url: 'https://kaspium.io',
    logo: 'https://kaspium.io/favicon.ico',
    bg: 'bg-[#E8AF34]/10',
    border: 'border-[#E8AF34]/30',
    color: '#E8AF34',
    desc: 'Mobile and desktop wallet',
  },
  {
    id: 'kastle',
    name: 'Kastle',
    url: 'https://kastle.app',
    logo: 'https://kastle.app/favicon.ico',
    bg: 'bg-[#8B5CF6]/10',
    border: 'border-[#8B5CF6]/30',
    color: '#8B5CF6',
    desc: 'Web wallet, no download',
  },
  {
    id: 'kaspa-web',
    name: 'Kaspa Web Wallet',
    url: 'https://kaspa-ng.org',
    logo: '',
    bg: 'bg-[#3B82F6]/10',
    border: 'border-[#3B82F6]/30',
    color: '#3B82F6',
    desc: 'Kaspa-NG web interface',
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
          <div className="w-full max-w-[440px] bg-[#0f0f14] rounded-3xl border border-white/[0.06] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-7 pt-7 pb-5 border-b border-white/[0.04]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Connect Wallet</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Non-custodial. Keys never leave your wallet.
                  </p>
                </div>
                <button
                  onClick={() => { setShowModal(false); setQrMode(false); }}
                  className="text-gray-500 hover:text-white transition-colors text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-7 mt-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Detected wallets */}
            <div className="px-7 pt-5 pb-3 space-y-2.5">
              <p className="text-[11px] text-gray-600 uppercase tracking-wider font-medium mb-2">
                Hot Wallets for Signing
              </p>
              {HOT_WALLETS.filter((w) => detectedIds.has(w.id)).map((w) => (
                <button
                  key={w.id}
                  onClick={() => connect(w.id)}
                  disabled={connecting}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 bg-white/[0.03] border-kaspa-green/20 hover:bg-kaspa-green/[0.06] hover:border-kaspa-green/40 group"
                >
                  <div className={`shrink-0 h-11 w-11 rounded-xl flex items-center justify-center border ${w.bg} ${w.border}`}>
                    {w.logo ? (
                      <img
                        src={w.logo}
                        alt={w.name}
                        className="h-6 w-6 object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <Wallet size={20} className="text-kaspa-green" />
                    )}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{w.name}</p>
                    <p className="text-[11px] text-emerald-400 mt-0.5">{w.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Detected
                    </span>
                    <span className="text-xs font-bold text-kaspa-green px-3 py-1.5 rounded-full bg-kaspa-green/10 border border-kaspa-green/20 shrink-0">
                      CONNECT
                    </span>
                  </div>
                </button>
              ))}

              {/* Non-detected hot wallets */}
              {HOT_WALLETS.filter((w) => !detectedIds.has(w.id)).map((w) => (
                <a
                  key={w.id}
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-4 p-3.5 rounded-2xl border border-white/[0.04] bg-white/[0.01] opacity-55 hover:opacity-80 transition-all duration-200 group"
                >
                  <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${w.bg} ${w.border}`}>
                    <Wallet size={18} className="text-gray-500" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{w.name}</p>
                    <p className="text-[11px] text-gray-600">{w.desc}</p>
                  </div>
                  <span className="text-[11px] text-gray-500 border border-gray-700 px-3 py-1 rounded-full flex items-center gap-1">
                    <ExternalLink size={10} />
                    Install
                  </span>
                </a>
              ))}
            </div>

            {/* Universal fallback */}
            <div className="px-7 pt-2 pb-3">
              <button
                onClick={() => connect('uri')}
                disabled={connecting}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.04] transition-all"
              >
                <div className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border border-white/10 bg-white/[0.02]">
                  <Wallet size={16} className="text-gray-400" />
                </div>
                <span className="text-xs text-gray-500">Universal Wallet Link (opens any Kaspa wallet)</span>
              </button>
            </div>

            {/* QR Code */}
            <div className="px-7 pb-4">
              <button
                onClick={() => openQr(buildUri(window.location.origin, 0))}
                className="w-full flex items-center justify-center gap-2.5 p-4 rounded-2xl border border-dashed border-kaspa-gold/20 bg-kaspa-gold/[0.03] hover:bg-kaspa-gold/[0.06] hover:border-kaspa-gold/40 transition-all duration-200"
              >
                <QrCode size={18} className="text-kaspa-gold" />
                <span className="text-sm font-medium text-kaspa-gold">Pay with QR Code</span>
                <span className="text-[11px] text-gray-600">(for covenant upgrades)</span>
              </button>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 text-center">
              <p className="text-[11px] text-gray-600">
                Covex never stores your private keys. All signing happens in your wallet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
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
                  Scan with any Kaspa wallet. Your keys never leave your device.
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
