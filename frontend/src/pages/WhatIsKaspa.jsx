import { BookOpen, Cpu, Zap, Shield, ArrowUpRight, ExternalLink } from 'lucide-react';

const CARDS = [
  {
    title: 'What is Kaspa BlockDAG?',
    icon: Cpu,
    color: '#49EACB',
    body: 'Kaspa is a proof-of-work cryptocurrency built on a BlockDAG architecture, not a single chain. Multiple blocks can be produced per second (10 BPS on testnet), all confirmed in parallel. This gives Kaspa unmatched speed without sacrificing decentralization. No side-chains, no layer-2s. Pure proof-of-work parallelism.',
    link: 'https://kaspa.org',
    linkLabel: 'Learn more at Kaspa.org',
  },
  {
    title: 'SilverScript: Covenant Language',
    icon: BookOpen,
    color: '#E8AF34',
    body: 'SilverScript is Kaspa\'s native covenant scripting language. Covenants are programmable UTXO spending conditions that can restrict how coins are spent in the future. They enable powerful on-chain primitives: escrow, timelocks, multisig, and community-managed pools. All trustless and transparent.',
    link: 'https://github.com/kaspanet/rusty-kaspa/tree/master/simpa',
    linkLabel: 'Explore SilverScript docs',
  },
  {
    title: 'Toccata (TN-12)',
    icon: Zap,
    color: '#8B5CF6',
    body: 'Toccata is the Kaspa Testnet-12 network, the same network Covex indexes. At 10 blocks per second, Toccata demonstrates the full power of the DAG. Every covenant listed on Covex lives on TN-12 and benefits from Kaspa\'s instant transaction finality. 100% proof-of-work. Zero compromises.',
    link: 'https://explorer.kaspa.org',
    linkLabel: 'View on Kaspa Explorer',
  },
  {
    title: 'What are Covenants?',
    icon: Shield,
    color: '#EC4899',
    body: 'Covenants are the future of programmable money. Unlike simple send/receive, covenants enforce rules about how coins can be spent in the future. Think of them as smart contracts without complexity. Pure UTXO-based programmable locks. Community pools, vesting schedules, collaborative multi-sigs. All powered by SilverScript.',
    link: 'https://kaspa.org/technology',
    linkLabel: 'Kaspa Technology',
  },
  {
    title: 'Covex: Your Window to the DAG',
    icon: ExternalLink,
    color: '#10B981',
    body: 'Covex is the first comprehensive covenant indexer for the Kaspa BlockDAG. We automatically detect, classify, and display every covenant on TN-12. Paid tiers unlock custom interactive UIs, trust badges, and enhanced builder tools. Chain is the truth. Covex is the window.',
    link: 'https://github.com/THTProtocol/Covex27',
    linkLabel: 'View on GitHub',
  },
];

export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#49EACB]/5 border border-[#49EACB]/20 mb-6">
            <Zap size={14} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-[#49EACB] uppercase tracking-widest">Kaspa Insights</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
            Understanding the Kaspa{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] to-[#00D2FF]">Ecosystem</span>
          </h1>
          <p className="text-base text-gray-400 max-w-2xl mx-auto">
            Deep-dive into the technology powering the fastest Layer-1 blockchain. Every covenant, every UTXO, every block — verified and indexed.
          </p>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
          {CARDS.map((card, i) => {
            const Icon = card.icon;
            const delay = `${i * 100}ms`;
            return (
              <div
                key={card.title}
                className="group rounded-2xl p-6 border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 flex flex-col animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: delay, animationFillMode: 'both' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 border"
                  style={{ backgroundColor: `${card.color}10`, borderColor: `${card.color}30` }}
                >
                  <Icon size={18} style={{ color: card.color }} />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{card.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5 flex-1">{card.body}</p>
                <a
                  href={card.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-[#49EACB] transition-colors group-hover:gap-2 mt-auto"
                >
                  {card.linkLabel}
                  <ArrowUpRight size={12} />
                </a>
              </div>
            );
          })}
        </div>

        {/* Bottom divider */}
        <div className="flex items-center gap-4 opacity-30">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#49EACB]/40 to-transparent" />
          <span className="text-[10px] text-gray-600 font-mono">BLOCKDAG FACTS</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#49EACB]/40 to-transparent" />
        </div>
      </div>
    </div>
  );
}
