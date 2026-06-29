import { Link } from 'react-router-dom';
import {
  ShieldCheck, Lock, Cpu, Radio, KeyRound, Boxes, Zap, CheckCircle2,
  FileCode2, Layers, ArrowRight, Sparkles, Network, Eye, Workflow, Hash, Gavel, Coins,
} from '../lib/routeIcons.js';
import { VERIFIED_FULL_ZK } from '../lib/zk/circuits.js';

// Honest count pulled from the single source of truth (lib/zk/circuits.js).
// Do NOT hard-code this; the registry is the only place it may diverge.
// All VERIFIED_FULL_ZK circuits are Groth16-verified OFF-CHAIN by you, the
// counterparty, or any external verifier (fail-closed); the only on-chain check
// is a deployer-bound resolver's Schnorr co-signature. There is no chain-enforced ZK tier.
const ZK_TOTAL = VERIFIED_FULL_ZK.size;

/*
  /readme - the definitive, factual "how Covex works" page, framed around Kaspa mainnet.
  Every statement here is grounded in the real implementation (covenant_builder.rs,
  oracle.rs, oracle_verifier.rs, the zk/ circuits) and Kaspa's live consensus rules.
  Nothing overstates what the chain enforces; nothing invents mainnet activity.
*/

const MONO = 'font-mono text-[11px] sm:text-xs leading-relaxed break-words';

// ── Reusable bits ─────────────────────────────────────────────────────────────
function Section({ id, kicker, title, children }) {
  return (
    <section id={id} className="relative golden-container golden-section">
      {kicker && <div className="text-[11px] uppercase tracking-[3px] text-kaspa-green mb-2">{kicker}</div>}
      <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-6">{title}</h2>
      {children}
    </section>
  );
}

function Card({ children, className = '' }) {
  return <div className={`glass-panel hover-lift rounded-2xl border border-white/[0.07] p-5 ${className}`}>{children}</div>;
}

function Script({ children }) {
  return (
    <pre className={`${MONO} text-kaspa-green/90 bg-black/40 border border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap`}>{children}</pre>
  );
}

// ── Enforcement reality model ────────────────────────────────────────────────
// Sacred honesty palette - mirrors the canonical mapping in components/ui/Badge.jsx
// and TrustBadge.jsx. The same enforcement label must render the same color here
// as it does on every covenant page, or readers stop trusting any of them.
//   on-chain = emerald | hybrid = sky | oracle-attested = amber | full-zk = violet
const REALITIES = [
  { name: 'On-chain enforced', icon: ShieldCheck, cls: 'text-emerald-300 light:text-emerald-700 border-emerald-500/40 bg-emerald-500/10',
    trust: 'Zero trust', desc: 'Funds are locked in the exact 35-byte P2SH commitment. Kaspa consensus runs the redeem script and releases the money only if its conditions are met. No third party can move it. The chain is the referee.' },
  { name: 'Zero-knowledge', icon: Cpu, cls: 'text-violet-300 light:text-violet-700 border-violet-500/40 bg-violet-500/10',
    trust: 'Proof, verified off-chain', desc: `A real Groth16 zero-knowledge proof is verified fail-closed off-chain by you, the counterparty, or any external resolver (snarkjs against the audited vkey) before release. For four self-contained circuits (merkle_membership, age_verification, escrow_2party, range_proof) the proof is verified off-chain and the chain still requires an external resolver's Schnorr co-signature to release funds (there is no proof-to-hashlock binding), so they are not trustless end-to-end; for the rest a valid proof gates an external resolver's 2-of-2 cosign plus a CSV timeout, where trust sits with the disclosed resolver you chose or run, not Covex. Live today for all ${ZK_TOTAL} circom circuits with served keys and a working in-browser prover (the canonical list lives in lib/zk/circuits.js as VERIFIED_FULL_ZK). For the circom suite the Groth16 check is off-chain: all ${ZK_TOTAL} are verified off-chain, and beyond the four self-contained circuits the only on-chain check is a deployer-bound resolver's BIP340 Schnorr co-signature that the proof result gates. Toccata's KIP-16 OpZkPrecompile adds a separate on-chain ZK path the settlement covenant targets, testnet-gated until proven live on mainnet.` },
  { name: 'Hybrid', icon: Layers, cls: 'text-sky-300 light:text-sky-700 border-sky-500/40 bg-sky-500/10',
    trust: 'Proof + named resolver', desc: 'The Groth16 proof is mandatory and verified fail-closed off-chain; a named external resolver only contributes the consensus-required co-signature, not separate attested logic. Reserved for backend StrictGroth16 circuits where the proof body is genuinely required.' },
  { name: 'Resolver-attested', icon: Radio, cls: 'text-amber-300 light:text-amber-700 border-amber-500/40 bg-amber-500/10',
    trust: 'Named resolver', desc: 'An off-chain outcome is attested by a named external resolver you choose or run (never a Covex key), bound by pubkey at deploy, whose co-signature the chain requires via the redeem script. For a real-world fact (an outside event, a price, a data feed) the covenant binds to that resolver, or a real-value covenant binds to its published hashlock the chain enforces; Covex never attests outside events. For a two-party result on testnet today, Covex re-derives the result from the publicly-replayable signed log (anyone can recompute it) and co-signs the payout, and the chain still requires the winning party to add their own signature; the chain-enforced, no-Covex-key path is rolling out. Either way the settlement itself is on-chain, and trust sits with the disclosed resolver, not Covex.' },
];

// Inline pill palette for PRIMITIVES (matches REALITIES above). Keyed by p.reality.
const REALITY_PILL = {
  'on-chain':        'text-emerald-300 light:text-emerald-700 border-emerald-500/40 bg-emerald-500/10',
  'hybrid':          'text-sky-300 light:text-sky-700 border-sky-500/40 bg-sky-500/10',
  'oracle-attested': 'text-amber-300 light:text-amber-700 border-amber-500/40 bg-amber-500/10',
  'full-zk':         'text-violet-300 light:text-violet-700 border-violet-500/40 bg-violet-500/10',
};

// ── The real primitives (redeem scripts straight from covenant_builder.rs) ─────
const PRIMITIVES = [
  { name: 'Single-Key Vault', reality: 'on-chain', script: '<pubkey> OP_CHECKSIG',
    what: 'The minimal covenant. Spendable only by the holder of the key.' },
  { name: 'Hashlock', reality: 'on-chain', script: 'OP_BLAKE2B <hash> OP_EQUALVERIFY\n<pubkey> OP_CHECKSIG',
    what: 'Release on revealing a preimage P where blake2b256(P) = hash, plus a signature. The HTLC building block.' },
  { name: 'Absolute Timelock (CLTV)', reality: 'on-chain', script: '<lock_daa> OP_CHECKLOCKTIMEVERIFY\n<pubkey> OP_CHECKSIG',
    what: 'Spendable only once the chain DAA score reaches lock_daa. Vesting cliffs, dispute windows.' },
  { name: 'Relative Timelock (CSV)', reality: 'on-chain', script: '<min_seq> OP_CHECKSEQUENCEVERIFY\n<pubkey> OP_CHECKSIG',
    what: 'Spendable only after the UTXO has aged N units (BIP68). Cooldowns and delayed reveals.' },
  { name: 'N-of-M Multisig', reality: 'on-chain', script: 'OP_m <pk1> … <pkM> OP_M OP_CHECKMULTISIG',
    what: 'Any m of M keys release the funds. Treasuries, shared custody, escrow.' },
  { name: 'HTLC (Atomic Swap)', reality: 'on-chain', script: 'OP_IF OP_BLAKE2B <hash> OP_EQUALVERIFY <recv> OP_CHECKSIG\nOP_ELSE <lock_daa> OP_CHECKLOCKTIMEVERIFY <send> OP_CHECKSIG OP_ENDIF',
    what: 'Receiver claims with the preimage; sender refunds after the timelock. Cross-party / cross-chain swaps.' },
  { name: '2-Player State Channel', reality: 'on-chain', script: 'OP_IF <p1> OP_CHECKSIGVERIFY <p2> OP_CHECKSIG\nOP_ELSE <lock_daa> OP_CHECKLOCKTIMEVERIFY <p1> OP_CHECKSIG OP_ENDIF',
    what: 'Cooperative close needs both signatures; the funder can refund after a timeout. No oracle: the chain pays the agreed party.' },
  { name: "Dead-Man's Switch", reality: 'on-chain', script: 'OP_IF <owner> OP_CHECKSIG\nOP_ELSE <lock_daa> OP_CHECKLOCKTIMEVERIFY <heir> OP_CHECKSIG OP_ENDIF',
    what: 'Owner can always spend or refresh; an heir can claim only after the owner goes silent past a deadline.' },
  { name: 'Time-Decaying Multisig', reality: 'on-chain', script: 'OP_IF <ms_now>\nOP_ELSE <lock_daa> OP_CHECKLOCKTIMEVERIFY <ms_after> OP_ENDIF',
    what: 'A high quorum spends now; a lower quorum unlocks after a deadline. Treasury recovery / inheritance.' },
  { name: 'Resolver-Enforced 2-of-2', reality: 'oracle-attested', script: '2-of-2 multisig of [ resolver_xonly , winner ]',
    what: 'The chain requires the external resolver’s signature AND the winner’s. The resolver (your choice, bound by pubkey at deploy, never a Covex key) only co-signs a verified outcome, and that co-sign is consensus-required.' },
  { name: 'Oracle Escrow', reality: 'oracle-attested', script: '<resolver> OP_CHECKSIGVERIFY\nOP_IF <partyA> OP_CHECKSIG OP_ELSE <partyB> OP_CHECKSIG OP_ENDIF',
    what: 'The chain pays the staked amount only to the resolver-declared winner, who also signs their own branch. On testnet today Covex re-derives the result from the publicly-replayable log and co-signs; the chain-enforced, no-Covex-key path is rolling out.' },
];

// The 7 KIP-10 introspection opcodes live on Kaspa mainnet since Crescendo (May 2025).
const KIP10 = [
  ['OpTxInputCount', '0xb3'], ['OpTxOutputCount', '0xb4'], ['OpTxInputIndex', '0xb9'],
  ['OpTxInputAmount', '0xbe'], ['OpTxInputSpk', '0xbf'], ['OpTxOutputAmount', '0xc2'], ['OpTxOutputSpk', '0xc3'],
];

const ZK_VERIFIED = [
  { name: 'Merkle Membership', what: 'Prove a committed value exists under a MiMC7 commitment without revealing it. Whitelists, airdrops, private eligibility.' },
  { name: 'Age Verification', what: 'Prove age ≥ a threshold from a committed birth year, revealing nothing else. A zero-knowledge KYC alternative.' },
  { name: '2-Party Escrow', what: 'Prove the timeout-vs-claim branch of an escrow without trusting an operator.' },
  { name: 'Range Proof', what: 'Prove a committed value lies within a bound without revealing it. Solvency floors, spend limits, private thresholds.' },
  { name: 'VRF Dice Roll', what: 'Prove a value is forced by Poseidon(secret, public seed) so no one can cherry-pick it. Verifiable, tamper-evident randomness.' },
  { name: 'Nullifier Set', what: 'Prove a public nullifier and set anchor derive from one hidden secret. Double-spend prevention without revealing the note.' },
  { name: 'UTXO Note Proof', what: 'Prove knowledge of the Poseidon-committed UTXO note behind a public hash without revealing it. Note binding for covenants.' },
  { name: 'Hash Preimage', what: 'Prove you know the MiMC7 preimage of a public commitment without revealing it. The classic hidden-witness HTLC-style primitive.' },
  { name: 'Absolute Timelock', what: 'Prove current DAA score >= a threshold, with valid exposed as a public output. DAA-based covenant unlock.' },
  { name: 'Relative Timelock', what: 'Prove enough DAA elapsed since a reference point (valid is a public output). Dispute periods, cooldowns, delayed reveals.' },
  { name: 'Committed Random (VRF)', what: 'Prove a random value is forced by a hidden secret + public seed + VRF key. Verifiable draws and shuffles without a trusted dealer.' },
  { name: 'Turn Timer', what: 'Prove an action happened within a DAA window, keeping the exact action time private. Deadline and clock enforcement for turn-based covenants.' },
  { name: 'Script Constraint', what: 'Prove you know the hidden script_hash whose Poseidon bundle equals a public root. Bind a covenant to a rule without revealing it.' },
  { name: 'Payout Split', what: 'Prove winner_share + fee + return == total at the chosen bps. A verifiable fair payout split.' },
  { name: 'Commitment Open', what: 'Prove you can open a Poseidon commitment to a hidden value without revealing it. The minimal hidden-witness primitive for richer covenants.' },
  { name: 'Balance Threshold', what: 'Prove a committed balance meets a public threshold, revealing nothing else. Private solvency floors for lending and access gates.' },
  { name: 'Solvency Sum', what: 'Prove the sum of committed balances clears a public liability without revealing individual amounts. Proof-of-reserves without disclosure.' },
  { name: 'Set Non-Membership', what: 'Prove a value is NOT in a committed set without revealing it. Blocklist / sanction-list checks with hidden identity.' },
  { name: 'Anon Membership + Nullifier', what: 'Prove set membership and emit a single-use nullifier in one proof. Anonymous one-shot eligibility (votes, claims, drops).' },
];

export default function Readme() {
  return (
    <div className="relative">
      {/* HERO */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-10 px-4 text-center">
        <div className="covex-aurora" style={{ top: 40, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 620, height: 340, maxWidth: '90vw' }} aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-[11px] px-3 py-1 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-widest mb-5">
            <Network size={12} /> KASPA MAINNET
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.15] pt-1 mb-5">
            How <span className="text-kaspa-green">Covex</span> Works
          </h1>
          <p className="text-base sm:text-lg text-gray-200 leading-relaxed mb-6">
            Covex builds real money on the Kaspa BlockDAG. For the deterministic on-chain primitives
            (hashlock, CLTV/CSV timelocks, HTLC, multisig), funds lock into a script the chain itself
            verifies, with no custodian and no middleman. The oracle-attested and full-zk kinds settle
            on-chain too, but their outcome is verified off-chain by an external resolver you choose or run
            (never Covex), so those are not trustless. This page is the honest, end-to-end blueprint of
            exactly how each works, from the 35 bytes of the lock to the zero-knowledge proofs that gate it.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/sandbox" className="btn-shimmer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green text-black light:bg-emerald-800 light:text-white font-bold hover:brightness-110 transition">
              Open the Sandbox <ArrowRight size={16} />
            </Link>
            <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 light:border-slate-300 text-white font-semibold hover:bg-white/5 light:hover:bg-slate-100 transition">
              <Eye size={16} /> Explore covenants
            </Link>
          </div>
        </div>
      </section>

      {/* 1. THE BIG IDEA */}
      <Section kicker="The idea" title="A covenant is money that enforces its own rules">
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <Lock className="text-kaspa-green mb-3" size={22} />
            <h3 className="text-white font-bold mb-1.5">Lock to a script</h3>
            <p className="text-sm text-gray-300 leading-relaxed">You deploy funds into a Kaspa pay-to-script-hash output. The money is now held by a rule, not a person.</p>
          </Card>
          <Card>
            <ShieldCheck className="text-kaspa-green mb-3" size={22} />
            <h3 className="text-white font-bold mb-1.5">The chain is the referee</h3>
            <p className="text-sm text-gray-300 leading-relaxed">To spend, you satisfy the script. Kaspa consensus runs it and releases the funds only if the conditions are met. Covex is never in the path.</p>
          </Card>
          <Card>
            <KeyRound className="text-kaspa-green mb-3" size={22} />
            <h3 className="text-white font-bold mb-1.5">Non-custodial, always</h3>
            <p className="text-sm text-gray-300 leading-relaxed">Your wallet signs every transaction. The private key never leaves your device; the server only assembles unsigned transactions.</p>
          </Card>
        </div>
      </Section>

      {/* 2. THE COMMITMENT */}
      <Section kicker="The lock" title="35 bytes that hold the money">
        <div className="grid lg:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              Every Covex covenant is a Kaspa <strong className="text-white">pay-to-script-hash</strong> output. The locking
              script is exactly 35 bytes: the opcode <span className="text-kaspa-green font-mono">OP_BLAKE2B</span>, a 32-byte
              push of the <span className="text-white">blake2b-256 hash of the redeem script</span>, and{' '}
              <span className="text-kaspa-green font-mono">OP_EQUAL</span>. To spend, you reveal the redeem script, and the chain
              hashes it, checks it matches, then executes it. Knowing the script is the proof you are allowed to try.
            </p>
            <Script>{`P2SH lock  (aa20…87, 35 bytes)
  0xaa            OP_BLAKE2B
  0x20            push 32 bytes
  <32-byte hash>  = blake2b256(redeem_script)
  0x87            OP_EQUAL`}</Script>
            <p className="text-xs text-gray-400 mt-3">On mainnet these resolve to <span className="font-mono text-kaspa-green">kaspa:p…</span> addresses. The redeem script stays hidden until spend.</p>
          </div>
          <Card className="!p-6">
            <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2"><Workflow size={14} className="text-kaspa-green" /> Deploy, lock, spend</div>
            <ol className="space-y-3">
              {[
                ['Build', 'Your redeem script is built and verified against Kaspa’s real transaction-script engine before any funds move.'],
                ['Commit', 'commitment = blake2b256(redeem). The 35-byte P2SH lock is formed and funded by your wallet-signed transaction.'],
                ['Hold', 'The UTXO now sits under the script hash. Anyone can see the commitment; only a valid satisfier can move it.'],
                ['Spend', 'You reveal the redeem script + the satisfier (signature / preimage / branch). Consensus runs it and pays out if it passes.'],
              ].map(([t, d], i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-kaspa-green/10 border border-kaspa-green/30 text-kaspa-green text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span><span className="text-white font-semibold">{t}.</span> <span className="text-sm text-gray-300">{d}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </Section>

      {/* 3. ENFORCEMENT REALITY */}
      <Section kicker="Radical honesty" title="Every covenant wears its true enforcement">
        <p className="text-sm text-gray-300 leading-relaxed max-w-3xl mb-6">
          Most platforms blur the line between “the chain enforces this” and “trust us.” Covex refuses to. Every covenant
          is labelled with its real enforcement reality, and the label is computed strictly: <span className="text-white">on-chain</span> is
          claimed only for the exact 35-byte P2SH pattern, never from loose guesses.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {REALITIES.map((r) => (
            <Card key={r.name}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${r.cls}`}>
                  <r.icon size={12} /> {r.name}
                </span>
                <span className="sm:ml-auto text-[10px] uppercase tracking-wider text-gray-500">{r.trust}</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{r.desc}</p>
            </Card>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Decorative metadata covenants (no script enforcement) are labelled as such and refused on mainnet unless explicitly acknowledged.
        </p>
      </Section>

      {/* 4. THE PRIMITIVES */}
      <Section kicker="The building blocks" title="Real, consensus-enforced primitives">
        <p className="text-sm text-gray-300 leading-relaxed max-w-3xl mb-6">
          These are the actual redeem scripts Covex builds and verifies against Kaspa’s <span className="text-white">TxScriptEngine</span>{' '}
          before any value is locked. Nine are pure on-chain (the chain alone enforces them); two are resolver-attested (the
          script still requires an external resolver's co-signature over the declared outcome, where that resolver is your
          choice, not Covex).
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {PRIMITIVES.map((p) => (
            <Card key={p.name}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-white font-bold leading-tight break-words min-w-0">{p.name}</h3>
                <span className={`shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${REALITY_PILL[p.reality] || REALITY_PILL['on-chain']}`}>{p.reality}</span>
              </div>
              <Script>{p.script}</Script>
              <p className="text-xs text-gray-300 mt-2.5 leading-relaxed">{p.what}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* 5. THE ZK LAYER */}
      <Section kicker="Zero knowledge" title="Proofs that gate the money">
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              For conditions richer than a signature (membership, ranges, identity, computation), Covex uses real{' '}
              <strong className="text-white">Groth16 zero-knowledge proofs</strong>. The prover generates a proof with
              circom + snarkjs; you, the counterparty, or any external verifier checks it <span className="text-kaspa-green">fail-closed</span> off-chain
              (snarkjs against the audited vkey: no proof body, no missing key, no soft-pass). Only when a proof genuinely verifies does a
              deployer-bound resolver add its co-signature to the 2-of-2 the chain requires, so the named resolver co-signs only a verified proof
              and the chain enforces that co-signature at unlock.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ZK_VERIFIED.map((z) => (
                <div key={z.name} className="rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.04] p-3">
                  <div className="flex items-center gap-1.5 text-kaspa-green text-xs font-bold mb-1"><CheckCircle2 size={13} className="shrink-0" /> <span className="break-words min-w-0">{z.name}</span></div>
                  <p className="text-[11px] text-gray-300 leading-snug break-words">{z.what}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4 leading-relaxed">
              These {ZK_TOTAL} circom circuits have real Groth16 proofs that you, the counterparty, or any external resolver checks fail-closed before a
              deployer-bound resolver co-signs. All {ZK_TOTAL} are verified off-chain: for the circom suite the Groth16
              verification itself is off-chain, and the only on-chain check is a deployer-bound resolver’s BIP340 Schnorr
              co-signature. A bad proof is rejected (fail-closed), but the resolver’s co-signature is what the chain checks;
              this is verified off-chain, not on-chain-trustless. Toccata's KIP-16 OpZkPrecompile adds a separate on-chain ZK path, testnet-gated until proven live. More circuits are compiled and graduate as their proving keys
              ship and each proof is verified. Honest caveat: the current trusted setup is a single-contributor dev ceremony.
              High-value mainnet covenants warrant an independent multi-party ceremony first.
            </p>
          </div>
          <Card className="!p-6">
            <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2"><Cpu size={14} className="text-kaspa-green" /> Proof, verify, pay</div>
            <ol className="space-y-3">
              {[
                ['Prove', 'You generate a Groth16 proof of the statement (e.g. “my committed value is in range”). Your secret never leaves your machine.'],
                ['Verify', 'The backend runs snarkjs verification, fail-closed. A bodyless or invalid proof is rejected outright.'],
                ['Co-sign', 'Only on a valid proof does a deployer-bound resolver add its BIP340 signature to the 2-of-2 the script demands.'],
                ['Settle', 'Kaspa’s OP_CHECKMULTISIG enforces both signatures. The funds release, gated by an off-chain-verified proof plus the deployer-bound resolver’s consensus-required co-signature.'],
              ].map(([t, d], i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-kaspa-green/10 border border-kaspa-green/30 text-kaspa-green text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span><span className="text-white font-semibold">{t}.</span> <span className="text-sm text-gray-300">{d}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </Section>

      {/* 6. THE RESOLVER */}
      <Section kicker="The resolver" title="A real signature, not a rubber stamp">
        <div className="grid lg:grid-cols-2 gap-6 items-center">
          <Card>
            <Radio className="text-kaspa-green mb-3" size={22} />
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              Off-chain attestation, where a covenant needs it, comes from an external resolver you connect or create, bound by
              pubkey at deploy, never a Covex key. For a real-world fact, the covenant binds to that resolver
              or a real-value covenant binds to its published hashlock that the chain enforces (blake2b of the revealed secret) plus a
              timelock refund; Covex never attests outside events. Where a resolver co-signs, it uses a real{' '}
              <strong className="text-white">secp256k1 BIP340 Schnorr signature</strong>, never a forgeable keyed hash, and every
              signer's x-only public key is published openly so anyone can verify the attestation.
            </p>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              Two-party covenant settlements are the one transitional exception: on testnet today Covex re-derives the result from the
              publicly-replayable signed log (a result anyone can recompute) and co-signs the release, while the chain still
              requires the winning party to add their own signature. Covex does not decide the result. The chain-enforced,
              no-Covex-key path (the same external-resolver hashlock the conditional-outcome covenants use) is rolling out.
            </p>
            <Script>{`testnet co-sign (transitional, being retired):
message  = covex-oracle:{covenant_id}:{outcome}:{timestamp}
signature = schnorr_sign( sha256(message), covex_key )
pubkey    = GET /api/oracle/pubkey   (32-byte x-only)`}</Script>
          </Card>
          <div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              Crucially, a resolver is held to the same standard as everything else: it will <span className="text-white">refuse to sign</span> an
              outcome whose ZK proof does not verify, and for the testnet co-sign Covex is bound to the deterministic replay of the
              signed log, so it cannot mint a signature for an arbitrary requested outcome.
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">
              On-chain, the resolver’s signature is one half of a 2-of-2 multisig the script requires. That makes its co-sign{' '}
              <span className="text-kaspa-green">consensus-required</span>. The resolver is a named, accountable party you chose or run, bound by pubkey at deploy,
              not Covex, and the payout still settles on Kaspa. Trust sits with that disclosed resolver, not with us.
            </p>
          </div>
        </div>
      </Section>

      {/* 7. KASPA MAINNET */}
      <Section kicker="The network" title="Why this is real on Kaspa mainnet">
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <div className="flex items-center gap-2 text-white font-bold mb-3"><Zap size={18} className="text-kaspa-green" /> Live today (Crescendo, May 2025)</div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              Kaspa mainnet activated the <strong className="text-white">KIP-10 introspection opcodes</strong> at the Crescendo
              hard fork. A script can now read the transaction spending it (input/output counts, amounts, and script-pubkeys),
              enabling real vault, vesting, and spend-constraint covenants on mainnet now.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {KIP10.map(([n, h]) => (
                <span key={n} className="text-[10px] font-mono px-2 py-1 rounded-md border border-white/10 bg-black/40 text-gray-300">{n} <span className="text-kaspa-green">{h}</span></span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">Absolute (CLTV) and relative (CSV / BIP68) timelocks are also live and consensus-enforced, scored by Kaspa’s DAA.</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-white font-bold mb-3"><Gavel size={18} className="text-amber-400" /> Full scriptable covenants: Toccata, 30 June 2026</div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              The <strong className="text-white">Toccata hard fork</strong> (KIP-17 extended scripting, KIP-20 covenant
              lineage, KIP-21 sequencing, plus the KIP-16 ZK opcode set with its OpZkPrecompile) completes the covenant
              toolkit on mainnet. For the circom suite, ZK proofs are verified off-chain (by you, the counterparty, or any
              external resolver) and only the resolver's Schnorr co-signature is checked on-chain at unlock; KIP-16 adds a
              separate on-chain proof-checking path that stays testnet-gated for settlement until proven live on mainnet.
              Covex is built and proven against this ruleset already.
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">
              We do not fake the gap. Until Toccata activates, the mainnet explorer honestly shows <span className="text-white">zero</span> covenants, because
              there is no placeholder or simulated data anywhere on Covex. Every figure is queried live from the chain.
            </p>
          </Card>
        </div>
        <Card className="mt-4">
          <div className="flex items-center gap-2 text-white font-bold mb-2"><KeyRound size={18} className="text-kaspa-green" /> Mainnet is non-custodial by construction</div>
          <p className="text-sm text-gray-300 leading-relaxed">
            On mainnet every transaction is signed by your own wallet extension. The server builds the unsigned funding and
            spend transactions and verifies the result, but never holds a key. Hardcoded dev keys are hard-blocked on mainnet.
            Covex runs no real-world-data oracle and holds no key on the markets, ZK, or mainnet paths: oracle-co-signed
            covenant kinds are frozen on mainnet, and real-value covenants bind instead to an external resolver's published
            hashlock the chain enforces. The single exception is one Covex-held co-sign key on the testnet games-replay path,
            where Covex re-derives the winner from the public signed move log (a publicly-recomputable referee, not a real-world
            oracle); it is being removed as the chain-enforced rebind rolls out.
          </p>
        </Card>
      </Section>

      {/* 8. WHAT YOU CAN DO */}
      <Section kicker="The product" title="What you can do with it">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            [Eye, 'Explore', 'A live, real-time index of on-chain covenants, every one labelled with its true enforcement, searchable by TXID, creator or type.'],
            [Boxes, 'Build in the Sandbox', 'One window: a free circuit library drives a live preview (enforcement, resolution flow, an accurate payout simulator and example SilverScript), then the builder deploys it.'],
            [FileCode2, 'Start from a template', 'An official catalog across primitives, ZK proofs, resolver-attested covenants, DeFi, and identity. Each opens preconfigured in the sandbox.'],
            [Coins, 'Deploy non-custodially', 'Lock real funds into an enforced P2SH primitive; redeem them by satisfying the script with your own key. Covex never holds the money.'],
            [Hash, 'Prove with ZK', 'Generate a real Groth16 proof for membership, range or age claims; you, the counterparty, or any external resolver checks it fail-closed off-chain, then a deployer-bound resolver co-signs the 2-of-2 the chain requires to release the funds.'],
            [Sparkles, 'Settle two-party covenants', 'Both parties stake into a covenant; on testnet today Covex re-derives the result from the publicly-replayable signed log (anyone can recompute) and co-signs the release, while the chain still requires the winning party to add their own signature. The chain-enforced, no-Covex-key path is rolling out.'],
          ].map(([Icon, t, d]) => (
            <Card key={t}>
              <Icon className="text-kaspa-green mb-3" size={22} />
              <h3 className="text-white font-bold mb-1.5">{t}</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{d}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <section className="relative overflow-hidden px-4 py-16 text-center">
        <div className="covex-aurora" style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 520, height: 280, maxWidth: '90vw' }} aria-hidden="true" />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">Money that keeps its own promises.</h2>
          <p className="text-gray-300 mb-6">Open the sandbox, pick any covenant, and watch exactly how it resolves, for free, with no wallet required to look.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/sandbox" className="btn-shimmer inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-kaspa-green text-black light:bg-emerald-800 light:text-white font-bold hover:brightness-110 transition">
              Open the Sandbox <ArrowRight size={16} />
            </Link>
            <Link to="/whitepaper" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 light:border-slate-300 text-white font-semibold hover:bg-white/5 light:hover:bg-slate-100 transition">
              Read the whitepaper
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
