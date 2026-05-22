import React, { useState } from 'react';
import { X, ChevronLeft, Download, AlertTriangle, Wallet, Key, Hash } from 'lucide-react';

// Inline SVG wallet logos
const KasWareLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
    <rect width="48" height="48" rx="12" fill="#111"/>
    <path d="M24 8L38 16v16L24 40 10 32V16L24 8z" fill="#49EACB" opacity="0.9"/>
    <path d="M24 14L33 19.5v11L24 35.5 15 30.5v-11L24 14z" fill="#111"/>
    <circle cx="24" cy="25" r="4" fill="#49EACB"/>
  </svg>
);
const KaspiumLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
    <rect width="48" height="48" rx="12" fill="#1a1a2e"/>
    <path d="M14 24l10-14 10 14-10 14-10-14z" fill="url(#kg2)" stroke="#3B82F6" strokeWidth="1.5"/>
    <defs><linearGradient id="kg2" x1="14" y1="10" x2="34" y2="38"><stop stopColor="#3B82F6"/><stop offset="1" stopColor="#8B5CF6"/></linearGradient></defs>
    <circle cx="24" cy="24" r="5" fill="#1a1a2e" stroke="#60A5FA" strokeWidth="1.5"/>
  </svg>
);
const KastleLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
    <rect width="48" height="48" rx="12" fill="#0f0f1a"/>
    <path d="M10 36V14l14-8 14 8v22H10z" fill="none" stroke="#A78BFA" strokeWidth="2"/>
    <path d="M16 28h6v8h-6zM26 20h6v16h-6z" fill="#A78BFA" opacity="0.8"/>
    <path d="M16 36h16" stroke="#A78BFA" strokeWidth="2"/>
  </svg>
);
const KaspaWebLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
    <rect width="48" height="48" rx="12" fill="#0a1628"/>
    <circle cx="24" cy="24" r="14" fill="none" stroke="#49EACB" strokeWidth="2"/>
    <path d="M24 10A14 14 0 0110 24" fill="none" stroke="#E8AF34" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M13 17l7 7-7 7" fill="none" stroke="#49EACB" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="3" fill="#49EACB"/>
  </svg>
);
const KasanovaLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
    <rect width="48" height="48" rx="12" fill="#1a0a1a"/>
    <path d="M12 16l12-6 12 6v16l-12 6-12-6V16z" fill="none" stroke="#EC4899" strokeWidth="2"/>
    <circle cx="24" cy="24" r="6" fill="#EC4899" opacity="0.7"/>
    <path d="M20 24h8M24 20v8" stroke="#1a0a1a" strokeWidth="2"/>
  </svg>
);
const KDXLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
    <rect width="48" height="48" rx="12" fill="#0d1117"/>
    <rect x="10" y="14" width="28" height="20" rx="2" fill="none" stroke="#58A6FF" strokeWidth="2"/>
    <rect x="14" y="18" width="20" height="12" rx="1" fill="#58A6FF" opacity="0.2"/>
    <path d="M20 26h8" stroke="#58A6FF" strokeWidth="2" strokeLinecap="round"/>
    <rect x="16" y="36" width="16" height="3" rx="1.5" fill="#30363D"/>
  </svg>
);

const wallets = [
  { id: 'kasware', name: 'KasWare Wallet', desc: 'Browser Extension', Logo: KasWareLogo, tag: 'Recommended', url: 'https://www.kasware.xyz/' },
  { id: 'kaspium', name: 'Kaspium', desc: 'Official Mobile Wallet', Logo: KaspiumLogo, url: 'https://kaspium.io/' },
  { id: 'kastle', name: 'Kastle Wallet', desc: 'Mobile Web3 Wallet', Logo: KastleLogo, url: 'https://kastle.xyz/' },
  { id: 'kasanova', name: 'Kasanova', desc: 'Mobile Wallet', Logo: KasanovaLogo, url: '#' },
  { id: 'web', name: 'Kaspa Web', desc: 'Browser Wallet', Logo: KaspaWebLogo, url: 'https://wallet.kaspanet.io/' },
  { id: 'kdx', name: 'KDX', desc: 'Desktop Node & Wallet', Logo: KDXLogo, url: 'https://kdx.app/' },
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
                      const WalletLogo = wallet.Logo;
                      const isExtensionMissing = wallet.id === 'kasware' && typeof window === 'object' && !window.kasware;
                      
                      return (
                        <button 
                          key={wallet.id}
                          onClick={() => handleWalletClick(wallet)}
                          disabled={isConnecting}
                          className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] hover:bg-[#1a1a1a] transition-all group disabled:opacity-50"
                        >
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                            <WalletLogo />
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
                      <strong>Security Warning:</strong> Never enter a Mainnet seed phrase or private key into a browser application. Use this only for Testnet-10 development.
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
                  Covex Testnet-10 Environment
                </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WalletButton;
