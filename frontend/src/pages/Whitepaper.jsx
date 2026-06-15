import { Link } from 'react-router-dom';
import { FileText, ArrowLeft, ExternalLink } from 'lucide-react';

const SECTIONS = [
  {
    id: 'abstract', n: 'Abstract',
    body: [
      "Kaspa's Toccata hard fork turns a 10 BPS proof-of-work BlockDAG into a covenant-capable Layer 1: native, stateful, multi-transaction programs over UTXOs, with on-chain zero-knowledge verification. The missing layer is human: a place to see every covenant, interact with any of them safely, and create them without writing raw script. Covex is that layer.",
      "This paper describes the problem, the design, the trust model, and the path from oracle-assisted resolution today to fully on-chain proof verification under KIP-16.",
    ],
  },
  {
    id: 'background', n: '1 · Background: covenants on Kaspa',
    body: [
      "Kaspa is a proof-of-work BlockDAG using the GHOSTDAG / DAGKNIGHT ordering protocol. Since the Crescendo hard fork (mainnet, ~May 2025) it produces 10 blocks per second while preserving Nakamoto-style security, with a roadmap toward 100 BPS. Crescendo also shipped KIP-10 transaction-introspection opcodes, the first step toward covenants.",
      "The Toccata hard fork completes the covenant story. Scheduled to activate on mainnet in 2026 (no confirmed calendar day), it bundles four improvement proposals: KIP-17 (extended script-engine opcodes, the covenant backbone), KIP-20 (covenant IDs for stable identity and lineage), KIP-16 (zero-knowledge verification opcodes with Groth16 and RISC Zero STARK precompiles for on-chain proof checking), and KIP-21 (partitioned sequencing commitments enabling based ZK applications).",
      "SilverScript, a CashScript-inspired language and compiler, compiles covenants to Kaspa script. It is currently experimental and valid on Testnet-12; mainnet validity arrives with Toccata. Covex builds directly on this stack.",
    ],
  },
  {
    id: 'problem', n: '2 · Problem',
    body: [
      "A programmable UTXO is invisible without infrastructure. At the moment covenants reach mainnet, three gaps appear at once.",
      "Discovery: covenants are not contract accounts; they are spend conditions on outputs. Finding them means walking the DAG and recognizing script envelopes, not reading an account list.",
      "Interaction: a covenant is only useful if counterparties can act on it - fund it, join it, prove an outcome, claim a payout. That requires a UI bound to a wallet and to the covenant's real on-chain parameters.",
      "Authorship: writing correct script is hard and unforgiving; one mistake locks funds forever. Most people who want a covenant should never touch raw opcodes.",
    ],
  },
  {
    id: 'design', n: '3 · Design',
    body: [
      "Indexing. Three independent background workers per network give defense in depth: a crawler that walks the selected-parent chain recognizing aa20 to aa23 covenant envelopes; a live indexer polling seed addresses every 10 seconds; and a payment guardian watching the treasury to confirm tier payments at six DAA confirmations. Covenants are classified by opcode signature into 17 categories. On mainnet, a bare P2SH commitment is indistinguishable from an ordinary output and is not counted as a covenant until Toccata activation - the explorer stays honest rather than inflating numbers.",
      "Interaction. Every covenant has a page bound to its on-chain address. Visitors connect any Kaspa wallet and act non-custodially. Game covenants are the proof of concept: two players stake into a covenant, play a real game with moves persisted and synced live over WebSockets, and the outcome is resolved and signed; the winner's unlock spends the pot on-chain. The platform never custodies the stake.",
      "Authorship and the Studio. Creators compose a covenant's public page from a fixed catalog of platform-authored blocks using a drag-and-drop builder, or type a theme in a design-code terminal; 240 procedural presets give instant starting points. Because pages serialize to validated JSON rendered through an allow-listed component set, no user-authored HTML or JavaScript ever reaches a visitor's DOM, eliminating the phishing and XSS surface that plagues open page builders on financial sites.",
    ],
  },
  {
    id: 'trust', n: '4 · Trust model',
    body: [
      "Covex is explicit about what is trustless and what is not.",
      "Custody is fully trustless: the platform reads UTXOs and verifies payments; it holds no keys and cannot move funds. Every value-moving action is signed by the user's wallet.",
      "Discovery and display are trustless in substance: every listed covenant is a real on-chain object; nothing is fabricated. The honesty gate on mainnet enforces this.",
      "Resolution is currently oracle-assisted: outcomes are verified by a real Groth16 proof where a circuit exists, otherwise attested, and signed by the Covex oracle; the signature is checked on-chain at unlock. Each covenant page states which mode applies via a trust badge. This is the one trusted component today, and it is disclosed, not hidden.",
      "Visibility: the ranking formula is public and deterministic; paid placement is labeled, never disguised as organic.",
    ],
  },
  {
    id: 'roadmap', n: '5 · Roadmap to trustlessness',
    body: [
      "Toccata's KIP-16 lets covenants verify proofs on-chain. Covex's resolution layer is built to migrate onto it: circuits that already have artifacts (Merkle membership, range, timelock, pot-split, VRF) move first to on-chain Groth16 verification; game logic moves to RISC Zero STARK guests, which need no trusted setup.",
      "As that migration completes, the oracle's role shrinks from trusted signer to liveness helper, and eventually to optional. The honest badge system makes each step visible to users in real time.",
      "Beyond resolution: multi-oracle threshold signing for whatever remains attested, a real MPC ceremony or STARK paths to replace the development powers-of-tau, KCC-20 token indexing, a pay-per-call API revenue layer, and a PostgreSQL migration when covenant volume demands it.",
    ],
  },
  {
    id: 'why-now', n: '6 · Why now',
    body: [
      "The platform that indexes mainnet covenants best at the moment they appear becomes the default explorer for the category. Covex already indexes 13,000+ covenants across its testnets and runs a real mainnet node today, ready for the Toccata activation window.",
      "The goal of this codebase is to be ready - correct, honest, and complete - on day one of covenants on Kaspa mainnet.",
    ],
  },
];

export default function Whitepaper() {
  return (
    <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-kaspa-green mb-8">
        <ArrowLeft size={14} /> Back to Explorer
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
          <FileText size={22} className="text-kaspa-green" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white">Covex Whitepaper</h1>
          <p className="text-sm text-gray-400">A Covenant Explorer and Studio for Kaspa Mainnet · v1.0 · June 2026</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5 border border-white/[0.06] mb-8 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="kicker w-full mb-1">Contents</span>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-gray-400 hover:text-kaspa-green transition-colors">{s.n}</a>
        ))}
      </div>

      <article className="space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-bold text-white mb-3 pb-2 border-b border-white/[0.08]">{s.n}</h2>
            <div className="space-y-3">
              {s.body.map((p, i) => (
                <p key={i} className="text-sm text-gray-300 leading-relaxed">{p}</p>
              ))}
            </div>
          </section>
        ))}
      </article>

      <div className="mt-12 glass-panel rounded-2xl p-5 border border-white/[0.06]">
        <span className="kicker">Sources</span>
        <div className="mt-2 flex flex-col gap-1.5 text-xs">
          {[
            ['Toccata hard fork outlook & KIPs (Michael Sutton)', 'https://medium.com/@michaelsuttonil/kaspa-covenants-toccata-hard-fork-outlook-a4d81a40900c'],
            ['Kaspa Improvement Proposals (KIPs)', 'https://github.com/kaspanet/kips'],
            ['Crescendo / 10 BPS roadmap', 'https://kaspa.org/crescendo-hard-fork-roadmap-10bps'],
            ['SilverScript', 'https://github.com/kaspanet/silverscript'],
            ['Mainnet activation window', 'https://kas.live/'],
            ['rusty-kaspa node & SDK', 'https://github.com/kaspanet/rusty-kaspa'],
          ].map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-kaspa-green hover:underline">
              <ExternalLink size={11} /> {label}
            </a>
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-600 mt-8">
        Non-custodial. Keys stay in your wallet. Every listed covenant is a real on-chain object.
      </p>
    </div>
  );
}
