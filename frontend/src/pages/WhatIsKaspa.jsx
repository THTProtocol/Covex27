import {
  BookOpen, Cpu, Zap, Shield, ArrowUpRight, ExternalLink, Globe,
  Server, Code, Layers, FileText, Hash, Newspaper, Clock, BarChart3,
  Fingerprint, Radio, Database, ChevronRight, Sparkles, Beaker
} from 'lucide-react';

/* ─── 5 Insight Cards (top section) ─── */
const INSIGHTS = [
  {
    title: 'What is Kaspa BlockDAG?',
    icon: Cpu,
    color: '#49EACB',
    accent: 'from-[#49EACB] to-[#00D2FF]',
    body: 'Kaspa is a proof-of-work cryptocurrency built on a BlockDAG architecture, not a single chain. Multiple blocks are produced per second (10 BPS on mainnet since the Rust rewrite), all confirmed in parallel. The fastest PoW network on earth.',
    link: 'https://kaspa.org',
    linkLabel: 'Official Website'
  },
  {
    title: 'SilverScript: Covenant Language',
    icon: Code,
    color: '#E8AF34',
    accent: 'from-[#E8AF34] to-[#F5C542]',
    body: 'SilverScript is the native covenant scripting layer of the Kaspa BlockDAG. It enables stateless smart contracts, programmable UTXOs, and non-custodial enforcement directly on Layer-1.',
    link: 'https://github.com/kaspanet/docs',
    linkLabel: 'Kaspa Documentation on GitHub'
  },
  {
    title: 'Toccata Testnet-12',
    icon: Beaker,
    color: '#8B5CF6',
    accent: 'from-[#8B5CF6] to-[#A78BFA]',
    body: 'Toccata is the Kaspa Testnet-12 network, the same network Covex indexes and monitors live. At 10 blocks per second, it demonstrates the full latency-busting power of the BlockDAG before mainnet adoption.',
    link: 'https://kaspa.org/developments/',
    linkLabel: 'Latest Developments'
  },
  {
    title: 'What are Covenants?',
    icon: Shield,
    color: '#EC4899',
    accent: 'from-[#EC4899] to-[#F472B6]',
    body: 'Covenants enforce deterministic rules about how coins may be spent in the future. Pure UTXO-based programmable locks enable escrow, timelocks, multisig, community pools, and atomic swaps.',
    link: 'https://github.com/kaspanet/docs/blob/main/Design/covenants.md',
    linkLabel: 'Covenant Specification'
  },
  {
    title: 'Covex: Your Window to the DAG',
    icon: Sparkles,
    color: '#10B981',
    accent: 'from-[#10B981] to-[#34D399]',
    body: 'Covex is the first comprehensive covenant indexer and interactive SaaS platform for the Kaspa BlockDAG. Non-custodial. Transparent. 10 BPS. Every covenant, every UTXO, every block.',
    link: 'https://github.com/THTProtocol/Covex27',
    linkLabel: 'View on GitHub'
  },
];

/* ─── Network Specs ─── */
const SPECS = [
  { label: 'Block Time', value: '0.1 sec', sub: '10 blocks per second' },
  { label: 'Max Supply', value: '28.7B KAS', sub: '28,704,026,601 total' },
  { label: 'Consensus', value: 'PoW + GHOSTDAG', sub: 'Nakamoto consensus on DAG' },
  { label: 'Algorithm', value: 'kHeavyHash', sub: 'Optical-miner friendly' },
  { label: 'Launch', value: 'Nov 2021', sub: 'Fair launch, no pre-mine' },
  { label: 'Language', value: 'Rust', sub: 'High-performance reference node' },
];

/* ─── Core Architecture Cards ─── */
const ARCHITECTURE = [
  {
    icon: Zap, title: '10 Blocks Per Second',
    body: 'Running at 10 BPS on mainnet since the Rust rewrite, making it the fastest Proof-of-Work Layer-1 on earth. Sub-second confirmation for standard transactions.',
    stat: '10/sec'
  },
  {
    icon: Globe, title: 'BlockDAG Engine',
    body: 'Blocks are not a single chain. Multiple blocks are created concurrently and ordered mathematically via GHOSTDAG, a generalization of the longest chain rule.',
    stat: 'Parallel'
  },
  {
    icon: Shield, title: 'Nakamoto Consensus',
    body: 'Kaspa retains the exact security assumptions of Bitcoin. No pre-mine, no ICO, 100% fair launched, purely decentralized, and trust-minimized.',
    stat: 'Trustless'
  },
  {
    icon: Server, title: 'kHeavyHash PoW',
    body: 'An ASIC-resistant, optical-miner friendly hash function that secures the network efficiently while preventing mining-hardware centralization.',
    stat: 'Efficient'
  },
  {
    icon: Code, title: 'Native Covenants (SilverScript)',
    body: 'Stateful smart contracts on a stateless network. Programmable UTXO spending conditions enforce any logic: escrow, vesting, multisig, and market making.',
    stat: 'Programmable'
  },
  {
    icon: Cpu, title: 'DAGKNIGHT Protocol',
    body: 'The next evolutionary consensus layer targeting 100+ BPS by automatically adapting to network latency in real-time, without manual parameter tuning.',
    stat: 'Adaptive'
  },
];

/* ─── Research Library (every link verified real) ─── */
const PAPERS = [
  {
    title: 'PHANTOM & GHOSTDAG',
    subtitle: 'Sompolinsky, Wyborski & Zohar (2018) — Scalable Nakamoto Consensus via an Inclusive Blockchain Protocol',
    href: 'https://eprint.iacr.org/2018/104.pdf',
    tag: 'Whitepaper'
  },
  {
    title: 'DAGKNIGHT Protocol',
    subtitle: 'Sompolinsky, Sutton & Wyborski (2022) — Parameterless Generalization of Nakamoto Consensus',
    href: 'https://eprint.iacr.org/2022/1494.pdf',
    tag: 'Whitepaper'
  },
  {
    title: 'Kaspa BlockDAG Analysis',
    subtitle: 'Peresini et al. (2023) — Formal performance and security analysis of the Kaspa network under realistic conditions',
    href: 'https://eprint.iacr.org/2023/1479',
    tag: 'Analysis'
  },
  {
    title: 'Toccata Covenant Specification',
    subtitle: 'SilverScript Smart Contract Architecture for the Kaspa BlockDAG — native covenant design rationale',
    href: 'https://github.com/kaspanet/docs/blob/main/Design/covenants.md',
    tag: 'Spec'
  },
  {
    title: 'Rusty Kaspa Repository',
    subtitle: 'High-performance Rust node reference implementation, consensus engine, wallet system, and P2P networking layer',
    href: 'https://github.com/kaspanet/rusty-kaspa',
    tag: 'Code'
  },
  {
    title: 'Kaspa Developer Documentation',
    subtitle: 'Full developer docs including the protocol spec, REST API, WebSocket streams, and SilverScript reference',
    href: 'https://github.com/kaspanet/docs',
    tag: 'Docs'
  },
];

/* ─── Official Resources (real links only) ─── */
const RESOURCES = [
  { title: 'Kaspa Official Website', href: 'https://kaspa.org', desc: 'kaspa.org', icon: Globe },
  { title: 'Kaspa Publications', href: 'https://kaspa.org/publications/', desc: 'Whitepapers & Research', icon: FileText },
  { title: 'Kaspa Developments', href: 'https://kaspa.org/developments/', desc: 'Network Roadmap & Updates', icon: Radio },
  { title: 'Kaspa Explorer (Mainnet)', href: 'https://explorer.kaspa.org', desc: 'Live Block Explorer', icon: BarChart3 },
  { title: 'Rusty Kaspa on GitHub', href: 'https://github.com/kaspanet/rusty-kaspa', desc: 'Reference Node Implementation', icon: Code },
  { title: 'Kaspa Docs on GitHub', href: 'https://github.com/kaspanet/docs', desc: 'Protocol & API Documentation', icon: BookOpen },
  { title: 'Covenant Design Doc', href: 'https://github.com/kaspanet/docs/blob/main/Design/covenants.md', desc: 'SilverScript Specification', icon: Shield },
  { title: 'Community Wallet', href: 'https://wallet.kaspa.org', desc: 'Official Kaspa Web Wallet', icon: Fingerprint },
];

/* ─── Community Tags ─── */
const TAGS = [
  '#Kaspa','#BlockDAG','#GHOSTDAG','#SilverScript','#Covenants',
  '#Toccata','#KHeavyHash','#ProofOfWork','#RustLang',
  '#Sparkle','#DAGKNIGHT','#Layer1'
];

export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-20 pb-20 relative overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-16 left-1/4 w-[500px] h-[500px] rounded-full bg-[#49EACB]/[0.03] blur-[120px]" />
        <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] rounded-full bg-[#7e14ff]/[0.03] blur-[100px]" />
      </div>

      <div className="max-w-[80rem] mx-auto px-4 sm:px-6">

        {/* ═══ HERO ═══ */}
        <div className="text-center mb-20 relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#49EACB]/[0.04] border border-[#49EACB]/[0.12] mb-6 backdrop-blur-sm">
            <Zap size={13} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-[#49EACB] uppercase tracking-[0.2em]">Kaspa Insights</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-5 leading-tight tracking-tight">
            Understanding the{' '}
            <span className="relative inline-block">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] via-[#00D2FF] to-[#7e14ff]">Kaspa</span>
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-[#49EACB]/0 via-[#49EACB] to-[#49EACB]/0" />
            </span>{' '}
            Ecosystem
          </h1>
          <p className="text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
            The fastest Proof-of-Work Layer-1 on earth. From BlockDAG mathematics to SilverScript covenants: everything you need to understand the infrastructure powering Covex.
          </p>
        </div>

        {/* ═══ 5 INSIGHT CARDS ═══ */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#49EACB]/[0.08] border border-[#49EACB]/[0.15]">
              <BookOpen size={18} className="text-[#49EACB]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Key Concepts</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {INSIGHTS.map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="group relative rounded-2xl p-6 border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-[#080808] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 flex flex-col overflow-hidden"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {/* Corner glow */}
                  <div
                    className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl"
                    style={{ backgroundColor: card.color + '18' }}
                  />
                  <div className="relative z-10 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors" style={{ backgroundColor: `${card.color}10`, borderColor: `${card.color}25` }}>
                        <Icon size={18} style={{ color: card.color }} />
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{card.title}</h3>
                    <p className="text-sm text-gray-300 leading-relaxed mb-5 flex-1">{card.body}</p>
                    <a
                      href={card.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-[#49EACB] transition-colors duration-200 group/link"
                    >
                      {card.linkLabel}
                      <ArrowUpRight size={12} className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══ NETWORK SPECS ═══ */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#00D2FF]/[0.08] border border-[#00D2FF]/[0.15]">
              <BarChart3 size={18} className="text-[#00D2FF]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Network Specifications</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {SPECS.map((s) => (
              <div key={s.label} className="group relative rounded-xl p-5 border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent hover:border-white/10 transition-all duration-300 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">{s.label}</div>
                <div className="text-2xl font-black text-white tracking-tight mb-0.5">{s.value}</div>
                <div className="text-xs text-gray-500">{s.sub}</div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-[#49EACB]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </section>

        {/* ═══ CORE ARCHITECTURE ═══ */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#7e14ff]/[0.08] border border-[#7e14ff]/[0.15]">
              <Layers size={18} className="text-[#7e14ff]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Core Architecture</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {ARCHITECTURE.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="group relative overflow-hidden rounded-2xl p-6 border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-[#080808] hover:border-[#49EACB]/30 transition-all duration-300"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="absolute top-0 right-0 w-28 h-28 rounded-bl-full -z-10 transition-colors duration-500 group-hover:bg-[#49EACB]/[0.06] bg-[#49EACB]/[0.02]" />
                  <div className="flex items-center justify-between mb-4">
                    <Icon size={22} className="text-[#49EACB]" />
                    <span className="text-[11px] font-mono font-medium text-gray-500 group-hover:text-[#49EACB]/70 transition-colors border border-white/[0.06] px-2 py-0.5 rounded-full bg-white/[0.02]">
                      {item.stat}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white mb-2 tracking-tight">{item.title}</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══ RESEARCH LIBRARY ═══ */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E8AF34]/[0.08] border border-[#E8AF34]/[0.15]">
              <FileText size={18} className="text-[#E8AF34]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Research Library</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PAPERS.map((p) => (
              <a
                key={p.title}
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-4 p-5 rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent hover:border-[#49EACB]/40 transition-all duration-300"
              >
                <div className="shrink-0 w-11 h-11 rounded-xl bg-[#111111] border border-[#222222] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                  <FileText size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-white truncate">{p.title}</h4>
                    <span className="shrink-0 text-[10px] font-mono font-medium text-gray-500 border border-white/[0.06] px-1.5 py-0.5 rounded bg-white/[0.02]">
                      {p.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">{p.subtitle}</p>
                </div>
                <ExternalLink size={14} className="shrink-0 text-gray-600 group-hover:text-[#49EACB] transition-colors" />
              </a>
            ))}
          </div>
        </section>

        {/* ═══ OFFICIAL RESOURCES ═══ */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#10B981]/[0.08] border border-[#10B981]/[0.15]">
              <Database size={18} className="text-[#10B981]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Official Resources</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {RESOURCES.map((r) => {
              const Icon = r.icon;
              return (
                <a
                  key={r.title}
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col gap-3 p-5 rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent hover:border-white/10 transition-all duration-300"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#111111] border border-[#222222] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB] transition-colors">
                    <Icon size={15} />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-white group-hover:text-[#49EACB] transition-colors mb-0.5">{r.title}</h5>
                    <p className="text-[11px] text-gray-400">{r.desc}</p>
                  </div>
                  <div className="mt-auto pt-3 flex items-center gap-1 text-[10px] font-medium text-gray-500 group-hover:text-[#49EACB]/80 transition-colors">
                    <span className="font-mono opacity-60 truncate">{r.desc}</span>
                    <ChevronRight size={12} className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        {/* ═══ COMMUNITY & ECOLOGY + CTA ═══ */}
        <section className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EC4899]/[0.08] border border-[#EC4899]/[0.15]">
              <Hash size={18} className="text-[#EC4899]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Community & Ecosystem</h2>
          </div>
          <div className="flex flex-wrap gap-2 mb-12">
            {TAGS.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1.5 rounded-full bg-[#49EACB]/[0.04] border border-[#49EACB]/[0.08] text-[#49EACB]/70 text-xs font-mono hover:bg-[#49EACB]/[0.08] hover:border-[#49EACB]/[0.15] transition-all duration-200 cursor-default"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="relative overflow-hidden rounded-2xl border border-[#49EACB]/[0.08] bg-gradient-to-br from-[#49EACB]/[0.04] via-[#00D2FF]/[0.02] to-[#7e14ff]/[0.04] p-8 md:p-10 text-center">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#49EACB]/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#7e14ff]/40 to-transparent" />
            <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight mb-3">
              Ready to explore the DAG?
            </h3>
            <p className="text-sm text-gray-400 max-w-lg mx-auto mb-6">
              Dive into the live covenant index, browse 200+ templates, and build your own interactive covenant in minutes.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#49EACB]/[0.08] border border-[#49EACB]/[0.15] text-[#49EACB] text-sm font-semibold hover:bg-[#49EACB]/[0.12] hover:border-[#49EACB]/[0.25] transition-all">
                <Zap size={14} />
                Explore Covenants
              </a>
              <a href="https://github.com/THTProtocol/Covex27" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-gray-300 text-sm font-semibold hover:border-white/10 hover:text-white transition-all">
                <Code size={14} />
                View on GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Footer spacer */}
        <div className="h-8" />

        {/* Legal micro-footer */}
        <div className="text-center border-t border-white/[0.05] pt-6 mt-6">
          <p className="text-[11px] text-gray-500">

          </p>
        </div>
      </div>
    </div>
  );
}
