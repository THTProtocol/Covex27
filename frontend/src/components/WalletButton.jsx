import React, { useState } from 'react';
import { X, Smartphone, Globe, Wallet, HardDrive, Monitor } from 'lucide-react';

const wallets = [
  { id: 'kasware', name: 'KasWare Wallet', desc: 'Kaspa Web3 Extension', icon: Wallet, tag: 'Recommended' },
  { id: 'kaspium', name: 'Kaspium', desc: 'Official Mobile Wallet', icon: Smartphone },
  { id: 'web', name: 'Kaspa Web Wallet', desc: 'Browser Wallet', icon: Globe },
  { id: 'tangem', name: 'Tangem', desc: 'Hardware Wallet', icon: HardDrive },
  { id: 'onekey', name: 'OneKey', desc: 'Hardware Wallet', icon: HardDrive },
  { id: 'ledger', name: 'Ledger', desc: 'Hardware Wallet', icon: HardDrive },
  { id: 'kdx', name: 'KDX', desc: 'Desktop Node & Wallet', icon: Monitor },
];

const WalletButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] text-white rounded-xl font-medium transition-all hover:shadow-[0_0_15px_rgba(73,234,203,0.15)] text-sm"
      >
        <Wallet size={16} className="text-[#49EACB]" />
        CONNECT WALLET
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm">
          {/* Absolute positioning locks it to the right and forces full screen height */}
          <div className="absolute top-0 right-0 h-screen w-full sm:w-[400px] bg-[#0a0a0a] border-l border-[#1f1f1f] shadow-2xl flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-[#1f1f1f] shrink-0 bg-[#0a0a0a]">
              <h2 className="text-xl font-semibold text-white">Connect Wallet</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Scrollable Wallet List (flex-1 forces it to take up all remaining space) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {wallets.map((wallet) => {
                const Icon = wallet.icon;
                return (
                  <button 
                    key={wallet.id}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] hover:bg-[#1a1a1a] transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center group-hover:text-[#49EACB] text-gray-400 transition-colors shrink-0">
                      <Icon size={24} />
                    </div>
                    <div className="text-left flex-1">
                      <div className="text-white font-medium flex items-center gap-2">
                        {wallet.name}
                        {wallet.tag && (
                          <span className="text-[10px] uppercase tracking-wider bg-[#49EACB]/10 text-[#49EACB] px-2 py-0.5 rounded-sm shrink-0">
                            {wallet.tag}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{wallet.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-[#1f1f1f] shrink-0 bg-[#0a0a0a]">
                <p className="text-xs text-gray-500 text-center">
                    Covex supports all major Kaspa ecosystem wallets.
                </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WalletButton;
