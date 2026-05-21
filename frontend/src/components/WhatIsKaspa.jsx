import React, { useEffect } from 'react';
import { X, Zap, Globe, Shield, Cpu, FileText, ExternalLink, Code, Layers, Server, BookOpen } from 'lucide-react';

const WhatIsKaspa = ({ isOpen, onClose }) => {
  // Strictly obey the parent component. If it doesn't say open, stay invisible.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#0a0a0a] overflow-y-auto w-full h-full animate-in fade-in duration-300">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 flex justify-between items-center p-6 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#49EACB]/10 flex items-center justify-center border border-[#49EACB]/30">
            <Globe size={18} className="text-[#49EACB]" />
          </div>
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
            <Layers size={24} className="text-[#49EACB]" /> Core Architecture
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
              <Zap size={28} className="text-[#49EACB] mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-lg font-bold text-white mb-2">10 Blocks Per Second</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Running at 10 BPS on mainnet since the Rust rewrite, making it the fastest Proof-of-Work network on earth. Transactions settle almost instantly.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
              <Globe size={28} className="text-[#49EACB] mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-lg font-bold text-white mb-2">BlockDAG Engine</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Blocks are not a single chain. Multiple blocks are created concurrently and ordered mathematically via the GHOSTDAG consensus protocol.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
              <Shield size={28} className="text-[#49EACB] mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-lg font-bold text-white mb-2">Nakamoto Consensus</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Kaspa retains the exact security assumptions of Bitcoin. No pre-mine, no ICO, 100% fair launched, and purely decentralized.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
              <Server size={28} className="text-[#49EACB] mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-lg font-bold text-white mb-2">kHeavyHash PoW</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                An ASIC-resistant, optical-miner friendly algorithm that secures the network efficiently while preventing centralized mining dominance.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
              <Code size={28} className="text-[#49EACB] mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-lg font-bold text-white mb-2">Native Covenants</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Introduced in the Toccata hardfork via SilverScript. Enables stateless smart contracts and programmable UTXOs directly on Layer-1.
              </p>
            </div>

            <div className="p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
              <Cpu size={28} className="text-[#49EACB] mb-4 group-hover:scale-110 transition-transform" />
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
            <BookOpen size={24} className="text-[#49EACB]" /> Research Library
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <a href="https://eprint.iacr.org/2018/104.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between p-5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                  <FileText size={20} />
                </div>
                <div>
                  <h4 className="text-white font-medium">PHANTOM & GHOSTDAG</h4>
                  <p className="text-xs text-gray-500 mt-0.5">A Scalable Generalization of Nakamoto Consensus</p>
                </div>
              </div>
              <ExternalLink size={18} className="text-gray-500 group-hover:text-[#49EACB]" />
            </a>

            <a href="https://eprint.iacr.org/2022/1494.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between p-5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                  <FileText size={20} />
                </div>
                <div>
                  <h4 className="text-white font-medium">DAGKNIGHT Protocol</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Parameterless Generalization of Nakamoto Consensus</p>
                </div>
              </div>
              <ExternalLink size={18} className="text-gray-500 group-hover:text-[#49EACB]" />
            </a>

            <a href="https://github.com/kaspanet/docs/blob/main/Design/covenants.md" target="_blank" rel="noreferrer" className="flex items-center justify-between p-5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                  <Code size={20} />
                </div>
                <div>
                  <h4 className="text-white font-medium">Toccata Covenants</h4>
                  <p className="text-xs text-gray-500 mt-0.5">SilverScript Smart Contract Architecture</p>
                </div>
              </div>
              <ExternalLink size={18} className="text-gray-500 group-hover:text-[#49EACB]" />
            </a>

            <a href="https://github.com/kaspanet/rusty-kaspa" target="_blank" rel="noreferrer" className="flex items-center justify-between p-5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                  <Cpu size={20} />
                </div>
                <div>
                  <h4 className="text-white font-medium">Rusty Kaspa</h4>
                  <p className="text-xs text-gray-500 mt-0.5">High-Performance Rust Node Implementation</p>
                </div>
              </div>
              <ExternalLink size={18} className="text-gray-500 group-hover:text-[#49EACB]" />
            </a>

          </div>
        </div>

      </div>
    </div>
  );
};

export default WhatIsKaspa;
