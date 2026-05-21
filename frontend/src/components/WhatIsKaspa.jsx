import { useEffect } from 'react';

const FEATURES = [
  ['10 BPS', '10 blocks per second on mainnet since Rust rewrite (2024).'],
  ['BlockDAG', 'Parallel blocks coexist via GHOSTDAG. No orphaned work.'],
  ['GHOSTDAG', 'Proven consensus: Greedy Heaviest Observed Sub-Tree DAG.'],
  ['DAGKNIGHT', 'Next-gen protocol targeting 100+ BPS without sacrificing security.'],
  ['kHeavyHash', 'ASIC-resistant Proof-of-Work, optical-miner friendly.'],
  ['UTXO Model', 'Bitcoin-compatible UTXO model with native covenants via Toccata.'],
  ['Rust Node', 'Full node rewritten in Rust (2024). Memory-safe, high-performance.'],
  ['Open Source', 'ISC License. No premine. Fair launch.'],
];

const PAPERS = [
  ['GHOSTDAG Protocol', 'Sompolinsky et al., 2018', 'https://eprint.iacr.org/2018/104.pdf'],
  ['DAGKNIGHT Protocol', 'Sompolinsky, Wyborski & Zohar, 2021', 'https://eprint.iacr.org/2021/911'],
  ['Kaspa Whitepaper', 'Kaspa Research, 2023', 'https://kaspa.org/wp-content/uploads/2023/04/Kaspa-Whitepaper.pdf'],
  ['Toccata Hardfork', 'Kaspa Improvement Proposal', 'https://medium.com/@michaelsuttonil/kaspa-covenants-toccata-hard-fork-outlook-a4d81a40900c'],
  ['Rusty Kaspa', 'Michael Sutton et al., 2024', 'https://kaspa.org/rusty-kaspa/'],
];

export default function WhatIsKaspa({ open, onClose }) {
  useEffect(() => {
    if (open) {
      const p = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = p; };
    }
  }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl h-full ml-auto overflow-y-auto bg-[#0B0B10] border-l border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 bg-[#0B0B10]/95 backdrop-blur-md border-b border-white/10 px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Understanding Kaspa</h2>
            <p className="text-xs text-gray-500 mt-1">Technical reference with citations</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-8 space-y-10">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-kaspa-green uppercase tracking-widest">What is Kaspa?</h3>
            <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
              <p>
                Kaspa is a decentralized, open-source Layer-1 blockchain built on a <strong className="text-white">BlockDAG</strong>. Instead of a single chain, the BlockDAG allows multiple blocks to be created and processed concurrently — no orphaned work.
              </p>
              <p>
                Kaspa operates at <strong className="text-white">10 blocks per second (10 BPS)</strong> on mainnet, achieved through the Rust rewrite in 2024. It uses the <strong className="text-white">GHOSTDAG protocol</strong> to order parallel blocks. The next-generation <strong className="text-white">DAGKNIGHT protocol</strong> targets 100+ BPS.
              </p>
              <div className="p-4 rounded-xl bg-kaspa-green/[0.04] border border-kaspa-green/20 text-xs text-gray-400">
                <span className="text-kaspa-green font-semibold">Toccata Hardfork</span>: Native UTXO covenants via SilverScript. Live on TN12 testnet. Mainnet activation expected June 2026.
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-kaspa-green uppercase tracking-widest">Technical Specifications</h3>
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map(([l, d]) => (
                <div key={l} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-sm font-semibold text-white">{l}</p>
                  <p className="text-xs text-gray-500 mt-1">{d}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-kaspa-green uppercase tracking-widest">Whitepapers and Research</h3>
            <div className="space-y-2">
              {PAPERS.map(([t, a, u]) => (
                <a
                  key={t}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                >
                  <p className="text-sm font-medium text-white">{t}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a}</p>
                </a>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-kaspa-green uppercase tracking-widest">What is a Covenant?</h3>
            <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
              <p>
                A <strong className="text-white">covenant</strong> is a programmable spending condition on a UTXO. It restricts how funds can be spent in future transactions, enabling trust-minimized protocols directly on Kaspa.
              </p>
              <p>
                Kaspa introduced native covenants through the <strong className="text-white">Toccata hardfork</strong>. They are written in <strong className="text-white">SilverScript</strong>, a domain-specific language that compiles to Kaspa bytecode.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-kaspa-green uppercase tracking-widest">How Covex Helps</h3>
            <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
              <p>
                Covex is a <strong className="text-white">stateful covenant indexer and SaaS platform</strong>. It connects directly to your Kaspa node via wRPC WebSocket — no intermediary, no proxy.
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-gray-400">
                <li>Indexes covenant UTXOs from the BlockDAG in real time into SQLite</li>
                <li>Provides a searchable registry of all deployed covenant types</li>
                <li>Covenant authors pay a one-time KAS fee for an interactive UI and visibility</li>
                <li>All covenants are visible publicly — tiers add UI generation and visibility</li>
              </ul>
              <div className="p-4 rounded-xl bg-kaspa-green/[0.04] border border-kaspa-green/20 text-xs text-gray-400">
                <span className="text-kaspa-green font-semibold">Direct connection. No proxy.</span> Covex connects to your Kaspa node via wRPC WebSocket. Chain is the truth. Covex is the window.
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-kaspa-green uppercase tracking-widest">Wallet Ecosystem</h3>
            <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
              <p>
                Covex supports non-custodial connections to KasWare, Kaspium, OneKey, Tangem, and KDX wallets. All signing happens in your wallet — Covex never touches your keys.
              </p>
              <p>
                <a href="https://kaspa.org/build" target="_blank" rel="noopener noreferrer" className="text-kaspa-green hover:underline">Kaspa Developer Build Page</a> — Official WASM SDK and node access.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
