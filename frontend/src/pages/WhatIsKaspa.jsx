import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Terminal, ExternalLink, BookOpen, Cpu, Shield, Zap, GitBranch, Award, Timer, TrendingUp, Coins, Fingerprint, Calendar, CheckCircle2, Code2, FileCode, Scissors, FlaskConical } from 'lucide-react';
import BlockDagViz from '../components/BlockDagViz';

export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-16 pb-20 relative">
      <div className="covex-aurora" aria-hidden="true" style={{ top: '-4rem' }} />
      <div className="golden-container relative z-10">

        <header className="mb-12 glass-panel rounded-2xl p-6 sm:p-8 border border-[#49EACB]/15 relative overflow-hidden detail-hero-enhanced">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#49EACB]/10 border border-[#49EACB]/30 flex items-center justify-center shrink-0">
              <Zap size={26} className="text-[#49EACB]" />
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight min-w-0 break-words">
              Understanding the <span className="text-[#49EACB]">Kaspa</span> BlockDAG
            </h1>
          </div>
          <p className="text-lg text-gray-300 leading-relaxed max-w-4xl">
            The fastest, most secure Proof-of-Work Layer-1. A true BlockDAG that achieves 10+ blocks per second today
            and targets 100+ BPS with DAGKNIGHT, while preserving Bitcoin's exact security model. This is the
            foundation that makes native covenants and Covex possible.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <a href="https://kaspa.org" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs hover:border-[#49EACB]/40 text-gray-300 hover:text-white transition-colors"><ExternalLink size={12} /> kaspa.org</a>
            <a href="https://github.com/kaspanet/rusty-kaspa" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs hover:border-[#49EACB]/40 text-gray-300 hover:text-white transition-colors"><GitBranch size={12} /> rusty-kaspa</a>
            <a href="https://kaspa.stream" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs hover:border-[#49EACB]/40 text-gray-300 hover:text-white transition-colors"><ExternalLink size={12} /> Mainnet Explorer</a>
          </div>
        </header>

        {/* Featured visual: the BlockDAG itself */}
        <section className="mb-12">
          <div className="glass-panel rounded-2xl p-6 border border-[#49EACB]/15 relative overflow-hidden detail-hero-enhanced">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#49EACB] font-bold flex items-center gap-2"><GitBranch size={14} /> The BlockDAG, live in spirit</div>
              <div className="text-[10px] text-gray-400 font-mono">parallel blocks · GHOSTDAG selected chain</div>
            </div>
            <BlockDagViz />
            <p className="text-xs text-gray-400 mt-3 leading-relaxed max-w-3xl">
              Every block references several parents at once, so honest work is never orphaned. GHOSTDAG
              then chooses one selected-parent chain (the brighter, flowing path) and a total order over
              the whole graph, which is what lets Kaspa run at 10+ blocks per second without sacrificing
              Bitcoin-grade security.
            </p>
          </div>
        </section>

        {/* What is Kaspa - Core Thesis */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2"><BookOpen size={20} className="text-[#49EACB]" /> What is Kaspa?</h2>
          <div className="glass-panel rounded-2xl p-6 text-gray-300 leading-relaxed space-y-4 border border-white/10">
            <p>
              Kaspa is a proof-of-work cryptocurrency built on a <strong>BlockDAG architecture</strong> rather than a linear blockchain.
              Multiple blocks are produced and confirmed in parallel every second (currently 10 BPS on mainnet, with a target of 100+ BPS).
              It is the fastest PoW network on earth while retaining Bitcoin's core security model: Nakamoto Consensus, no pre-mine, 100% fair launch, and the same trust assumptions.
            </p>
            <p>
              The protocol was designed by Yonatan Sompolinsky and collaborators. The key innovation is replacing the "longest chain" rule with a mathematically sound ordering of a directed acyclic graph (DAG) of blocks: GHOSTDAG (and its successor DAGKNIGHT).
            </p>
            <p className="text-[#49EACB] font-medium">
              This removes the orphan rate problem that limits traditional blockchains. Kaspa can safely run at block rates that would destroy Bitcoin or any chain-based PoW system.
            </p>
          </div>
        </section>

        {/* The BlockDAG Advantage */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">The BlockDAG Advantage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: GitBranch, title: "Parallel Block Production", body: "Blocks are created concurrently by miners. No more waiting for the next block or suffering from orphan races. The DAG structure captures all valid work." },
              { icon: Shield, title: "Bitcoin-Grade Security", body: "Exact same assumptions as Bitcoin. The protocol reduces to Nakamoto Consensus when block rate is low. Proven security reductions exist for both PHANTOM and GHOSTDAG." },
              { icon: Zap, title: "10+ Blocks Per Second Today", body: "Mainnet runs at 10 BPS since the Crescendo hard fork (2025). Sub-second block times with practical finality in 5-10 seconds under GHOSTDAG ordering." },
              { icon: Cpu, title: "Future: 100+ BPS with DAGKNIGHT", body: "DAGKNIGHT removes all manual parameter tuning. It auto-adapts to real network latency in real time, safely enabling orders-of-magnitude higher throughput." },
            ].map((item, i) => (
              <Card key={i} className="border-white/5 hover:border-white/10 transition-colors hover-lift">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><item.icon size={18} className="text-[#49EACB]" />{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 text-sm leading-relaxed">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* GHOSTDAG & Core Consensus */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">GHOSTDAG: The Heart of Kaspa Consensus</h2>
          <div className="glass-panel rounded-2xl p-6 border border-white/10 mb-6">
            <p className="text-gray-300 leading-relaxed mb-4">
              GHOSTDAG (Greedy Heaviest Observed SubTree + DAG) is the ordering protocol that turns the chaotic BlockDAG into a total order of blocks.
              Every block references multiple parents. GHOSTDAG selects a "blue" set of blocks that are considered in the main chain for consensus purposes, while still giving weight to all honest work.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-white/[0.015] border border-white/5">
                <div className="font-mono text-[#49EACB] text-xs mb-1">K PARAMETER</div>
                <div className="text-white">Controls the "width" of the blue set. Higher k = more parallelism tolerated.</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.015] border border-white/5">
                <div className="font-mono text-[#49EACB] text-xs mb-1">BLUE / RED SETS</div>
                <div className="text-white">Blue blocks contribute to the ordering and rewards. Red blocks are still valid but have less influence.</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.015] border border-white/5">
                <div className="font-mono text-[#49EACB] text-xs mb-1">CONFIRMATION</div>
                <div className="text-white">A transaction is confirmed when it is buried deep enough in the GHOSTDAG ordering that reordering it would require an infeasible attack.</div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400">Original GHOST protocol by Sompolinsky & Zohar (2013). GHOSTDAG is the practical, parameterised, and proven-safe version deployed in Kaspa.</p>
        </section>

        {/* DAGKNIGHT */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">DAGKNIGHT: The Parameterless Future</h2>
          <div className="glass-panel rounded-2xl p-6 border border-white/10">
            <p className="text-gray-300 leading-relaxed mb-4">
              DAGKNIGHT (2022) is the parameterless successor BlockDAG protocol generalizing GHOSTDAG. It eliminates the single most important operational parameter (k) by continuously estimating the actual network latency and attack surface in real time.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-300 text-sm">
              <li>Automatically adjusts "aggressiveness" based on observed conditions.</li>
              <li>Provably safe under the same assumptions as GHOSTDAG/PHANTOM.</li>
              <li>Enables the safe jump from 10 BPS to 100+ BPS without manual retuning or risk of liveness attacks.</li>
              <li>Paper proves it generalizes both PHANTOM and GHOSTDAG as special cases.</li>
            </ul>
            <a href="https://eprint.iacr.org/2022/1494.pdf" target="_blank" rel="noreferrer" className="inline-block mt-4 text-[#49EACB] hover:underline text-sm font-medium">Read the DAGKNIGHT paper (IACR ePrint 2022/1494)</a>
          </div>
        </section>

        {/* kHeavyHash & Mining */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">kHeavyHash & Mining Philosophy</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-white/5">
              <CardHeader><CardTitle className="text-lg">kHeavyHash Algorithm</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-300 space-y-3 leading-relaxed">
                <p>Custom PoW designed specifically for Kaspa. It is a hybrid of heavy hash + matrix multiplication that is friendly to optical mining (photonic ASICs) while remaining reasonably ASIC-resistant in the traditional sense.</p>
                <p>Goal: Prevent the extreme centralization seen in Bitcoin and Ethereum mining. Optical miners can be extremely efficient and potentially more decentralized in manufacturing.</p>
                <p className="text-[#49EACB] text-xs font-mono">This is one of the few PoW coins with a deliberate hardware philosophy beyond "ASIC or nothing".</p>
              </CardContent>
            </Card>
            <Card className="border-white/5">
              <CardHeader><CardTitle className="text-lg">Fair Launch & Economics</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-300 space-y-3 leading-relaxed">
                <p>Launched November 2021 with zero pre-mine, zero founder allocation, no VC round, no ICO.</p>
                <p>Block reward schedule is geometric (similar to Bitcoin but faster emission curve). Max supply ~28.7 billion KAS.</p>
                <p>Every coin in existence was mined under the same rules from block 1. This is a core part of the project's cypherpunk identity.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* SilverScript Covenants Deep Dive */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">SilverScript: Native Layer-1 Covenants</h2>
          <div className="glass-panel rounded-2xl p-6 border border-white/10 mb-6">
            <p className="text-gray-300 leading-relaxed mb-4">
              SilverScript is Kaspa's native covenant scripting system. It allows developers to attach programmable conditions to UTXOs that are enforced directly by the consensus layer: no EVM, no rollups, no additional trust.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="uppercase tracking-widest text-[10px] text-[#49EACB] mb-1">Core Primitive</div>
                <p className="text-gray-200">UTXOs carry scripts that control spending conditions: time locks, hash locks, public key checks. Crescendo (May 2025) already shipped the KIP-10 transaction-introspection opcodes (the 0xb2 to 0xc3 range) on mainnet; the Toccata fork adds the rest of the covenant toolkit (KIP-17 extended scripting, KIP-20 covenant IDs, KIP-16 ZK verification) for full state machines.</p>
              </div>
              <div>
                <div className="uppercase tracking-widest text-[10px] text-[#49EACB] mb-1">Covex Use Case</div>
                <p className="text-gray-200">One-time tier payments (0 / 100 / 500 / 1000 KAS) to a treasury address upgrade a covenant's visibility and grant the owner access to the full Covex Terminal + custom UI deployment via Covenant Studio.</p>
              </div>
            </div>
          </div>
          <a href="https://github.com/kaspanet/kips/blob/master/kip-0017.md" target="_blank" rel="noreferrer" className="text-[#49EACB] hover:underline font-medium text-sm">Read the official SilverScript / Toccata Covenant Design Document</a>
        </section>

        {/* Research Library - Comprehensive */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><Award size={20} className="text-[#49EACB]" /> Research Library: All Essential Papers</h2>
          <div className="space-y-3">
            {[
              { title: "PHANTOM: A Scalable BlockDAG Protocol", subtitle: "Sompolinsky, Wyborski & Zohar (2018). The foundational BlockDAG paper (PHANTOM + GHOSTDAG). The mathematical basis for Kaspa. IACR ePrint 2018/104.", href: "https://eprint.iacr.org/2018/104.pdf" },
              { title: "PHANTOM GHOSTDAG: A Scalable Generalization of Nakamoto Consensus", subtitle: "Sompolinsky, Wyborski, Zohar (AFT 2021 / ePrint 2018/104). The actual consensus algorithm (GHOSTDAG) running on Kaspa mainnet. Practical parameterization of the original PHANTOM BlockDAG ideas.", href: "https://eprint.iacr.org/2018/104.pdf" },
              { title: "DAGKNIGHT: A Parameterless Generalization of PHANTOM", subtitle: "Sompolinsky, Sutton & Wyborski (2022). Removes the k parameter entirely via real-time latency estimation. The future of Kaspa consensus. IACR 2022/1494.", href: "https://eprint.iacr.org/2022/1494.pdf" },
              { title: "Kaspa BlockDAG: Formal Performance & Security Analysis", subtitle: "Peresini, Sompolinsky, et al. (2023). Rigorous analysis of throughput, security bounds, and attack resistance of the deployed GHOSTDAG system. IACR 2023/1479.", href: "https://eprint.iacr.org/2023/1479" },
              { title: "SPECTRE: Serialization of Proof-of-work Events", subtitle: "Sompolinsky, Lewenberg & Zohar (2016). The earlier inclusive protocol that influenced all later BlockDAG work.", href: "https://eprint.iacr.org/2016/1159.pdf" },
              { title: "Inclusive Block Chain Protocols", subtitle: "Lewenberg, Sompolinsky & Zohar (2015). The paper that introduced the idea of rewarding all honest work instead of discarding orphans.", href: "https://eprint.iacr.org/2015/1139.pdf" },
              { title: "The GHOST Protocol", subtitle: "Sompolinsky & Zohar (2013). The original Greedy Heaviest Observed SubTree idea that eventually became GHOSTDAG.", href: "https://eprint.iacr.org/2013/881.pdf" },
              { title: "KIP-17: Covenants and Improved Scripting Capabilities", subtitle: "Ori Newman. The canonical covenant design document: the extended introspection opcodes (0xb2 to 0xc9), byte-string and arithmetic ops (OpCat, OpMul, OpBlake3, OpCheckSigFromStack), covenant semantics, and how they are validated in the Rust node. Activates on Kaspa mainnet via the Toccata covenant hard fork.", href: "https://github.com/kaspanet/kips/blob/master/kip-0017.md" },
              { title: "kHeavyHash Specification & Rationale", subtitle: "Kaspa documentation. Details on the custom PoW, optical mining design goals, and why it differs from SHA256 / Ethash / etc.", href: "https://github.com/kaspanet/docs" },
              { title: "Kaspa Rust Node Architecture (rusty-kaspa)", subtitle: "The reference implementation. Covers consensus core, UTXO set, mempool, RPC, and how covenants are indexed.", href: "https://github.com/kaspanet/rusty-kaspa" },
            ].map((p, i) => (
              <a key={i} href={p.href} target="_blank" rel="noreferrer"
                 className="block p-4 rounded-xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/30 hover:bg-white/[0.02] transition-all group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-white group-hover:text-[#49EACB] transition-colors break-words">{p.title}</h4>
                    <p className="text-sm text-gray-400 mt-1 break-words">{p.subtitle}</p>
                  </div>
                  <ExternalLink size={14} className="text-gray-500 group-hover:text-[#49EACB] mt-1 shrink-0" />
                </div>
              </a>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-3">All links point to primary sources (IACR ePrint or official Kaspa repositories). Always prefer the original papers over secondary summaries.</p>
        </section>

        {/* Network Specifications */}
        <section className="mb-12">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <CheckCircle2 size={20} className="text-[#49EACB] shrink-0" />
              Network Specifications
            </h2>
            <span className="text-[10px] px-3 py-0.5 rounded-full bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/20 tracking-wider font-mono break-words">COVENANTS ON KASPA MAINNET WITH TOCCATA</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[
              { icon: Timer, label: 'Block Interval', value: '100 ms', sub: '0.1 seconds per block', badge: null },
              { icon: TrendingUp, label: 'Block Rate', value: '10 BPS', sub: 'Mainnet, post-Crescendo hard fork (2025)', badge: 'VERIFIED' },
              { icon: Zap, label: 'Scaling Target', value: '100+ BPS', sub: 'DAGKNIGHT and subsequent protocol upgrades', badge: 'TARGET' },
              { icon: Coins, label: 'Max Supply', value: '28.7 B KAS', sub: 'Exactly 28,704,026,601 coins', badge: 'VERIFIED' },
              { icon: Shield, label: 'Consensus', value: 'PoW + GHOSTDAG', sub: 'BlockDAG (parallel blocks ordered by GHOSTDAG) vs single-chain: 10 BPS today, 100x Bitcoin', badge: null },
              { icon: Fingerprint, label: 'Hash Algorithm', value: 'kHeavyHash', sub: 'Optical-miner friendly, ASIC-resistant design', badge: null },
              { icon: Calendar, label: 'Launch Date', value: '7 Nov 2021', sub: 'Fair launch: zero premine, zero ICO', badge: 'VERIFIED' },
              { icon: CheckCircle2, label: 'Practical Finality', value: '5-10 sec', sub: 'Strong probabilistic confirmation; usable for payments', badge: 'VERIFIED' },
              { icon: Code2, label: 'Primary Node', value: 'rusty-kaspa', sub: 'Production Rust implementation, high performance', badge: null },
              { icon: FileCode, label: 'Covenants', value: 'SilverScript', sub: 'Native Kaspa covenants, activating on mainnet via the Toccata hard fork in the 2026 window (no confirmed day)', badge: 'TOCCATA' },
              { icon: Scissors, label: 'Pruning', value: 'Active', sub: 'Aggressive NIPoW pruning; nodes retain ~30-42 hours of recent history', badge: 'VERIFIED' },
              { icon: FlaskConical, label: 'Covenant Fork', value: 'Toccata', sub: 'The covenant-centric hard fork bringing SilverScript to Kaspa mainnet', badge: 'TARGET' },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.005] p-5 hover:border-[#49EACB]/40 hover:bg-white/[0.02] hover:shadow-[0_0_25px_rgba(73,234,203,0.08)] transition-all duration-300 group">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#49EACB]/10 border border-[#49EACB]/20 flex items-center justify-center shrink-0 group-hover:bg-[#49EACB]/20 transition-colors">
                    <s.icon size={15} className="text-[#49EACB]" />
                  </div>
                  {s.badge && (
                    <span className={`text-[8px] px-2 py-0.5 rounded-full font-mono tracking-wider shrink-0 ${
                      s.badge === 'VERIFIED' ? 'bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/25' :
                      s.badge === 'TARGET' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' :
                      s.badge === 'TOCCATA' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/25' :
                      'bg-blue-500/10 text-blue-400 border border-blue-500/25'
                    }`}>{s.badge}</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-[1.5px] font-mono mb-1">{s.label}</div>
                <div className="text-xl font-bold text-white tabular-nums group-hover:text-[#49EACB] transition-colors leading-tight break-words">{s.value}</div>
                <div className="text-[11px] text-gray-300 mt-1.5 leading-relaxed break-words">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-2xl border border-white/5 bg-white/[0.005]">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              <span className="text-[#49EACB] font-mono text-[10px] uppercase tracking-wider">Sources:</span> kaspa.org, kaspa.stream, rusty-kaspa GitHub, official Crescendo/DAGKNIGHT/Toccata hard-fork announcements, and developer updates (mid-2026).
              Finality is probabilistic; practical spendability is near-instant for most use cases.
              SilverScript covenant support arrives on Kaspa mainnet with the Toccata covenant-centric hard fork.
            </p>
          </div>
        </section>

        {/* Official Resources & Developer Links */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Official Resources & Developer Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: "Kaspa Official Website", desc: "News, ecosystem, stats, and high-level vision", href: "https://kaspa.org" },
              { title: "Publications & Research", desc: "The canonical list of all whitepapers and academic output", href: "https://kaspa.org/publications/" },
              { title: "Developments & Roadmap", desc: "Protocol upgrades, DAGKNIGHT status, pruning, and upcoming features", href: "https://kaspa.org/developments/" },
              { title: "Mainnet BlockDAG Explorer", desc: "Live visualization of the DAG, blocks, and transactions", href: "https://kaspa.stream" },
              { title: "Rusty Kaspa (GitHub)", desc: "The production Rust node: consensus, RPC, UTXO index, covenant support", href: "https://github.com/kaspanet/rusty-kaspa" },
              { title: "Kaspa Documentation Hub", desc: "Protocol spec, REST/WebSocket APIs, SilverScript reference, node setup", href: "https://github.com/kaspanet/docs" },
              { title: "Covenant Design Document (KIP-17)", desc: "The single most important document for Covex developers", href: "https://github.com/kaspanet/kips/blob/master/kip-0017.md" },
              { title: "Official Web Wallet", desc: "kaspa.org wallet: send, receive, and interact with covenants", href: "https://wallet.kaspa.org" },
              { title: "Community (Discord / X / Reddit)", desc: "High-signal technical discussion happens here", href: "https://discord.gg/kaspa" },
              { title: "Kaspa Improvement Proposals (KIPs)", desc: "Formal process for protocol changes", href: "https://github.com/kaspanet/kips" },
              { title: "Core Team & Research Blog", desc: "Updates from the researchers and protocol engineers", href: "https://research.kas.pa" },
            ].map((r, i) => (
              <a key={i} href={r.href} target="_blank" rel="noreferrer"
                 className="block p-4 rounded-xl border border-white/10 bg-white/[0.01] hover:border-[#49EACB]/25 hover:bg-white/[0.015] transition-all group">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-white group-hover:text-[#49EACB] transition-colors break-words">{r.title}</h4>
                    <p className="text-xs text-gray-400 mt-0.5 break-words">{r.desc}</p>
                  </div>
                  <ExternalLink size={13} className="text-gray-500 group-hover:text-[#49EACB] mt-0.5 shrink-0" />
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* How Covex Uses This */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">How Covex Uses the Kaspa BlockDAG</h2>
          <div className="glass-panel rounded-2xl p-6 border border-white/10 text-sm text-gray-300 leading-relaxed">
            Covex is a covenant-first application layer on top of SilverScript. Every covenant you deploy through Covex is a real UTXO on Kaspa, enforced by the consensus layer once the Toccata covenant hard fork activates SilverScript on mainnet.
            The one-time tier payment (BUILDER 100 KAS, PRO 500 KAS, MAX 1000 KAS) is a simple P2SH-style spend to a known treasury address. 
            The indexer watches for these payments, upgrades the covenant's visibility tier, and grants the owner Terminal + custom UI capabilities. 
            All of this is verifiable on-chain by anyone running a Kaspa node with UTXO indexing.
          </div>
        </section>

        <div className="pt-8 border-t border-white/10 text-center">
          <a href="/deploy/enforced" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#49EACB] light:bg-[#0d9488] text-black light:text-white font-bold hover:bg-[#3cd8b6] light:hover:bg-[#0b8276] transition-colors min-h-[44px] sm:min-h-0">
            Deploy Your First On-Chain-Enforced Covenant <Terminal size={18} />
          </a>
          <p className="text-[10px] text-gray-500 mt-3">No payment required. Upgrade that specific covenant later if you want rich UI + Terminal.</p>
        </div>

      </div>
    </div>
  );
}
