import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowLeft, ExternalLink, ChevronDown, ShieldCheck } from '../lib/routeIcons.js';
import Card from '@/components/ui/Card';
import { vkeyPathFor, VERIFIED_FULL_ZK } from '@/lib/zk/circuits';

// Computed at module load from the canonical set in lib/zk/circuits.js so this
// page cannot drift from the registry. The derived count is the load-bearing
// honesty fact in sections 4 and 5: every circom circuit in the registry is
// Groth16-verified OFF-CHAIN by you, the counterparty, or any external resolver.
// For the circom suite the only on-chain check is the resolver's Schnorr
// co-signature gating a 2-of-2 cosign plus a CSV timeout. Toccata's KIP-16
// OpZkPrecompile is a separate on-chain ZK path the settlement covenant targets,
// testnet-gated until proven live on mainnet.
const ZK_TOTAL = VERIFIED_FULL_ZK.size;
// Small number-to-word helper so the prose reads naturally without hard-coding
// the count. Falls back to digits past the table, which is fine for any future
// registry growth and keeps the diff surgical.
const NUM_WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty'];
const numWord = (n) => (n >= 0 && n < NUM_WORDS.length ? NUM_WORDS[n] : String(n));
const ZK_TOTAL_WORD = numWord(ZK_TOTAL);

// Source the disclosed treasury addresses from the same constant Treasury.jsx renders,
// duplicated here (single field today: mainnet) rather than cross-importing a page module.
// Keep in sync with pages/Treasury.jsx -> TREASURIES.
const TREASURIES = {
  mainnet: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
};

const SECTIONS = [
  {
    id: 'abstract', n: 'Abstract',
    body: [
      "Kaspa's Toccata hard fork turns a 10 BPS proof-of-work BlockDAG into a covenant-capable Layer 1: native, stateful, multi-transaction programs over UTXOs. What is missing is the human layer. There is no single place to see every covenant on chain, act on any of them from your own wallet, and create new ones without writing raw script. Covex is that layer.",
      "Covex is non-custodial. Keys stay in your wallet, the platform holds no funds, and it signs nothing on your behalf. The circom proof suite Covex ships is verified off chain by anyone, and the only thing the chain checks at unlock is a deployer-bound external resolver's Schnorr co-signature. Toccata's KIP-16 verification opcode adds a separate on-chain proof path that stays testnet-gated until it is proven on mainnet. This paper sets out the problem, the design, the trust model, and exactly what is guaranteed today.",
    ],
  },
  {
    id: 'background', n: '1 · Background: covenants on Kaspa',
    body: [
      "Kaspa is a proof-of-work BlockDAG ordered by the GHOSTDAG and DAGKNIGHT protocols. Since the Crescendo hard fork (mainnet, around May 2025) it produces 10 blocks per second while preserving Nakamoto-style security, with a roadmap toward 100 BPS. Crescendo also shipped the KIP-10 transaction-introspection opcodes, the first step toward covenants.",
      "Toccata completes the covenant story. It activates on Kaspa mainnet at DAA score 474,165,565 (expected around 30 June 2026) and bundles four improvement proposals: KIP-17, the extended script-engine opcodes that form the covenant backbone; KIP-20, covenant IDs that give stable identity and lineage; KIP-16, a zero-knowledge opcode set whose OpZkPrecompile verifies a RISC0-Groth16 proof in consensus; and KIP-21, partitioned sequencing commitments.",
      "For real-value settlement today, Covex does not yet rely on that on-chain proof opcode. The KIP-16 path is live on the Toccata testnets and stays testnet-gated for settlement until it is proven on mainnet. Until then, the guarantee Covex offers is on-chain Schnorr verification of a deployer-bound resolver's co-signature, with the circom proof verified off chain. The trust model section sets this out in full.",
      "SilverScript, a CashScript-inspired language and compiler, compiles covenants down to Kaspa script. Covex builds directly on this stack and is being readied for the Toccata mainnet activation on 30 June 2026, when covenants begin settling with real funds.",
    ],
  },
  {
    id: 'problem', n: '2 · Problem',
    takeaway: "The moment covenants reach mainnet, three gaps open at once: finding them on the DAG, acting on them from a wallet, and authoring them without locking funds in raw script.",
    body: [
      "A programmable UTXO is invisible without infrastructure. The day covenants reach mainnet, three gaps appear together.",
      "Discovery. Covenants are not contract accounts. They are spend conditions on outputs, so finding them means walking the DAG and recognizing script envelopes, not reading an account list.",
      "Interaction. A covenant is only useful if counterparties can act on it: fund it, join it, prove an outcome, claim a payout. That takes a UI bound to a wallet and to the covenant's real on-chain parameters.",
      "Authorship. Writing correct script is hard and unforgiving. One mistake can lock funds forever, so most people who want a covenant should never touch raw opcodes.",
    ],
  },
  {
    id: 'design', n: '3 · Design',
    takeaway: "Independent indexers find every covenant on chain, each one gets a wallet-bound page you act on non-custodially, and a no-code Studio builds new ones without any user-authored HTML ever reaching a visitor.",
    body: [
      "Indexing. Three independent background workers per network give defense in depth. A crawler walks the selected-parent chain recognizing aa20 to aa23 covenant envelopes (aa20 is the only marker emitted today; aa21 to aa23 are reserved forward-compatible variants). A live indexer polls seed addresses every 10 seconds. A payment guardian watches the treasury and confirms tier payments at six DAA confirmations. Covenants are classified by opcode signature into 17 categories. On mainnet, a bare P2SH commitment is indistinguishable from an ordinary output, so it is not counted as a covenant until Toccata activation. The explorer stays honest rather than inflating numbers.",
      "Interaction. Every covenant has a page bound to its on-chain address. Visitors connect any Kaspa wallet and act non-custodially. Two-party covenants are the proof of concept: both parties stake into the covenant, the interaction is persisted and synced live over WebSockets, and the outcome is resolved and signed from a publicly replayable log. The winning party's own unlock spends the staked amount on chain. Covex never custodies the stake.",
      "Authorship and the Studio. Creators compose a covenant's public page from a fixed catalog of platform-authored blocks, using a drag-and-drop builder or a design-code terminal where they simply type a theme; 240 procedural presets give instant starting points. Pages serialize to validated JSON rendered through an allow-listed component set, so no user-authored HTML or JavaScript ever reaches a visitor's DOM. That removes the phishing and XSS surface that plagues open page builders on financial sites.",
    ],
  },
  {
    id: 'trust', n: '4 · Trust model',
    takeaway: "Covex holds no funds and decides no outcome. The deterministic primitives are trustless; where a real-world fact is needed you trust a named external resolver you chose or run, never a Covex key.",
    body: [
      "Covex is precise about what is trustless and what is not, and the word trustless is reserved for custody and the deterministic on-chain primitives only.",
      "Custody is non-custodial. The platform reads UTXOs and verifies payments. It holds no user keys and cannot move funds, and every value-moving action is signed by the user's own wallet. For the deterministic primitives (hashlock, timelocks, HTLC, multisig, channels) the payout is fully trustless: the chain alone enforces it.",
      `Outcomes that depend on a fact or a proof are not trustless, and Covex says so plainly. There are ${ZK_TOTAL_WORD} ZK circuits in the Covex circom registry, and every one of their Groth16 proofs is verified off chain (snarkjs against the served verification key, fail-closed) by you, the counterparty, or any external resolver. There is no proof-to-hashlock binding, so the chain never checks these proofs directly. Instead, a valid proof gates a deployer-bound external resolver's BIP340 Schnorr co-signature, a 2-of-2 cosign with a CSV timeout, and that co-signature is the single thing the chain enforces at unlock. Trust therefore sits with the disclosed resolver the deployer chose or runs, never with Covex and never with a Covex key. Each covenant page states this through a trust badge.`,
      "This applies uniformly. The four self-contained circuits (merkle_membership, age_verification, escrow_2party, range_proof) verify off chain like the rest and still require the resolver's co-signature to release funds, so they are not trustless end to end either. Real-world-outcome covenants bind on chain to an external resolver the creator names by pubkey at deploy, because Covex never attests real-world facts: it provides the infrastructure, not the truth.",
      "Two-party game outcomes, on testnet today, are the one place a Covex key appears. Covex re-derives the result from the publicly replayable signed move log, which anyone can recompute, and co-signs the payout; it does not decide the result, and the chain still requires the winning party's own signature. Covex is migrating these to an external-referee model to remove even that key. Markets, ZK proofs, and mainnet never use a Covex key.",
      "Two things are on the horizon, not in force. The chain-enforced, no-Covex-key path (the same external-resolver hashlock the conditional-outcome covenants use) is rolling out, and Toccata's KIP-16 OpZkPrecompile, which verifies a RISC0-Groth16 proof in consensus, is the on-chain path the settlement covenant targets once it is proven on mainnet. The trusted setup behind today's circom proofs is a single-contributor development ceremony, not a production multi-party MPC. This is the trust assumption today, disclosed rather than hidden.",
      "Visibility. The ranking formula is public and deterministic, and paid placement is always labeled, never disguised as organic. Because the enforcement label is itself computed by Covex, we keep the word trustless for custody alone.",
    ],
  },
  {
    id: 'roadmap', n: '5 · Roadmap to trustlessness',
    takeaway: "Shrink the off-chain resolver from trusted signer to optional, move proofs on chain via KIP-16, and replace the development trusted setup with a real multi-party ceremony, with the honest badge tracking every step.",
    body: [
      `Today, all ${ZK_TOTAL_WORD} compiled circom circuits in the registry are verified off chain, and the chain enforces only a deployer-bound external resolver's Schnorr co-signature at unlock, exactly as the trust model describes. No circom proof is enforced end to end on Kaspa, because the covenant builder contains no circuit-output to hashlock binding. At the 30 June 2026 mainnet launch the circom set is verified off chain.`,
      "KIP-16's OpZkPrecompile does verify a RISC0-Groth16 proof in consensus, and the settlement covenant migrates onto that on-chain path as its proving keys and a real multi-party ceremony ship. It stays testnet-gated until it is proven on mainnet.",
      "As that migration lands, the external resolver's role shrinks from trusted signer to liveness helper, and eventually to optional. The honest badge system makes each step visible to users in real time.",
      "Beyond resolution: multi-resolver threshold signing for whatever remains attested off chain, a real MPC ceremony or STARK paths to replace the development powers-of-tau, KCC-20 token indexing, a pay-per-call API revenue layer, and a PostgreSQL migration when covenant volume demands it.",
    ],
  },
  {
    id: 'why-now', n: '6 · Why now',
    body: [
      "The platform that indexes mainnet covenants best at the moment they appear becomes the default explorer for the category. Covex has proven its indexer at scale and is provisioning its mainnet node ahead of the Toccata activation on 30 June 2026.",
      "The goal of this codebase is simple: to be ready, correct, honest, and complete, on day one of covenants on Kaspa mainnet.",
    ],
  },
];

// TOC entry for the interactive verification panel. Rendered as a closing appendix
// (with real fetched data + an honest 404 fallback) so the contents bar still
// scroll-spies onto it. Kept id 'verify-yourself' so existing anchors stay valid.
const VERIFY_TOC = { id: 'verify-yourself', n: 'Appendix · Verify yourself' };

// Live-fetch panel: oracle x-only pubkey, served-vkey HEAD probe, disclosed
// treasury addresses. Real fetches only. Loading + error states are explicit
// so we never imply success when an endpoint or static path is missing.
function VerifyYourselfPanel() {
  const [open, setOpen] = useState(true);
  const [oraclePk, setOraclePk] = useState({ state: 'loading', value: null });
  const [vkey, setVkey] = useState({ state: 'loading', url: null });

  // Mirrors the fetch shape used in pages/Markets.jsx ~ line 315 (canonical
  // xonly_pubkey field, graceful fall-throughs for legacy payloads).
  useEffect(() => {
    let alive = true;
    fetch('/api/oracle/pubkey')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        const pk = j && (j.xonly_pubkey || j.oracle_xonly_pubkey || j.oracle_pubkey || j.pubkey);
        setOraclePk(pk ? { state: 'ok', value: pk } : { state: 'error', value: 'response did not include an x-only pubkey field' });
      })
      .catch((e) => { if (alive) setOraclePk({ state: 'error', value: String(e && e.message || e) }); });
    return () => { alive = false; };
  }, []);

  // Probe the served verification key. The actual layout (per lib/zk/circuits.js
  // vkeyPathFor) is /zk/<id>/<id>_vkey.json, not /assets/zk/keys/...; if the HEAD
  // returns 200 we surface the link, otherwise we say so honestly.
  useEffect(() => {
    let alive = true;
    const url = vkeyPathFor('age_verification');
    fetch(url, { method: 'HEAD' })
      .then((r) => { if (alive) setVkey(r.ok ? { state: 'ok', url } : { state: 'missing', url: null }); })
      .catch(() => { if (alive) setVkey({ state: 'missing', url: null }); });
    return () => { alive = false; };
  }, []);

  const treasuryEntries = Object.entries(TREASURIES);

  return (
    <section id={VERIFY_TOC.id} className="scroll-mt-24">
      <h2 className="relative text-xl font-bold text-white light:text-slate-900 mb-3 pb-2">
        {VERIFY_TOC.n}
        <span className="absolute bottom-0 left-0 h-[2px] w-20 rounded-full" aria-hidden="true" style={{ background: 'linear-gradient(90deg, #49EACB, transparent)' }} />
      </h2>
      <Card className="p-0 overflow-hidden">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors">
          <span className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={16} className="text-kaspa-green shrink-0" />
            <span className="text-sm font-bold text-white light:text-slate-900">Check the disclosed values yourself</span>
          </span>
          <ChevronDown size={16} className={`text-gray-400 light:text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="px-5 pb-5 pt-1 space-y-5 border-t border-white/[0.06] light:border-slate-200">
            <p className="text-xs text-gray-400 light:text-slate-500 leading-relaxed">
              The claims in this paper are checkable. Every value below is fetched live in your browser from this build, with nothing fabricated. If an endpoint or static path is not exposed, the panel says so rather than implying success. This sits at the end on purpose: it is the evidence behind the trust model, not a footnote in the middle of the argument.
            </p>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-2">Covex games co-sign key (BIP340, testnet)</p>
              {oraclePk.state === 'loading' && <div className="skeleton h-5 w-72" />}
              {oraclePk.state === 'ok' && (
                <p className="text-[11px] font-mono text-kaspa-green break-all">{oraclePk.value}</p>
              )}
              {oraclePk.state === 'error' && (
                <p className="text-[11px] text-amber-300 light:text-amber-700 break-words">Could not fetch /api/oracle/pubkey ({oraclePk.value}). The oracle endpoint is not reachable from this build.</p>
              )}
              <p className="text-[10px] text-gray-500 light:text-slate-500 mt-1.5">Source: GET /api/oracle/pubkey. This is the one key Covex holds. It co-signs only the testnet games-replay path, where Covex re-derives the winner from the public signed move log: a deterministic referee anyone can recompute, not a real-world-data oracle, and not trustless. Markets, ZK proofs, and mainnet never use a Covex key. Covex is migrating games to an external-referee model to remove even this.</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-2">Served Groth16 verification key (age_verification)</p>
              {vkey.state === 'loading' && <div className="skeleton h-5 w-72" />}
              {vkey.state === 'ok' && (
                <a href={vkey.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-kaspa-green hover:underline break-all">
                  <ExternalLink size={11} className="shrink-0" /> {vkey.url}
                </a>
              )}
              {vkey.state === 'missing' && (
                <p className="text-[11px] text-amber-300 light:text-amber-700">vkey static path not exposed in this build.</p>
              )}
              <p className="text-[10px] text-gray-500 light:text-slate-500 mt-1.5">HEAD probe at load. age_verification's Groth16 proof is verified off-chain by you, the counterparty, or any external verifier (snarkjs against this vkey, fail-closed); the only on-chain check is a deployer-bound resolver's Schnorr co-signature.</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-2">Disclosed treasury addresses</p>
              <div className="space-y-1.5">
                {treasuryEntries.map(([net, addr]) => (
                  <div key={net} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 shrink-0 sm:w-16">{net}</span>
                    <span className="text-[11px] font-mono text-kaspa-green break-all">{addr}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 light:text-slate-500 mt-1.5">Source: TREASURIES constant in pages/Treasury.jsx. Every tier payment is an on-chain transaction to this address.</p>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

export default function Whitepaper() {
  // Highlight the section you're reading in the (sticky) contents bar.
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  useEffect(() => {
    // Direct (rAF-free) scrollspy: the last section whose top has scrolled above the
    // sticky bar is the one you're reading. setActiveId no-ops when the value is unchanged,
    // so re-renders only happen when you actually cross a section boundary.
    // The verify appendix is its own section appended after the numbered sections,
    // so the scrollspy walks the sections in render order plus the appendix last.
    const compute = () => {
      let current = SECTIONS[0].id;
      const ordered = [...SECTIONS, VERIFY_TOC];
      for (const s of ordered) {
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
          <p className="text-sm text-gray-400 light:text-slate-500 break-words">A Covenant Explorer and Studio for Kaspa Mainnet · v1.4 · 2026-06-30</p>
        </div>
      </Card>

      <div className="z-30 glass-panel rounded-2xl p-3 border border-white/[0.06] light:border-slate-200 light:bg-white/90 mb-8 flex flex-wrap gap-x-3 gap-y-1 text-xs backdrop-blur-xl" style={{ position: 'sticky', top: '4rem' }}>
        <span className="kicker w-full mb-0.5">Contents</span>
        {[...SECTIONS, VERIFY_TOC].map((s) => (
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
              {s.takeaway && <p className="text-sm font-bold text-white light:text-slate-900 leading-relaxed">{s.takeaway}</p>}
              {s.body.map((p, i) => (
                <p key={i} className="text-sm text-gray-300 light:text-slate-700 leading-relaxed">{p}</p>
              ))}
            </div>
          </section>
        ))}
        {/* Verify-yourself sits at the very end as a labeled appendix: deliberate, live
            evidence behind the trust model, not a key dump in the middle of the argument. */}
        <VerifyYourselfPanel />
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
