import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

export default function WhatIsKaspaPage() {
  return (
    <div className="min-h-screen pt-16 pb-20">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">

        <header className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight mb-4">
            Understanding the <span className="text-[#49EACB]">Kaspa</span> Ecosystem
          </h1>
          <p className="text-base text-gray-300 leading-relaxed">
            The fastest Proof-of-Work Layer-1 on earth. From BlockDAG mathematics to
            SilverScript covenants.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-3">What is Kaspa?</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Kaspa is a proof-of-work cryptocurrency built on a BlockDAG architecture.
            Multiple blocks are produced per second (10 BPS on mainnet), all confirmed in parallel.
            It is currently the fastest PoW network on earth.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-3">SilverScript Covenants</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            SilverScript is Kaspa's native covenant scripting layer. It enables stateless smart contracts,
            programmable UTXOs, and non-custodial enforcement directly on Layer-1.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-3">Toccata Testnet-12</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            The network Covex currently indexes and monitors live. Demonstrates the full speed of the BlockDAG.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-3">Core Specs</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Block Time', value: '0.1 sec' },
              { label: 'Speed', value: '10 BPS' },
              { label: 'Consensus', value: 'PoW + GHOSTDAG' },
              { label: 'Max Supply', value: '28.7B KAS' },
              { label: 'Launch', value: 'Fair (2021)' },
            ].map(s => (
              <Card key={s.label} className="p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</div>
                <div className="text-xl font-bold text-white mt-1">{s.value}</div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-3">Research & Resources</h2>
          <div className="space-y-2 text-sm">
            <a href="https://kaspa.org" target="_blank" className="block text-[#49EACB] hover:underline">kaspa.org</a>
            <a href="https://github.com/kaspanet/docs" target="_blank" className="block text-[#49EACB] hover:underline">Kaspa Documentation (including Covenants)</a>
            <a href="https://github.com/kaspanet/rusty-kaspa" target="_blank" className="block text-[#49EACB] hover:underline">Rusty Kaspa (Rust node)</a>
          </div>
        </section>

        <div className="pt-6 border-t border-white/10 text-center">
          <a href="/pricing" className="inline-block px-5 py-2 rounded-lg bg-[#49EACB] text-black font-bold text-sm hover:bg-[#3cd8b6]">
            Deploy a Covenant
          </a>
        </div>

      </div>
    </div>
  );
}
