export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-16 pb-20">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">

        {/* Hero */}
        <header className="mb-16">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight mb-4">
            Understanding the{' '}
            <span className="text-kaspa-green">Kaspa</span>{' '}
            Ecosystem
          </h1>
          <p className="text-base text-gray-200 leading-relaxed">
            The fastest Proof-of-Work Layer-1 on earth. From BlockDAG mathematics to
            SilverScript covenants: everything you need to understand the infrastructure
            powering Covex.
          </p>
        </header>

        {/* What is Kaspa */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">What is Kaspa?</h2>
          <p className="text-sm text-gray-200 leading-relaxed mb-4">
            Kaspa is a proof-of-work cryptocurrency built on a BlockDAG architecture,
            not a single chain. Multiple blocks are produced per second — 10 BPS on
            mainnet since the Rust rewrite — all confirmed in parallel. It is the
            fastest PoW network on earth.
          </p>
          <a
            href="https://kaspa.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-kaspa-green hover:underline"
          >
            Official Website &rarr;
          </a>
        </section>

        {/* SilverScript */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">SilverScript: Covenant Language</h2>
          <p className="text-sm text-gray-200 leading-relaxed mb-4">
            SilverScript is the native covenant scripting layer of the Kaspa BlockDAG.
            It enables stateless smart contracts, programmable UTXOs, and non-custodial
            enforcement directly on Layer-1.
          </p>
          <a
            href="https://github.com/kaspanet/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-kaspa-green hover:underline"
          >
            Kaspa Documentation &rarr;
          </a>
        </section>

        {/* Toccata */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">Toccata Testnet-12</h2>
          <p className="text-sm text-gray-200 leading-relaxed mb-4">
            Toccata is the Kaspa Testnet-12 network, the same network Covex indexes
            and monitors live. At 10 blocks per second, it demonstrates the full
            latency-busting power of the BlockDAG before mainnet adoption.
          </p>
          <a
            href="https://kaspa.org/developments/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-kaspa-green hover:underline"
          >
            Latest Developments &rarr;
          </a>
        </section>

        {/* Covenants */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">What are Covenants?</h2>
          <p className="text-sm text-gray-200 leading-relaxed mb-4">
            Covenants enforce deterministic rules about how coins may be spent in the
            future. Pure UTXO-based programmable locks enable escrow, timelocks,
            multisig, community pools, and atomic swaps.
          </p>
          <a
            href="https://github.com/kaspanet/docs/blob/main/Design/covenants.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-kaspa-green hover:underline"
          >
            Covenant Specification &rarr;
          </a>
        </section>

        {/* Network Specifications */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">Network Specifications</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Block Time', value: '0.1 sec', sub: '10 blocks per second' },
              { label: 'Max Supply', value: '28.7B KAS', sub: '28,704,026,601 total' },
              { label: 'Consensus', value: 'PoW + GHOSTDAG', sub: 'Nakamoto consensus on DAG' },
              { label: 'Algorithm', value: 'kHeavyHash', sub: 'Optical-miner friendly' },
              { label: 'Launch', value: 'Nov 2021', sub: 'Fair launch, no pre-mine' },
              { label: 'Language', value: 'Rust', sub: 'High-performance reference node' },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <p className="text-xs text-gray-300 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-xl font-bold text-white mb-0.5">{s.value}</p>
                <p className="text-xs text-gray-300">{s.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">Core Architecture</h2>
          <div className="space-y-4">
            {[
              { title: '10 BPS — 10 Blocks Per Second', body: 'Running at 10 BPS on mainnet since the Rust rewrite, the fastest Proof-of-Work Layer-1 on earth.' },
              { title: 'BlockDAG Engine — Parallel blocks', body: 'Multiple blocks are created concurrently and ordered mathematically via GHOSTDAG.' },
              { title: 'Nakamoto Consensus — Trustless', body: 'Kaspa retains Bitcoin\'s exact security assumptions. No pre-mine, 100% fair launch.' },
              { title: 'kHeavyHash PoW — Efficient', body: 'ASIC-resistant, optical-miner friendly hash function preventing mining centralization.' },
              { title: 'Native Covenants — Programmable', body: 'Stateless smart contracts on a stateless network via SilverScript programmable UTXO conditions.' },
              { title: 'DAGKNIGHT Protocol — Adaptive', body: 'Next-gen consensus targeting 100+ BPS by auto-adapting to network latency in real-time.' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <h3 className="text-sm font-bold text-white mb-1">{item.title}</h3>
                <p className="text-sm text-gray-200 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Research Library */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">Research Library</h2>
          <div className="space-y-2">
            {[
              { title: 'PHANTOM & GHOSTDAG', subtitle: 'Sompolinsky, Wyborski & Zohar (2018) — Scalable Nakamoto Consensus', href: 'https://eprint.iacr.org/2018/104.pdf' },
              { title: 'DAGKNIGHT Protocol', subtitle: 'Sompolinsky, Sutton & Wyborski (2022) — Parameterless Generalization', href: 'https://eprint.iacr.org/2022/1494.pdf' },
              { title: 'Kaspa BlockDAG Analysis', subtitle: 'Peresini et al. (2023) — Formal performance and security analysis', href: 'https://eprint.iacr.org/2023/1479' },
              { title: 'Toccata Covenant Specification', subtitle: 'SilverScript Smart Contract Architecture for the Kaspa BlockDAG', href: 'https://github.com/kaspanet/docs/blob/main/Design/covenants.md' },
              { title: 'Rusty Kaspa Repository', subtitle: 'High-performance Rust node reference implementation', href: 'https://github.com/kaspanet/rusty-kaspa' },
              { title: 'Kaspa Developer Documentation', subtitle: 'Protocol spec, REST API, WebSocket streams, and SilverScript reference', href: 'https://github.com/kaspanet/docs' },
            ].map(p => (
              <a
                key={p.title}
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="block p-3 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.03] transition-colors"
              >
                <h4 className="text-sm font-semibold text-white">{p.title}</h4>
                <p className="text-xs text-gray-200 mt-0.5 leading-snug">{p.subtitle}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Resources */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-3">Official Resources</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { title: 'Kaspa Official Website', href: 'https://kaspa.org' },
              { title: 'Kaspa Publications', href: 'https://kaspa.org/publications/' },
              { title: 'Kaspa Developments', href: 'https://kaspa.org/developments/' },
              { title: 'Kaspa Explorer (Mainnet)', href: 'https://explorer.kaspa.org' },
              { title: 'Rusty Kaspa on GitHub', href: 'https://github.com/kaspanet/rusty-kaspa' },
              { title: 'Kaspa Docs on GitHub', href: 'https://github.com/kaspanet/docs' },
              { title: 'Covenant Design Doc', href: 'https://github.com/kaspanet/docs/blob/main/Design/covenants.md' },
              { title: 'Community Wallet', href: 'https://wallet.kaspa.org' },
            ].map(r => (
              <a
                key={r.title}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="block p-3 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-white/10 text-sm text-gray-200 hover:text-white transition-colors"
              >
                {r.title} &rarr;
              </a>
            ))}
          </div>
        </section>

        {/* CTA */}
        <footer className="text-center pt-8 border-t border-white/[0.06]">
          <a
            href="/"
            className="inline-flex px-5 py-2.5 rounded-lg bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green text-sm font-semibold hover:bg-kaspa-green/15 transition-colors"
          >
            Explore Covenants
          </a>
        </footer>

      </div>
    </div>
  );
}
