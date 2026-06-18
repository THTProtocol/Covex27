import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const WhatIsKaspa = ({ open, onClose }) => {
  
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#0a0a0a] overflow-y-auto w-full h-full">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 flex justify-between items-center p-6 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/[0.06]">
        <h2 className="text-xl font-bold text-white">Understanding Kaspa</h2>
        <button 
          onClick={onClose} 
          className="p-2 rounded-lg border border-white/[0.06] text-gray-200 hover:text-white hover:border-white/15 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12 pb-24">
        
        {/* Hero */}
        <header className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            The Fastest, Open-Source,{' '}
            <span className="text-kaspa-green">Decentralized Layer-1</span>
          </h1>
          <p className="text-base text-gray-200 leading-relaxed">
            Kaspa is a revolutionary BlockDAG that fundamentally solves the blockchain trilemma. 
            Instead of discarding parallel blocks as "orphans," Kaspa incorporates them all into the consensus, 
            enabling unprecedented transaction speeds without sacrificing security or decentralization.
          </p>
        </header>

        {/* Core Architecture */}
        <section>
          <h2 className="text-xl font-bold text-white mb-5">Core Architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: '10 Blocks Per Second', body: 'Running at 10 BPS on mainnet since the Rust rewrite, making it the fastest Proof-of-Work network on earth.' },
              { title: 'BlockDAG Engine', body: 'Multiple blocks are created concurrently and ordered mathematically via the GHOSTDAG consensus protocol.' },
              { title: 'Nakamoto Consensus', body: 'Kaspa retains the exact security assumptions of Bitcoin. No pre-mine, 100% fair launch.' },
              { title: 'kHeavyHash PoW', body: 'ASIC-resistant, optical-miner friendly algorithm that prevents centralized mining dominance.' },
              { title: 'Native Covenants', body: 'SilverScript enables stateless smart contracts and programmable UTXOs directly on Layer-1.' },
              { title: 'DAGKNIGHT', body: 'Next-gen consensus targeting 100+ BPS by adapting to network latency in real-time.' },
            ].map(item => (
              <div key={item.title} className="p-5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <h3 className="text-sm font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-200 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Research Library */}
        <section>
          <h2 className="text-xl font-bold text-white mb-5">Research Library</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: 'PHANTOM & GHOSTDAG', subtitle: 'Sompolinsky, Wyborski & Zohar. A Scalable Generalization of Nakamoto Consensus (2018)', href: 'https://eprint.iacr.org/2018/104.pdf' },
              { title: 'DAGKNIGHT Protocol', subtitle: 'Sompolinsky, Sutton & Wyborski. Parameterless Generalization of Nakamoto Consensus (2022)', href: 'https://eprint.iacr.org/2022/1494.pdf' },
              { title: 'Kaspa BlockDAG Analysis', subtitle: 'Peresini et al. Comprehensive performance and security analysis (2023)', href: 'https://eprint.iacr.org/2023/1479' },
              { title: 'Rusty Kaspa', subtitle: 'High-Performance Rust Node Implementation', href: 'https://github.com/kaspanet/rusty-kaspa' },
            ].map(p => (
              <a
                key={p.title}
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="block p-4 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.03] transition-colors"
              >
                <h4 className="text-sm font-semibold text-white">{p.title}</h4>
                <p className="text-xs text-gray-200 mt-1 leading-snug">{p.subtitle}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Explore the mainnet */}
        <section>
          <h2 className="text-xl font-bold text-white mb-5">Explore the Mainnet</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: 'Kaspa Mainnet Explorer', subtitle: 'Browse blocks, transactions, and addresses on kaspa.stream', href: 'https://kaspa.stream' },
              { title: 'Kaspa Official Site', subtitle: 'kaspa.org: the project home, wallets, and getting started', href: 'https://kaspa.org' },
              { title: 'Covex Explorer', subtitle: 'Every covenant on Kaspa, indexed and verifiable here', href: '/' },
              { title: 'Rusty Kaspa Node', subtitle: 'Run your own mainnet node and verify the chain yourself', href: 'https://github.com/kaspanet/rusty-kaspa' },
            ].map(p => (
              <a
                key={p.title}
                href={p.href}
                target={p.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="block p-4 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-kaspa-green/30 hover:bg-white/[0.03] transition-colors"
              >
                <h4 className="text-sm font-semibold text-white">{p.title}</h4>
                <p className="text-xs text-gray-200 mt-1 leading-snug">{p.subtitle}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Community */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-white">Community & Ecosystem</h2>
          <div className="flex flex-wrap gap-2">
            {['#Kaspa', '#SilverScript', '#DAG', '#Covenants', '#Toccata', '#BlockDAG', '#GHOSTDAG', '#kHeavyHash', '#RustLang', '#ProofOfWork', '#Layer1'].map(tag => (
              <span key={tag} className="px-3 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] text-xs font-mono text-gray-200">
                {tag}
              </span>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};

export default WhatIsKaspa;
