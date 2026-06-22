import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Cpu, Loader, CheckCircle2, XCircle, Eye, EyeOff, Info, ArrowLeft,
  Fingerprint, EyeOff as PrivacyIcon, Coins, Vote, Dices, Image as ImageIcon,
  Scale, Lock, Sparkles, Terminal, ChevronDown,
} from 'lucide-react';
import { ZK_CIRCUIT_TYPES } from '../components/CovexTerminal';
import { IN_BROWSER_PROVERS } from '../lib/zk/circuits';
import {
  STUDIO_CIRCUITS, STUDIO_FLAGSHIP_ORDER, studioFieldDefaults, studioProveAndVerify,
} from '../lib/zk/studioProvers';

// ZK Studio: generate AND verify real Groth16 proofs for Covex's circom circuits, entirely in your
// browser. No server, no oracle: snarkjs.groth16.fullProve runs against the served wasm + zkey, then
// snarkjs.groth16.verify runs against the served verification key. Fully trustless.
//
// HONESTY ABSOLUTE: this is OFF-CHAIN verification (here in your browser, or by any counterparty /
// external verifier). Kaspa has NO on-chain pairing verifier, so a proof is never checked on-chain.
// In production these same proofs gate a 2-of-2 covenant co-signature from the disclosed Covex oracle;
// nothing here is "chain-enforced" and no copy claims it is.

// ── use-case groups for the full catalog ─────────────────────────────────────
// Maps the catalog's raw `category` to a human use-case group + icon. The raw categories are:
// crypto, kaspa, defi, privacy, gating, oracle, compute, crosschain, game, meta, custom, other.
const GROUPS = [
  { key: 'identity',   label: 'Identity & Credentials', icon: Fingerprint, desc: 'Prove who you are, or that you qualify, without revealing the underlying data.' },
  { key: 'privacy',    label: 'Privacy Primitives',     icon: PrivacyIcon, desc: 'Commitments, nullifiers and the building blocks of confidential covenants.' },
  { key: 'defi',       label: 'DeFi & Solvency',        icon: Coins,       desc: 'Balances, ranges, reserves and collateral, proven without disclosing amounts.' },
  { key: 'voting',     label: 'Voting & Governance',    icon: Vote,        desc: 'One-person-one-vote and weighted governance with anonymity + double-vote guards.' },
  { key: 'randomness', label: 'Randomness & VRF',       icon: Dices,       desc: 'Verifiably fair dice, draws and shuffles forced by a committed secret.' },
  { key: 'provenance', label: 'Provenance & Assets',    icon: ImageIcon,   desc: 'UTXO notes, NFT traits and ownership, bound without revealing the secret.' },
  { key: 'compliance', label: 'Compliance & Set Logic', icon: Scale,       desc: 'Blocklist non-membership and sanctions-free attestations, value never disclosed.' },
  { key: 'kaspa',      label: 'Kaspa & Covenant Native', icon: Lock,       desc: 'Timelocks, script constraints and pot math tuned for Kaspa covenants.' },
  { key: 'games',      label: 'Verifiable Games',       icon: Terminal,    desc: 'zkVM game proofs. These prove via the open-source CLI, not in the browser.' },
];

// Assign each catalog circuit to one of the use-case groups above. Honest, content-driven mapping;
// falls back to the broad bucket for the long tail so every circuit is reachable.
function groupFor(c) {
  if (c.category === 'game') return 'games';
  const id = c.id;
  if (['age_verification', 'merkle_membership', 'merkle_dao', 'merkle_airdrop', 'anon_credential', 'credential_nullifier', 'signed_attribute_threshold', 'eddsa_doc_signature', 'merkle_leaf_threshold'].includes(id)) return 'identity';
  if (['anonymous_vote', 'anon_membership_nullifier', 'ring_signature', 'nullifier_v1'].includes(id)) return 'voting';
  if (id.startsWith('vrf') || ['vrf_dice_roll', 'vrf_random', 'vrf_winner_select', 'distributed_random', 'shuffle_proof', 'commit_reveal_vrf', 'commit_reveal_timed'].includes(id)) return 'randomness';
  if (['utxo_ownership', 'basic_utxo_ownership', 'nft_trait_reveal', 'stealth_address_ownership', 'onchain_sig_verify', 'proof_of_reserves'].includes(id)) return 'provenance';
  if (['set_non_membership', 'sanctions_non_membership', 'nullifier_set'].includes(id)) return 'compliance';
  if (c.category === 'defi' || ['range_proof', 'balance_threshold', 'solvency_sum', 'private_sum_equals', 'collateral_ltv', 'collateral_liquidation'].includes(id)) return 'defi';
  if (c.category === 'privacy' || ['commitment_open', 'hash_preimage', 'pedersen_commitment', 'poseidon_hash'].includes(id)) return 'privacy';
  if (c.category === 'kaspa' || c.category === 'crypto') return 'kaspa';
  return 'kaspa';
}

// ── pretty number for timings ────────────────────────────────────────────────
const ms = (n) => (n == null ? null : `${n} ms`);

// ── flagship interactive prover card ─────────────────────────────────────────
// Hoisted to module scope (never define-inside-render: it would remount on every parent render and
// blow away the form/focus/proof state). One self-contained prove + verify cycle.
// Exported so the Build flow (Sandbox Phase 2 "Choose how it resolves") can reuse the SAME engine
// to test-prove a circuit inline while the user is configuring it.
export function FlagshipProver({ circuitId }) {
  const meta = STUDIO_CIRCUITS[circuitId];
  const [values, setValues] = useState(() => studioFieldDefaults(circuitId));
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [showSignals, setShowSignals] = useState(false);

  const onChange = useCallback((key, v) => setValues((prev) => ({ ...prev, [key]: v })), []);

  const run = useCallback(async () => {
    setStatus('running'); setErrMsg(''); setResult(null);
    try {
      const r = await studioProveAndVerify(circuitId, values);
      setResult(r);
      setStatus('done');
      setShowSignals(false);
    } catch (e) {
      setErrMsg(e?.message || String(e));
      setStatus('error');
    }
  }, [circuitId, values]);

  const running = status === 'running';
  const verified = status === 'done' && result?.verified === true;
  const rejected = status === 'done' && result?.verified === false;

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 backdrop-blur-sm p-5 light:bg-white light:border-slate-200 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-base font-bold text-white light:text-slate-900">{meta.label}</h3>
          <p className="text-[12.5px] text-gray-400 light:text-slate-500 leading-relaxed mt-0.5">{meta.statement}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/12 px-2 py-0.5 text-[10px] font-bold text-violet-300 light:text-violet-700 light:bg-violet-50 light:border-violet-300">
          <Cpu size={11} /> in-browser
        </span>
      </div>

      {/* editable witness inputs (private values stay in the browser) */}
      {(meta.fields || []).length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {meta.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-[11px] font-semibold text-gray-300 light:text-slate-600 mb-1">{f.label}</span>
              <input
                type="text"
                inputMode="numeric"
                value={values[f.key] ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
                disabled={running}
                placeholder={f.default === '' ? 'random' : f.default}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 light:bg-slate-50 light:border-slate-300 light:text-slate-900 light:placeholder:text-slate-400"
              />
              {f.hint && <span className="block text-[10.5px] text-gray-500 light:text-slate-400 mt-1 leading-snug">{f.hint}</span>}
            </label>
          ))}
        </div>
      )}
      {(meta.fields || []).length === 0 && (
        <p className="mt-3 text-[12px] text-gray-500 light:text-slate-400 leading-relaxed">
          This circuit runs its fixed worked example (a committed demo set). The secret witness is
          generated and kept in your browser.
        </p>
      )}

      {/* run */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 border border-violet-500/40 px-4 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 transition-colors disabled:opacity-50 light:text-violet-700 light:bg-violet-50 light:hover:bg-violet-100"
        >
          {running ? <Loader size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {running ? 'Proving + verifying...' : (result ? 'Run again' : 'Generate + verify proof')}
        </button>
        {result && result.timings && (
          <span className="text-[11px] text-gray-500 light:text-slate-400 font-mono">
            prove {ms(result.timings.proveMs)} · verify {ms(result.timings.verifyMs)}
          </span>
        )}
      </div>

      {/* verified */}
      {verified && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3.5 light:bg-emerald-50 light:border-emerald-300">
          <div className="flex items-center gap-2 mb-1.5">
            <CheckCircle2 size={16} className="text-emerald-400 light:text-emerald-600" />
            <span className="text-sm font-bold text-emerald-200 light:text-emerald-700">Proof verified in your browser</span>
          </div>
          <p className="text-[12.5px] text-emerald-100/90 light:text-emerald-800 leading-relaxed">
            {result.publicNote}
          </p>
          <p className="mt-1.5 text-[11.5px] text-gray-400 light:text-slate-500 leading-relaxed">
            snarkjs.groth16.verify returned true against the served verification key. No server, no
            oracle: the whole prove + verify cycle ran here.
          </p>
          <button
            onClick={() => setShowSignals((v) => !v)}
            className="mt-2.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400 hover:text-gray-200 light:text-slate-500 light:hover:text-slate-800"
          >
            {showSignals ? <EyeOff size={12} /> : <Eye size={12} />} Public signals ({result.publicSignals.length})
          </button>
          {showSignals && (
            <div className="mt-2 space-y-1">
              {result.publicSignals.map((s, i) => (
                <div key={i} className="font-mono text-[11px] text-emerald-200/90 light:text-emerald-700 break-all">[{i}] {s.toString()}</div>
              ))}
              <p className="text-[10.5px] text-gray-500 light:text-slate-400 pt-1 leading-relaxed">
                The private witness is not among these signals and never left your browser.
              </p>
            </div>
          )}
        </div>
      )}

      {/* rejected (a tampered/invalid proof would land here, fail-closed) */}
      {rejected && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5 light:bg-amber-50 light:border-amber-300">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={15} className="text-amber-400 light:text-amber-600" />
            <span className="text-sm font-bold text-amber-200 light:text-amber-700">Verification returned false</span>
          </div>
          <p className="text-[12.5px] text-amber-100/90 light:text-amber-800 leading-relaxed">
            snarkjs.groth16.verify rejected this proof. This is the fail-closed path: an invalid proof
            is never accepted.
          </p>
        </div>
      )}

      {/* honest error */}
      {status === 'error' && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 light:bg-rose-50 light:border-rose-300">
          <XCircle size={15} className="text-rose-400 light:text-rose-600 mt-0.5 shrink-0" />
          <p className="text-[12px] text-rose-200/90 light:text-rose-700 leading-relaxed">{errMsg}</p>
        </div>
      )}
    </div>
  );
}

// ── catalog circuit row ──────────────────────────────────────────────────────
function CatalogRow({ c }) {
  const provable = IN_BROWSER_PROVERS.has(c.id);
  const isGame = c.category === 'game';
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 light:bg-slate-50/60 light:border-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-white light:text-slate-900 truncate">{c.name}</span>
            {provable && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/12 px-1.5 py-0.5 text-[9.5px] font-bold text-violet-300 light:text-violet-700 light:bg-violet-50 light:border-violet-300">
                <Cpu size={9} /> in-browser
              </span>
            )}
            {!provable && isGame && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/12 px-1.5 py-0.5 text-[9.5px] font-bold text-sky-300 light:text-sky-700 light:bg-sky-50 light:border-sky-300">
                <Terminal size={9} /> CLI prover
              </span>
            )}
            {!provable && !isGame && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-300 light:text-amber-700 light:bg-amber-50 light:border-amber-300">
                oracle-attested
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-gray-400 light:text-slate-500 leading-relaxed mt-1 line-clamp-3">{c.description}</p>
        </div>
      </div>
    </div>
  );
}

// ── catalog group (collapsible) ──────────────────────────────────────────────
function CatalogGroup({ group, circuits, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const GroupIcon = group.icon;
  const provableCount = circuits.filter((c) => IN_BROWSER_PROVERS.has(c.id)).length;
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/40 light:bg-white light:border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] light:hover:bg-slate-50 transition-colors"
      >
        <span className="grid place-items-center h-9 w-9 rounded-xl bg-violet-500/12 border border-violet-500/25 text-violet-300 light:bg-violet-50 light:text-violet-600 light:border-violet-200 shrink-0">
          <GroupIcon size={17} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white light:text-slate-900">{group.label}</span>
          <span className="block text-[11.5px] text-gray-400 light:text-slate-500 leading-snug">{group.desc}</span>
        </span>
        <span className="shrink-0 flex items-center gap-2">
          <span className="text-[11px] text-gray-500 light:text-slate-400 font-mono">
            {circuits.length}{provableCount > 0 ? ` · ${provableCount} provable` : ''}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {circuits.map((c) => <CatalogRow key={c.id} c={c} />)}
          {group.key === 'games' && (
            <div className="md:col-span-2 rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-3.5 light:bg-sky-50 light:border-sky-200">
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={14} className="text-sky-300 light:text-sky-600" />
                <span className="text-[12px] font-bold text-sky-200 light:text-sky-700">Prove these with the open-source CLI</span>
              </div>
              <p className="text-[11.5px] text-gray-400 light:text-slate-500 leading-relaxed">
                zkVM game proofs (chess, full board logic) are too heavy to prove in a browser tab. They
                prove with the open-source covex-games-prover CLI and are verified the same way. See the
                guide at <code className="font-mono text-sky-300 light:text-sky-700">zkvm/chess/README.md</code> in the repo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The shared body: the honest trust framing, the flagship interactive provers, and the full
// circuit catalog. Identical in the standalone page and the embedded-in-Build view, so there is
// exactly ONE prove + verify engine. `embedded` only tunes the hero copy above this body.
function ZkStudioBody() {
  // Group the full catalog by use case.
  const grouped = useMemo(() => {
    const byGroup = Object.fromEntries(GROUPS.map((g) => [g.key, []]));
    for (const c of ZK_CIRCUIT_TYPES) {
      // Skip pure metadata/decorative entries; keep real proof circuits.
      if (c.reality === 'decorative') continue;
      const g = groupFor(c);
      (byGroup[g] || byGroup.kaspa).push(c);
    }
    return byGroup;
  }, []);

  const totalCircuits = useMemo(
    () => GROUPS.reduce((n, g) => n + (grouped[g.key]?.length || 0), 0),
    [grouped],
  );

  return (
    <>
        {/* honest trust framing */}
        <div className="mb-9 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4 sm:p-5 light:bg-amber-50 light:border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <Info size={15} className="text-amber-300 light:text-amber-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-200 light:text-amber-700">What this proves, honestly</span>
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-amber-100/90 light:text-amber-900 leading-relaxed list-disc pl-5">
            <li>Proofs are verified <strong>off-chain</strong>: here in your browser now, or by a counterparty or any external verifier later. The verification key is public.</li>
            <li>Kaspa has <strong>no on-chain pairing verifier</strong>, so a proof is never checked on-chain. Nothing here is "chain-enforced" and no proof is trustless on its own.</li>
            <li>In production these same proofs gate a 2-of-2 covenant co-signature from the disclosed Covex oracle (fail-closed). The oracle is the named trust boundary for payout; the only on-chain check is its Schnorr co-signature.</li>
            <li>The trusted setup is a single-contributor Covex dev ceremony, not a production multi-party MPC.</li>
            <li>Your private witness (birth year, balance, secret, blinding...) is computed and kept in your browser. Only the proof and its public signals are produced.</li>
          </ul>
        </div>

        {/* flagship interactive provers */}
        <section className="mb-10">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-xl font-bold text-white light:text-slate-900">Prove it yourself</h2>
            <span className="text-[12px] text-gray-500 light:text-slate-400">{STUDIO_FLAGSHIP_ORDER.length} flagship circuits</span>
          </div>
          <p className="text-[13px] text-gray-400 light:text-slate-500 mb-5 max-w-3xl leading-relaxed">
            Each of these runs a genuine fullProve + verify in your browser. Proving takes a few
            seconds (it stays responsive). Edit the inputs and watch the proof change. A false
            statement is refused before any proof is attempted, so the circuit never proves a lie.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {STUDIO_FLAGSHIP_ORDER.map((id) => <FlagshipProver key={id} circuitId={id} />)}
          </div>
        </section>

        {/* full catalog */}
        <section>
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-xl font-bold text-white light:text-slate-900">The full circuit catalog</h2>
            <span className="text-[12px] text-gray-500 light:text-slate-400">{totalCircuits} circuits</span>
          </div>
          <p className="text-[13px] text-gray-400 light:text-slate-500 mb-5 max-w-3xl leading-relaxed">
            Every circuit's plain-English statement and what it proves. Circuits tagged
            <span className="text-violet-300 light:text-violet-700 font-semibold"> in-browser</span> have
            a working prover above. The rest are resolved by the disclosed oracle (fail-closed), and the
            verifiable games prove via the open-source CLI.
          </p>
          <div className="space-y-3">
            {GROUPS.map((g) => {
              const circuits = grouped[g.key] || [];
              if (circuits.length === 0) return null;
              return (
                <CatalogGroup
                  key={g.key}
                  group={g}
                  circuits={circuits}
                  defaultOpen={['identity', 'privacy', 'defi'].includes(g.key)}
                />
              );
            })}
          </div>
        </section>

        <div className="mt-10 flex items-start gap-1.5">
          <Info size={12} className="text-gray-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-500 light:text-slate-400 leading-relaxed max-w-3xl">
            Proofs are generated with snarkjs (Groth16 over BN254) against artifacts served from
            <code className="font-mono"> /zk/&lt;circuit&gt;/</code>. Verification runs the same snarkjs
            in your browser against the served verification key. The same proofs verify identically at
            the disclosed Covex oracle, which co-signs the covenant spend.
          </p>
        </div>
    </>
  );
}

// Embedded view: the ZK prove/verify capability rendered AS PART OF Build (a workspace choice in
// the Sandbox), not a separate top-level destination. No standalone hero, aurora, or "Back to
// Explorer" link: it nests inside the Build page's own chrome. Same engine, same circuits.
export function ZkStudioEmbedded() {
  return (
    <div className="min-w-0">
      <div className="mb-6">
        <p className="max-w-3xl text-[14px] text-gray-300 light:text-slate-600 leading-relaxed">
          Test the zero-knowledge logic before you deploy a covenant that uses it. Pick a circuit,
          fill in a private statement, and a real Groth16 proof is generated in your browser with
          snarkjs against the served wasm and proving key, then verified in the same tab against the
          served verification key. No server, no oracle: the whole cycle is yours.
        </p>
      </div>
      <ZkStudioBody />
    </div>
  );
}

// Standalone page (kept for the internal /zk-studio route reached FROM Build, never a peer nav item).
export default function ZkStudio() {
  return (
    <div className="relative min-h-screen">
      <div
        className="covex-aurora"
        aria-hidden="true"
        style={{ top: 8, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 560, height: 280, maxWidth: '92vw' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Link to="/sandbox" className="inline-flex items-center gap-2 text-sm text-gray-400 light:text-slate-500 hover:text-kaspa-green mb-7">
          <ArrowLeft size={15} /> Back to Build
        </Link>

        {/* hero */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-violet-500/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300 light:text-violet-700 light:bg-violet-50 light:border-violet-300 mb-4">
            <ShieldCheck size={13} /> Prove (ZK)
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white light:text-slate-900 tracking-tight">
            Generate and verify real ZK proofs in your browser
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] text-gray-300 light:text-slate-600 leading-relaxed">
            Covex's circom circuits, made usable. Pick a circuit, fill in a private statement, and a
            real Groth16 proof is generated in your browser with snarkjs against the served wasm and
            proving key, then verified in the same tab against the served verification key. No server,
            no oracle: the whole cycle is yours.
          </p>
        </div>

        <ZkStudioBody />
      </div>
    </div>
  );
}
