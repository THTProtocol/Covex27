import React from 'react';
import { X, Smartphone, Globe, Wallet } from 'lucide-react';

const wallets = [
  { id: 'kasware', name: 'KasWare Wallet', desc: 'Kaspa Web3 Extension', icon: Wallet, tag: 'Recommended' },
  { id: 'kaspium', name: 'Kaspium', desc: 'Official Mobile Wallet', icon: Smartphone },
  { id: 'web', name: 'Kaspa Web Wallet', desc: 'Browser Wallet', icon: Globe },
];

const WalletModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl w-full max-w-sm shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-[#1f1f1f]">
          <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
          <button onClick={onClose} className="text-gray-200 hover:text-white transition-colors">
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
                <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center group-hover:text-[#49EACB] text-gray-200 transition-colors">
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
                  <div className="text-xs text-gray-300">{wallet.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WalletModal;
