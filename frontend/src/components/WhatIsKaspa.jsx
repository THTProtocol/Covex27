import React, { useEffect } from 'react';
import { X } from 'lucide-react'; // ONLY importing X to guarantee no export crashes

const WhatIsKaspa = ({ isOpen, onClose }) => {
  // Safe visibility check
  const isVisible = isOpen === undefined ? true : isOpen;

  useEffect(() => {
    if (isVisible) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#0a0a0a] overflow-y-auto w-full h-full">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 flex justify-between items-center p-6 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <h2 className="text-xl font-bold text-white tracking-wide">Understanding Kaspa</h2>
        </div>
        <button 
          onClick={onClose} 
          className="p-2 bg-[#111111] border border-[#1f1f1f] rounded-lg text-gray-400 hover:text-white hover:border-[#49EACB] transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* Main Content Container */}
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16 pb-24">
        
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            The Fastest, Open-Source, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] to-[#3bc2a6]">Decentralized Layer-1</span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed">
            Kaspa is a revolutionary BlockDAG that fundamentally solves the blockchain trilemma. 
            Instead of discarding parallel blocks as "orphans," Kaspa incorporates them all into the consensus, 
            enabling unprecedented transaction speeds without sacrificing security or decentralization.
          </p>
        </div>

        {/* Core Architecture Grid */}
        <div className="space-y-6">
          <h3 className="text-2xl font-semibold text-white flex items-center gap-2">
            ⚙️ Core Architecture
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors">
              <div className="text-3xl mb-4">⚡</div>
              <h4 className="text-lg font-bold text-white mb-2">10 Blocks Per Second</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Running at 10 BPS on mainnet since the Rust rewrite, making it the fastest Proof-of-Work network on earth. Transactions settle almost instantly.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors">
              <div className="text-3xl mb-4">🕸️</div>
              <h4 className="text-lg font-bold text-white mb-2">BlockDAG Engine</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Blocks are not a single chain. Multiple blocks are created concurrently and ordered mathematically via the GHOSTDAG consensus protocol.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors">
              <div className="text-3xl mb-4">🛡️</div>
              <h4 className="text-lg font-bold text-white mb-2">Nakamoto Consensus</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Kaspa retains the exact security assumptions of Bitcoin. No pre-mine, no ICO, 100% fair launched, and purely decentralized.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors">
              <div className="text-3xl mb-4">⛏️</div>
              <h4 className="text-lg font-bold text-white mb-2">kHeavyHash PoW</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                An ASIC-resistant, optical-miner friendly algorithm that secures the network efficiently while preventing centralized mining dominance.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors">
              <div className="text-3xl mb-4">📜</div>
              <h4 className="text-lg font-bold text-white mb-2">Native Covenants</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Introduced in the Toccata hardfork via SilverScript. Enables stateless smart contracts and programmable UTXOs directly on Layer-1.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors">
              <div className="text-3xl mb-4">🚀</div>
              <h4 className="text-lg font-bold text-white mb-2">DAGKNIGHT</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                The next evolutionary step in Kaspa's consensus mechanism, targeting 100+ BPS by automatically adapting to network latency in real-time.
              </p>
            </div>

          </div>
        </div>

        {/* Whitepapers & Research */}
        <div className="space-y-6">
          <h3 className="text-2xl font-semibold text-white flex items-center gap-2">
            📚 Research & Whitepapers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <a href="https://eprint.iacr.org/2018/104.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between p-6 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded bg-[#1a1a1a] flex items-center justify-center text-gray-400 text-2xl group-hover:text-[#49EACB]">
                  📄
                </div>
                <div>
                  <h4 className="text-white font-medium text-lg">PHANTOM & GHOSTDAG</h4>
                  <p className="text-sm text-gray-500 mt-1">A Scalable Generalization of Nakamoto Consensus</p>
                </div>
              </div>
              <span className="text-gray-500 group-hover:text-[#49EACB]">↗</span>
            </a>

            <a href="https://eprint.iacr.org/2022/1494.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between p-6 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded bg-[#1a1a1a] flex items-center justify-center text-gray-400 text-2xl group-hover:text-[#49EACB]">
                  📄
                </div>
                <div>
                  <h4 className="text-white font-medium text-lg">DAGKNIGHT Protocol</h4>
                  <p className="text-sm text-gray-500 mt-1">Parameterless Generalization of Nakamoto Consensus</p>
                </div>
              </div>
              <span className="text-gray-500 group-hover:text-[#49EACB]">↗</span>
            </a>

          </div>
        </div>

      </div>
    </div>
  );
};

export default WhatIsKaspa;
