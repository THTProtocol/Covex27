import React, { useState } from 'react';
import { X, Smartphone, Globe, Wallet } from 'lucide-react';

const wallets = [
  { id: 'kasware', name: 'KasWare Wallet', desc: 'Kaspa Web3 Extension', icon: Wallet, tag: 'Recommended' },
  { id: 'kaspium', name: 'Kaspium', desc: 'Official Mobile Wallet', icon: Smartphone },
  { id: 'web', name: 'Kaspa Web Wallet', desc: 'Browser Wallet', icon: Globe },
];

const WalletButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* The Trigger Button in your Header */}
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] text-white rounded-xl font-medium transition-all hover:shadow-[0_0_15px_rgba(73,234,203,0.15)] text-sm"
      >
        <Wallet size={16} className="text-[#49EACB]" />
        CONNECT WALLET
      </button>

      {/* The Centered Web3 Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl w-full max-w-sm shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-[#1f1f1f]">
              <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {wallets.map((wallet) => {
                const Icon = wallet.icon;
                return (
                  <button 
                    key={wallet.id}
                    className="w-full flex items-center gap-4 p-3 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] hover:bg-[#1a1a1a] transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center group-hover:text-[#49EACB] text-gray-400 transition-colors">
                      <Icon size={20} />
                    </div>
                    <div className="text-left flex-1">
                      <div className="text-white font-medium flex items-center gap-2">
                        {wallet.name}
                        {wallet.tag && (
                          <span className="text-[9px] uppercase tracking-wider bg-[#49EACB]/10 text-[#49EACB] px-1.5 py-0.5 rounded-sm">
                            {wallet.tag}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{wallet.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WalletButton;
