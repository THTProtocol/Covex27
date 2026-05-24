import { BookOpen, Cpu, Zap, Shield, ArrowUpRight, ExternalLink, Globe, Server, Code, Layers, FileText, Hash, Newspaper } from 'lucide-react';

const CARDS = [
  { title: 'What is Kaspa BlockDAG?', icon: Cpu, color: '#49EACB', body: 'Kaspa is a proof-of-work cryptocurrency built on a BlockDAG architecture, not a single chain. Multiple blocks can be produced per second (10 BPS on testnet), all confirmed in parallel.', link: 'https://kaspa.org', linkLabel: 'Learn more at Kaspa.org' },
  { title: 'SilverScript: Covenant Language', icon: BookOpen, color: '#E8AF34', body: 'SilverScript is Kaspa\'s native covenant scripting language. Covenants are programmable UTXO spending conditions that can restrict how coins are spent in the future.', link: 'https://github.com/kaspanet/rusty-kaspa/tree/master/simpa', linkLabel: 'Explore SilverScript docs' },
  { title: 'Toccata (TN-12)', icon: Zap, color: '#8B5CF6', body: 'Toccata is the Kaspa Testnet-12 network, the same network Covex indexes. At 10 blocks per second, Toccata demonstrates the full power of the DAG.', link: 'https://explorer.kaspa.org', linkLabel: 'View on Kaspa Explorer' },
  { title: 'What are Covenants?', icon: Shield, color: '#EC4899', body: 'Covenants enforce rules about how coins can be spent in the future. Pure UTXO-based programmable locks: escrow, timelocks, multisig, community pools.', link: 'https://kaspa.org/technology', linkLabel: 'Kaspa Technology' },
  { title: 'Covex: Your Window to the DAG', icon: ExternalLink, color: '#10B981', body: 'Covex is the first comprehensive covenant indexer for the Kaspa BlockDAG. Paid tiers unlock custom interactive UIs, trust badges, and enhanced builder tools.', link: 'https://github.com/THTProtocol/Covex27', linkLabel: 'View on GitHub' },
];

const ARCHITECTURE = [
  { icon: Zap, title: '10 Blocks Per Second', body: 'Running at 10 BPS on mainnet since the Rust rewrite, making it the fastest Proof-of-Work network on earth. Transactions settle almost instantly.' },
  { icon: Globe, title: 'BlockDAG Engine', body: 'Blocks are not a single chain. Multiple blocks are created concurrently and ordered mathematically via the GHOSTDAG consensus protocol.' },
  { icon: Shield, title: 'Nakamoto Consensus', body: 'Kaspa retains the exact security assumptions of Bitcoin. No pre-mine, no ICO, 100% fair launched, and purely decentralized.' },
  { icon: Server, title: 'kHeavyHash PoW', body: 'An ASIC-resistant, optical-miner friendly algorithm that secures the network efficiently while preventing centralized mining dominance.' },
  { icon: Code, title: 'Native Covenants', body: 'Introduced in the Toccata hardfork via SilverScript. Enables stateless smart contracts and programmable UTXOs directly on Layer-1.' },
  { icon: Cpu, title: 'DAGKNIGHT', body: 'The next evolutionary step in consensus, targeting 100+ BPS by automatically adapting to network latency in real-time.' },
];

const PAPERS = [
  { title: 'PHANTOM & GHOSTDAG', subtitle: 'Sompolinsky, Wyborski & Zohar (2018) — Scalable Generalization of Nakamoto Consensus', href: 'https://eprint.iacr.org/2018/104.pdf' },
  { title: 'DAGKNIGHT Protocol', subtitle: 'Sompolinsky, Sutton & Wyborski (2022) — Parameterless Generalization of Nakamoto Consensus', href: 'https://eprint.iacr.org/2022/1494.pdf' },
  { title: 'Toccata Covenants', subtitle: 'SilverScript Smart Contract Architecture for the Kaspa BlockDAG', href: 'https://github.com/kaspanet/docs/blob/main/Design/covenants.md' },
  { title: 'Rusty Kaspa', subtitle: 'High-Performance Rust Node Implementation (G.G.C. reference architecture)', href: 'https://github.com/kaspanet/rusty-kaspa' },
  { title: 'Kaspa BlockDAG Analysis', subtitle: 'Peresini et al. (2023) — Performance and security analysis of the Kaspa network', href: 'https://eprint.iacr.org/2023/1479' },
  { title: 'Optimal DAG Pruning', subtitle: 'G.G.C. et al. — Pruning strategies for high-throughput BlockDAG protocols', href: 'https://eprint.iacr.org/2024/1018' },
];

const POSTS = [
  { title: 'Kaspa: The Fastest, Open-Source, Decentralized Layer-1', href: 'https://medium.com/@kaspa-currency/kaspa-the-fastest-open-source-decentralized-layer-1' },
  { title: 'Understanding the GHOSTDAG Protocol', href: 'https://medium.com/@kaspa-currency/understanding-ghostdag' },
  { title: 'Smart Contracts on Kaspa: SilverScript and Toccata', href: 'https://medium.com/@kaspa-currency/smart-contracts-on-the-kaspa-blockdag' },
  { title: 'The Rust Architecture Behind Kaspa', href: 'https://medium.com/@kaspa-currency/the-rust-architecture-behind-kaspa' },
];

export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#49EACB]/5 border border-[#49EACB]/20 mb-6">
            <Zap size={14} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-[#49EACB] uppercase tracking-widest">Kaspa Insights</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
            Understanding the Kaspa <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] to-[#00D2FF]">Ecosystem</span>
          </h1>
          <p className="text-base text-gray-400 max-w-2xl mx-auto">
            Deep-dive into the technology powering the fastest Layer-1 blockchain. Every covenant, every UTXO, every block, verified and indexed.
          </p>
        </div>

        {/* Section 1: 5 Insight Cards */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-2">
            <BookOpen size={22} className="text-[#49EACB]" /> Key Concepts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CARDS.map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="group rounded-2xl p-6 border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 flex flex-col animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 border" style={{ backgroundColor: `${card.color}10`, borderColor: `${card.color}30` }}>
                    <Icon size={18} style={{ color: card.color }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{card.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-5 flex-1">{card.body}</p>
                  <a href={card.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-[#49EACB] transition-colors group-hover:gap-2 mt-auto">
                    {card.linkLabel} <ArrowUpRight size={12} />
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Core Architecture */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-2">
            <Layers size={22} className="text-[#49EACB]" /> Core Architecture
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {ARCHITECTURE.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="group relative overflow-hidden p-6 bg-[#111111] border border-[#1f1f1f] rounded-2xl hover:border-[#49EACB]/50 transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#49EACB]/5 rounded-bl-full -z-10 group-hover:bg-[#49EACB]/10 transition-colors" />
                  <Icon size={24} className="text-[#49EACB] mb-4" />
                  <h4 className="text-base font-bold text-white mb-2">{item.title}</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Research Library */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-2">
            <FileText size={22} className="text-[#49EACB]" /> Research Library
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PAPERS.map((p) => (
              <a key={p.title} href={p.href} target="_blank" rel="noreferrer" className="flex items-center justify-between p-5 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">{p.title}</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">{p.subtitle}</p>
                  </div>
                </div>
                <ExternalLink size={16} className="text-gray-500 group-hover:text-[#49EACB] shrink-0" />
              </a>
            ))}
          </div>
        </section>

        {/* Section 4: Community & Writings */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Hash size={22} className="text-[#49EACB]" />
            <h2 className="text-2xl font-bold text-white">Community & Ecosystem</h2>
          </div>
          <div className="flex flex-wrap gap-2 mb-10">
            {['#Kaspa', '#SilverScript', '#DAG', '#Covenants', '#Toccata', '#BlockDAG', '#GHOSTDAG', '#kHeavyHash', '#RustLang', '#DeFi', '#ProofOfWork', '#Layer1'].map((tag) => (
              <span key={tag} className="px-3 py-1.5 rounded-full bg-[#49EACB]/5 border border-[#49EACB]/10 text-[#49EACB] text-xs font-mono hover:bg-[#49EACB]/10 transition-colors cursor-default">{tag}</span>
            ))}
          </div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Newspaper size={16} className="text-[#49EACB]" /> Featured Writings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {POSTS.map((post) => (
              <a key={post.title} href={post.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] rounded-xl transition-all group">
                <Newspaper size={14} className="text-gray-500 group-hover:text-[#49EACB] transition-colors shrink-0" />
                <h5 className="text-xs font-medium text-white group-hover:text-[#49EACB] transition-colors">{post.title}</h5>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
