import { useState } from 'react';
import { useWallet } from './WalletContext';
import { X, Wallet, Download, ExternalLink } from 'lucide-react';

export default function WalletButton() {
  const { address, balance, connecting, wallets, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  if (address) {
    return (
      <button
        onClick={() => disconnect()}
        className="flex items-center gap-2 px-4 py-2 bg-[#111111] border border-[#49EACB]/30 hover:border-[#49EACB] text-[#49EACB] rounded-xl font-medium transition-all text-sm"
        title="Click to disconnect"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#49EACB] shadow-[0_0_6px_#49EACB] animate-pulse" />
        {address.slice(0, 8)}...{address.slice(-4)}
        {balance !== null && (
          <span className="text-gray-500 ml-1 text-xs">
            ({(balance / 1e8).toFixed(2)} KAS)
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] text-white rounded-xl font-medium transition-all hover:shadow-[0_0_15px_rgba(73,234,203,0.15)] text-sm"
      >
        <Wallet size={16} className="text-[#49EACB]" />
        CONNECT WALLET
      </button>

      {open && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="absolute top-0 right-0 h-screen w-full sm:w-[420px] bg-[#0a0a0a] border-l border-[#1f1f1f] shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-6 border-b border-[#1f1f1f] shrink-0">
              <h2 className="text-xl font-semibold text-white">Connect Wallet</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-500 mb-4">Select a Kaspa wallet to connect to Covex (TN12 Testnet)</p>

              <div className="space-y-2">
                {wallets.map((wallet) => {
                  const detected = wallet.detect ? wallet.detect() : false;
                  return (
                    <button
                      key={wallet.id}
                      onClick={async () => {
                        if (detected) {
                          await connect(wallet.id);
                          setOpen(false);
                        } else {
                          window.open(wallet.url, '_blank');
                        }
                      }}
                      disabled={connecting}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] hover:bg-[#1a1a1a] transition-all group disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-[#0a0a0a] border border-[#1f1f1f]">
                        {wallet.logo ? (
                          <img src={wallet.logo} alt={wallet.name} className="w-9 h-9 object-contain rounded-md" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <Wallet size={18} className="text-gray-500" />
                        )}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-white font-medium text-sm flex items-center gap-2">
                          {wallet.name}
                          {detected && (
                            <span className="text-[10px] uppercase tracking-wider bg-[#49EACB]/10 text-[#49EACB] px-1.5 py-0.5 rounded-sm shrink-0">
                              Detected
                            </span>
                          )}
                          {wallet.recommended && !detected && (
                            <span className="text-[9px] uppercase tracking-wider bg-[#E8AF34]/10 text-[#E8AF34] px-1.5 py-0.5 rounded-sm shrink-0">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {detected ? 'Click to connect' : wallet.sub || 'Install'}
                        </div>
                      </div>
                      {!detected ? (
                        <ExternalLink size={14} className="text-gray-600 group-hover:text-[#49EACB] transition-colors shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-[#1f1f1f] shrink-0">
              <p className="text-xs text-gray-600 text-center">
                TN12 Testnet · Non-custodial · Multi-wallet
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
