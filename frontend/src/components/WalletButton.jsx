import React, { useState } from 'react';
import { X, Smartphone, Globe, Wallet, Monitor, Key, Hash, ChevronLeft, Download, AlertTriangle } from 'lucide-react';

const wallets = [
  { id: 'kasware', name: 'KasWare Wallet', desc: 'Browser Extension', icon: Wallet, tag: 'Recommended', url: 'https://www.kasware.xyz/' },
  { id: 'kaspium', name: 'Kaspium', desc: 'Official Mobile Wallet', icon: Smartphone, url: 'https://kaspium.io/' },
  { id: 'kastle', name: 'Kastle Wallet', desc: 'Mobile Web3 Wallet', icon: Smartphone, url: 'https://kastle.xyz/' },
  { id: 'kasanova', name: 'Kasanova', desc: 'Mobile Wallet', icon: Smartphone, url: '#' },
  { id: 'web', name: 'Kaspa Web', desc: 'Browser Wallet', icon: Globe, url: 'https://wallet.kaspanet.io/' },
  { id: 'kdx', name: 'KDX', desc: 'Desktop Node & Wallet', icon: Monitor, url: 'https://kdx.app/' },
];

const WalletButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list', 'mnemonic', 'hex'
  const [inputValue, setInputValue] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Simulates connection or triggers extension download
  const handleWalletClick = async (wallet) => {
    if (wallet.id === 'kasware') {
      if (typeof window.kasware !== 'undefined') {
        try {
          setIsConnecting(true);
          await window.kasware.requestAccounts();
          // Connected successfully - pass to your global state here
          setIsOpen(false);
        } catch (error) {
          console.error("KasWare connection failed", error);
        } finally {
          setIsConnecting(false);
        }
      } else {
        window.open(wallet.url, '_blank');
      }
    } else {
      window.open(wallet.url, '_blank');
    }
  };

  const handleManualImport = () => {
    if (!inputValue) return;
    setIsConnecting(true);
    // Hook this into kaspa-wasm to derive keys for covenants
    console.log(`Importing ${view}:`, inputValue);
    setTimeout(() => {
      setIsConnecting(false);
      setIsOpen(false);
      setInputValue('');
      setView('list');
    }, 1000);
  };

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
          <div className="absolute top-0 right-0 h-screen w-full sm:w-[400px] bg-[#0a0a0a] border-l border-[#1f1f1f] shadow-2xl flex flex-col transition-all">
            
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-[#1f1f1f] shrink-0 bg-[#0a0a0a]">
              {view !== 'list' ? (
                <button onClick={() => setView('list')} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                  <ChevronLeft size={20} />
                  <span className="text-sm font-medium">Back</span>
                </button>
              ) : (
                <h2 className="text-xl font-semibold text-white">Connect</h2>
              )}
              <button onClick={() => { setIsOpen(false); setView('list'); }} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {view === 'list' && (
                <div className="space-y-6">
                  {/* Web3 & Mobile Wallets */}
                  <div className="space-y-3">
                    {wallets.map((wallet) => {
                      const Icon = wallet.icon;
                      const isExtensionMissing = wallet.id === 'kasware' && typeof window === 'object' && !window.kasware;
                      
                      return (
                        <button 
                          key={wallet.id}
                          onClick={() => handleWalletClick(wallet)}
                          disabled={isConnecting}
                          className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] hover:bg-[#1a1a1a] transition-all group disabled:opacity-50"
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
                          {isExtensionMissing && wallet.id === 'kasware' && (
                            <Download size={18} className="text-gray-500 group-hover:text-[#49EACB]" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Manual Import Separator */}
                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-[#1f1f1f]"></div>
                    <span className="flex-shrink-0 mx-4 text-xs text-gray-600 uppercase tracking-wider">Developer / Manual</span>
                    <div className="flex-grow border-t border-[#1f1f1f]"></div>
                  </div>

                  {/* Manual Options */}
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setView('mnemonic')}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] transition-all group"
                    >
                      <Key size={20} className="text-gray-400 group-hover:text-[#49EACB]" />
                      <span className="text-sm text-gray-300 font-medium">Mnemonic</span>
                    </button>
                    <button 
                      onClick={() => setView('hex')}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] transition-all group"
                    >
                      <Hash size={20} className="text-gray-400 group-hover:text-[#49EACB]" />
                      <span className="text-sm text-gray-300 font-medium">HEX Key</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Import Forms */}
              {(view === 'mnemonic' || view === 'hex') && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                  <div className="p-3 border border-yellow-900/50 bg-yellow-900/10 rounded-xl flex gap-3 items-start">
                    <AlertTriangle size={18} className="text-yellow-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-yellow-600 leading-relaxed">
                      <strong>Security Warning:</strong> Never enter a Mainnet seed phrase or private key into a browser application. Use this only for Testnet-12 development.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {view === 'mnemonic' ? '12 or 24-word Seed Phrase' : 'Private Key (HEX)'}
                    </label>
                    {view === 'mnemonic' ? (
                      <textarea 
                        rows="4"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="apple banana cherry..."
                        className="w-full bg-[#111111] border border-[#1f1f1f] rounded-xl p-3 text-white text-sm focus:outline-none focus:border-[#49EACB] transition-colors resize-none"
                      />
                    ) : (
                      <input 
                        type="password"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-[#111111] border border-[#1f1f1f] rounded-xl p-3 text-white text-sm focus:outline-none focus:border-[#49EACB] transition-colors"
                      />
                    )}
                  </div>

                  <button 
                    onClick={handleManualImport}
                    disabled={!inputValue || isConnecting}
                    className="w-full py-3 bg-[#49EACB] hover:bg-[#3bc2a6] text-black font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConnecting ? 'Importing...' : 'Import & Connect'}
                  </button>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-[#1f1f1f] shrink-0 bg-[#0a0a0a]">
                <p className="text-xs text-gray-600 text-center">
                  Covex Testnet-12 Environment
                </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WalletButton;
