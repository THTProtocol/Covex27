import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowLeft, ExternalLink } from 'lucide-react';
import Card from '@/components/ui/Card';

const SECTIONS = [
  {
    id: 'abstract', n: 'Abstract',
    body: [
      "Kaspa's Toccata hard fork turns a 10 BPS proof-of-work BlockDAG into a covenant-capable Layer 1: native, stateful, multi-transaction programs over UTXOs. Kaspa has no on-chain pairing verifier, so zero-knowledge proofs are verified off-chain by a disclosed oracle and the oracle's Schnorr co-signature is what the chain checks at unlock. The missing layer is human: a place to see every covenant, interact with any of them safely, and create them without writing raw script. Covex is that layer.",
      "This paper describes the problem, the design, the trust model, and the honest mainnet guarantee today: on-chain Schnorr verification of the disclosed oracle co-signature, with ZK proofs verified off-chain by that oracle.",
    ],
  },
  {
    id: 'background', n: '1 · Background: covenants on Kaspa',
    body: [
      "Kaspa is a proof-of-work BlockDAG using the GHOSTDAG / DAGKNIGHT ordering protocol. Since the Crescendo hard fork (mainnet, ~May 2025) it produces 10 blocks per second while preserving Nakamoto-style security, with a roadmap toward 100 BPS. Crescendo also shipped KIP-10 transaction-introspection opcodes, the first step toward covenants.",
      "The Toccata hard fork completes the covenant story. It is scheduled to activate on Kaspa mainnet on 30 June 2026, and bundles four improvement proposals: KIP-17 (extended script-engine opcodes, the covenant backbone), KIP-20 (covenant IDs for stable identity and lineage), KIP-16 (a proposed zero-knowledge verification opcode set), and KIP-21 (partitioned sequencing commitments). Covex does not rely on any on-chain proof-verification precompile: the achievable mainnet guarantee is on-chain Schnorr verification of the disclosed oracle co-signature, with any ZK proof verified off-chain by that oracle.",
      "SilverScript, a CashScript-inspired language and compiler, compiles covenants to Kaspa script. Covex builds directly on this stack and is mainnet-ready for the 30 June 2026 Toccata launch, with real funds.",
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
      "Indexing. Three independent background workers per network give defense in depth: a crawler that walks the selected-parent chain recognizing aa20 to aa23 covenant envelopes (aa20 is the only marker emitted today; aa21 to aa23 are reserved forward-compatible variants); a live indexer polling seed addresses every 10 seconds; and a payment guardian watching the treasury to confirm tier payments at six DAA confirmations. Covenants are classified by opcode signature into 17 categories. On mainnet, a bare P2SH commitment is indistinguishable from an ordinary output and is not counted as a covenant until Toccata activation - the explorer stays honest rather than inflating numbers.",
      "Interaction. Every covenant has a page bound to its on-chain address. Visitors connect any Kaspa wallet and act non-custodially. Game covenants are the proof of concept: two players stake into a covenant, play a real game with moves persisted and synced live over WebSockets, and the outcome is resolved and signed; the winner's unlock spends the pot on-chain. The platform never custodies the stake.",
      "Authorship and the Studio. Creators compose a covenant's public page from a fixed catalog of platform-authored blocks using a drag-and-drop builder, or type a theme in a design-code terminal; 240 procedural presets give instant starting points. Because pages serialize to validated JSON rendered through an allow-listed component set, no user-authored HTML or JavaScript ever reaches a visitor's DOM, eliminating the phishing and XSS surface that plagues open page builders on financial sites.",
    ],
  },
  {
    id: 'trust', n: '4 · Trust model',
    body: [
      "Covex is explicit about what is trustless and what is not.",
      "Custody is non-custodial: the platform reads UTXOs and verifies payments; it holds no keys and cannot move funds. Every value-moving action is signed by the user's wallet. For oracle-resolved covenants the disclosed Covex oracle co-signs the winning branch, so the payout is on-chain enforced but not trustless. For the deterministic primitives the payout is trustless.",
      "Discovery and display are verifiable against the chain: every listed covenant is a real on-chain object you can independently check on the block explorer, and nothing is fabricated. The honesty gate on mainnet enforces this. The enforcement label itself is computed by Covex, so we reserve the word trustless for custody.",
      "Resolution is oracle-attested with one honest carve-out. The fourteen ZK circuits are verified OFF-CHAIN by the disclosed Covex oracle. Four of them (merkle_membership, age_verification, escrow_2party, range_proof) verify END-TO-END to consensus enforcement because their predicate reduces to a hashlock the chain checks; the other ten remain oracle-cosigned. Every non-ZK outcome is attested by the oracle without a proof. Kaspa has no on-chain pairing verifier, so for the ten oracle-cosigned circuits only the oracle's BIP340 co-signature is what the chain checks at unlock, and each covenant page states which mode applies via a trust badge. The trusted setup is a single-contributor Covex dev ceremony, not a production multi-party MPC. This is the trusted component today, and it is disclosed, not hidden.",
      "Visibility: the ranking formula is public and deterministic; paid placement is labeled, never disguised as organic.",
    ],
  },
  {
    id: 'roadmap', n: '5 · Roadmap to trustlessness',
    body: [
      "Today, four circuits already verify END-TO-END to consensus enforcement because their predicate reduces to a hashlock the chain checks: merkle_membership, age_verification, escrow_2party, and range_proof. The other ten compiled circuits (including timelock, pot-split, VRF and the rest) are verified off-chain by the disclosed Covex oracle, and only its Schnorr co-signature is checked on-chain at unlock. If a future KIP-16 ships an on-chain proof-verification opcode, those ten would migrate to on-chain Groth16 verification as their proving keys and a real multi-party ceremony ship. Until then, and at the 30 June 2026 mainnet launch, the carve-out is the four end-to-end circuits; everything else in the ZK set remains oracle-cosigned.",
      "As that migration completes, the oracle's role shrinks from trusted signer to liveness helper, and eventually to optional. The honest badge system makes each step visible to users in real time.",
      "Beyond resolution: multi-oracle threshold signing for whatever remains attested, a real MPC ceremony or STARK paths to replace the development powers-of-tau, KCC-20 token indexing, a pay-per-call API revenue layer, and a PostgreSQL migration when covenant volume demands it.",
    ],
  },
  {
    id: 'why-now', n: '6 · Why now',
    body: [
      "The platform that indexes mainnet covenants best at the moment they appear becomes the default explorer for the category. Covex has proven its indexer at scale and is provisioning its mainnet node ahead of the Toccata activation on 30 June 2026.",
      "The goal of this codebase is to be ready - correct, honest, and complete - on day one of covenants on Kaspa mainnet.",
    ],
  },
];

export default function Whitepaper() {
  // Highlight the section you're reading in the (sticky) contents bar.
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  useEffect(() => {
    // Direct (rAF-free) scrollspy: the last section whose top has scrolled above the
    // sticky bar is the one you're reading. setActiveId no-ops when the value is unchanged,
    // so re-renders only happen when you actually cross a section boundary.
    const compute = () => {
      let current = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 130) current = s.id;
      }
      setActiveId(current);
    };
    compute();
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    return () => { window.removeEventListener('scroll', compute); window.removeEventListener('resize', compute); };
  }, []);

  return (
    <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="covex-aurora" aria-hidden="true" style={{ top: 24, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 460, height: 240, maxWidth: '90vw' }} />
      <Link to="/" className="relative z-10 inline-flex items-center gap-2 text-sm text-gray-400 light:text-slate-500 hover:text-kaspa-green mb-8">
        <ArrowLeft size={14} /> Back to Explorer
      </Link>

      <Card hero className="relative z-10 p-5 mb-8 flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center shrink-0">
          <FileText size={22} className="text-kaspa-green" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white light:text-slate-900">Covex Whitepaper</h1>
          <p className="text-sm text-gray-400 light:text-slate-500 break-words">A Covenant Explorer and Studio for Kaspa Mainnet · v1.1 · 2026-06-17</p>
        </div>
      </Card>

      <div className="z-30 glass-panel rounded-2xl p-3 border border-white/[0.06] light:border-slate-200 light:bg-white/90 mb-8 flex flex-wrap gap-x-3 gap-y-1 text-xs backdrop-blur-xl" style={{ position: 'sticky', top: '4rem' }}>
        <span className="kicker w-full mb-0.5">Contents</span>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={() => setActiveId(s.id)}
            className={`transition-colors ${activeId === s.id ? 'text-kaspa-green font-semibold' : 'text-gray-400 light:text-slate-500 hover:text-kaspa-green'}`}>
            {s.n}
          </a>
        ))}
      </div>

      <article className="space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="relative text-xl font-bold text-white light:text-slate-900 mb-3 pb-2">
              {s.n}
              <span className="absolute bottom-0 left-0 h-[2px] w-20 rounded-full" aria-hidden="true" style={{ background: 'linear-gradient(90deg, #49EACB, transparent)' }} />
            </h2>
            <div className="space-y-3">
              {s.body.map((p, i) => (
                <p key={i} className="text-sm text-gray-300 light:text-slate-700 leading-relaxed">{p}</p>
              ))}
            </div>
          </section>
        ))}
      </article>

      <Card className="mt-12 p-5">
        <span className="kicker">Sources</span>
        <div className="mt-2 flex flex-col gap-1.5 text-xs">
          {[
            ['Toccata hard fork outlook & KIPs (Michael Sutton)', 'https://medium.com/@michaelsuttonil/kaspa-covenants-toccata-hard-fork-outlook-a4d81a40900c'],
            ['Kaspa Improvement Proposals (KIPs)', 'https://github.com/kaspanet/kips'],
            ['Crescendo / 10 BPS roadmap', 'https://medium.com/@michaelsuttonil/unveiling-the-crescendo-hard-fork-roadmap-10bps-and-more-6072329e177f'],
            ['SilverScript', 'https://github.com/kaspanet/silverscript'],
            ['Mainnet activation window', 'https://kas.live/'],
            ['rusty-kaspa node & SDK', 'https://github.com/kaspanet/rusty-kaspa'],
          ].map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noreferrer"
              className="inline-flex items-start gap-1.5 text-gray-300 light:text-slate-700 hover:text-kaspa-green rounded-lg px-2 py-1 -mx-2 border border-transparent hover:border-kaspa-green/30 hover:bg-kaspa-green/[0.05] hover:-translate-y-px transition-all">
              <ExternalLink size={11} className="text-kaspa-green shrink-0 mt-0.5" /> <span className="break-words min-w-0">{label}</span>
            </a>
          ))}
        </div>
      </Card>

      <p className="text-center text-[11px] text-gray-600 light:text-slate-500 mt-8">
        Non-custodial. Keys stay in your wallet. Every listed covenant is a real on-chain object.
      </p>
    </div>
  );
}
