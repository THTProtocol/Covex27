import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-16 pb-20">
      <div className="max-w-4xl mx-auto px-5 sm:px-6">

        <header className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight mb-4">
            Understanding the <span className="text-[#49EACB]">Kaspa</span> Ecosystem
          </h1>
          <p className="text-lg text-gray-300 leading-relaxed max-w-3xl">
            The fastest Proof-of-Work Layer-1 on earth. From BlockDAG mathematics to
            SilverScript covenants — everything you need to understand the infrastructure
            powering Covex.
          </p>
        </header>

        {/* What is Kaspa */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">What is Kaspa?</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Kaspa is a proof-of-work cryptocurrency built on a BlockDAG architecture, not a single chain.
            Multiple blocks are produced per second (currently 10 BPS on mainnet), all confirmed in parallel.
            It is the fastest PoW network on earth while retaining Bitcoin's core security model.
          </p>
        </section>

        {/* SilverScript */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">SilverScript: Native Covenants</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            SilverScript is Kaspa's native covenant scripting layer. It enables stateless smart contracts,
            programmable UTXOs, and non-custodial enforcement directly on Layer-1. This is the foundation
            that makes Covex possible.
          </p>
          <a href="https://github.com/kaspanet/docs/blob/main/Design/covenants.md" target="_blank"
             className="text-[#49EACB] hover:underline font-medium">Read the Covenant Specification →</a>
        </section>

        {/* Toccata */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Toccata Testnet-12</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Toccata (Testnet-12) is the current active testnet where Covex indexes and monitors live covenants.
            It runs at the full speed of the BlockDAG (10+ BPS) and is used for testing the latest Rust node
            and covenant features before they reach mainnet.
          </p>
        </section>

        {/* Core Architecture */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Core Architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "10+ Blocks Per Second", body: "Running at 10 BPS on mainnet since the Rust rewrite — the fastest Proof-of-Work Layer-1 on earth." },
              { title: "BlockDAG Engine", body: "Multiple blocks are created concurrently and ordered mathematically via GHOSTDAG. No more orphan blocks." },
              { title: "Nakamoto Consensus", body: "Kaspa retains Bitcoin's exact security assumptions. No pre-mine, 100% fair launch." },
              { title: "kHeavyHash PoW", body: "ASIC-resistant, optical-miner friendly hash function designed to prevent mining centralization." },
              { title: "Native Covenants", body: "Stateless smart contracts on a stateless network via SilverScript programmable UTXO conditions." },
              { title: "DAGKNIGHT Protocol", body: "Next-gen consensus targeting 100+ BPS by auto-adapting to network latency in real-time." },
            ].map((item, i) => (
              <Card key={i} className="border-white/5">
                <CardHeader>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 text-sm leading-relaxed">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Network Specifications */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Network Specifications</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Block Time', value: '0.1 sec' },
              { label: 'Current Speed', value: '10 BPS' },
              { label: 'Max Supply', value: '28.7B KAS' },
              { label: 'Consensus', value: 'PoW + GHOSTDAG' },
              { label: 'Algorithm', value: 'kHeavyHash' },
              { label: 'Launch', value: 'Nov 2021 (Fair)' },
            ].map((s, i) => (
              <Card key={i} className="p-4 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</div>
                <div className="text-2xl font-bold text-white mt-1">{s.value}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* Research Library */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Research Library</h2>
          <div className="space-y-3">
            {[
              { title: "PHANTOM & GHOSTDAG", subtitle: "Sompolinsky, Wyborski & Zohar (2018) — Scalable Nakamoto Consensus", href: "https://eprint.iacr.org/2018/104.pdf" },
              { title: "DAGKNIGHT Protocol", subtitle: "Sompolinsky, Sutton & Wyborski (2022) — Parameterless Generalization of PHANTOM", href: "https://eprint.iacr.org/2022/1494.pdf" },
              { title: "Kaspa BlockDAG Analysis", subtitle: "Peresini et al. (2023) — Formal performance and security analysis", href: "https://eprint.iacr.org/2023/1479" },
              { title: "Toccata Covenant Specification", subtitle: "SilverScript Smart Contract Architecture for the Kaspa BlockDAG", href: "https://github.com/kaspanet/docs/blob/main/Design/covenants.md" },
            ].map((p, i) => (
              <a key={i} href={p.href} target="_blank" rel="noreferrer"
                 className="block p-4 rounded-xl border border-white/10 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03] transition-colors">
                <h4 className="font-semibold text-white">{p.title}</h4>
                <p className="text-sm text-gray-400 mt-1">{p.subtitle}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Official Resources */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Official Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Kaspa Official Website", desc: "Home of the project, news, ecosystem, and network stats", href: "https://kaspa.org" },
              { title: "Kaspa Publications", desc: "Whitepapers, research papers, and academic publications", href: "https://kaspa.org/publications/" },
              { title: "Kaspa Developments", desc: "Network roadmap, protocol upgrades, and latest announcements", href: "https://kaspa.org/developments/" },
              { title: "Kaspa Explorer (Mainnet)", desc: "Live mainnet block explorer with DAG visualization", href: "https://explorer.kaspa.org" },
              { title: "Rusty Kaspa (GitHub)", desc: "High-performance Rust node reference implementation", href: "https://github.com/kaspanet/rusty-kaspa" },
              { title: "Kaspa Documentation", desc: "Protocol spec, REST API, WebSocket, and SilverScript reference", href: "https://github.com/kaspanet/docs" },
              { title: "Covenant Design Doc", desc: "Detailed SilverScript covenant architecture", href: "https://github.com/kaspanet/docs/blob/main/Design/covenants.md" },
              { title: "Community Web Wallet", desc: "Official browser wallet for sending/receiving KAS", href: "https://wallet.kaspa.org" },
            ].map((r, i) => (
              <a key={i} href={r.href} target="_blank" rel="noreferrer"
                 className="block p-5 rounded-2xl border border-white/10 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03] transition-all">
                <h4 className="font-semibold text-white mb-1">{r.title}</h4>
                <p className="text-sm text-gray-400">{r.desc}</p>
              </a>
            ))}
          </div>
        </section>

        <div className="pt-8 border-t border-white/10 text-center">
          <a href="/pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#49EACB] text-black font-bold hover:bg-[#3cd8b6] transition-colors">
            Deploy Your First Covenant <Terminal size={18} />
          </a>
        </div>

      </div>
    </div>
  );
}
