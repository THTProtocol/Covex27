// Single source of truth for honesty / enforcement-reality copy.
//
// Sacred palette (mirrored from pages/Readme.jsx and components/ui/Badge.jsx):
//   on-chain        = consensus-enforced, zero trust
//   hybrid          = an on-chain script gates release, but release depends on an
//                     input the chain itself cannot decide (a conditional-outcome
//                     covenant's revealed outcome secret, or a Groth16 proof an external
//                     resolver verifies off-chain before co-signing). Never a Covex key.
//   oracle-attested = off-chain outcome signed by the named external resolver the
//                     deployer binds by pubkey (never Covex)
//   full-zk         = Groth16 proof verified fail-closed by the disclosed external
//                     resolver (the verifier you choose or run, never Covex), then
//                     co-signed on-chain
//   on-chain-zk     = KIP-16 zk_game_settle: a Groth16 proof verified ON-CHAIN by Kaspa
//                     consensus (OpZkPrecompile 0xa6); no oracle or co-signature in payout.
//                     Gated until proven live on Kaspa (OpZkPrecompile is not active on Kaspa yet).
//
// Honest model: Covex provides the ZK prover/verifier TOOLING and on-chain primitives.
// Any off-chain attestation comes from an EXTERNAL resolver the user connects or creates,
// NEVER Covex's key. Covex operates no oracle for real money (oracle covenants for real value
// are frozen).
//
// SCOPE OF THE "no chain-enforced ZK" carve-out: it applies ONLY to the OFF-CHAIN-verified
// circom circuits (the MiMC7/range/timelock family). None of THOSE deployed circuits binds a
// proof to a chain-checked hashlock (Kaspa's hashlock is blake2b256 and covenant_builder.rs
// has no proof->hashlock binding for them), so every circom ZK circuit beyond the 4
// self-contained ones is full-zk (verified OFF-CHAIN by an external resolver).
//
// The on-chain-zk reality is a SEPARATE, distinct tier and is NOT covered by that carve-out:
// the KIP-16 zk_game_settle kind has its Groth16 proof verified ON-CHAIN by Kaspa consensus
// via OpZkPrecompile (0xa6), with no oracle or co-signature in the payout. It is GATED
// (OpZkPrecompile is not live on Kaspa yet), so its copy must always read as a gated capability
// that is not yet live on Kaspa, never as a shipped live one.
//
// Every word here is load-bearing. Do not soften "consensus-enforced", "co-signed",
// "off-chain", or the explicit carve-out that full-zk is NOT on-chain trustless because Kaspa
// lacks a pairing verifier for the circom path. No em dashes.

export const REALITY_HEADLINE = {
  'on-chain':        'Consensus-enforced on Kaspa',
  'hybrid':          'On-chain custody, resolver-gated release',
  'oracle-attested': 'Settled by the named external resolver',
  'full-zk':         'Zero-knowledge proof, verified off-chain by an external resolver',
  'on-chain-zk':     'On-chain ZK (KIP-16), verified by Kaspa consensus (gated, not yet live)',
};

export const REALITY_BODY = {
  'on-chain':
    'Funds are locked in the exact P2SH commitment. Kaspa consensus runs the redeem script and releases the money only if its conditions are met. No third party can move it, the chain is the referee.',
  'hybrid':
    'An on-chain script gates custody and every payout leg, but release depends on an externally supplied input the chain itself cannot decide. For conditional-outcome covenants that input is the single committed outcome secret an external resolver reveals; for StrictGroth16 circuits it is a real Groth16 proof an external resolver verifies fail-closed before contributing the consensus-required co-signature. Covex provides the verifier tooling but operates no oracle key on this path. One carve-out: for two-party game pots the outcome input today comes from the recomputable Covex-run referee engine rather than an independent external resolver. Either way the custody is on-chain enforced, but which branch releases is gated by that off-chain check, so it is not trustless: trust sits with the disclosed resolver you chose or run, or with the Covex-run referee for game pots.',
  'oracle-attested':
    'An off-chain outcome (a market event, a data feed, a game result) is signed by the resolver the deployer binds by pubkey, whose co-signature the chain still requires via the redeem script. Trust sits with that named, publicly-keyed resolver; the settlement itself is on-chain. Carve-out: for two-party game pots the outcome input today comes from the recomputable Covex-run referee engine rather than an independent external resolver.',
  'full-zk':
    'A real Groth16 zero-knowledge proof is verified off-chain by an external resolver you choose or run, then co-signed on-chain. That external resolver will not co-sign without a valid proof. Covex provides the prover and verifier tooling but operates no oracle key here. Not chain-enforced end-to-end because Kaspa lacks a pairing verifier, so payout still requires the external resolver co-signature and is gated by that off-chain check: no Covex trust, and not trustless because trust sits with the disclosed external resolver.',
  'on-chain-zk':
    'A real Groth16 proof is verified ON-CHAIN by Kaspa consensus through the KIP-16 OpZkPrecompile (opcode 0xa6). The proof binds the covenant and the winning payee, so the loser cannot forge a winning proof, and there is no oracle and no co-signature anywhere in the payout. This is the zk_game_settle kind. OpZkPrecompile is not live on Kaspa yet, so Covex keeps this path gated until it is proven on its own prover infrastructure. Treat it as a gated capability that is not yet live on Kaspa while that proof is pending, never a live guarantee.',
};

export const REALITY_BADGE_LABEL = {
  'on-chain':        'On-chain enforced',
  'hybrid':          'Hybrid',
  'oracle-attested': 'Resolver-attested',
  'full-zk':         'Full ZK',
  'on-chain-zk':     'On-chain ZK (gated)',
};

export const REALITY_VERB = {
  'on-chain':        'Enforced by Kaspa consensus',
  'hybrid':          'On-chain script, external-resolver-gated release',
  'oracle-attested': 'Co-signed by the named external resolver',
  'full-zk':         'Proof verified off-chain by an external resolver, co-signed on-chain',
  'on-chain-zk':     'Groth16 proof verified on-chain by Kaspa consensus (gated, not yet live)',
};

const ORACLE_NOTE = {
  'hybrid':
    'The named external resolver (the one you connect or run, never Covex) contributes the consensus-required co-signature only after its off-chain check passes: the revealed outcome a resolver publishes for conditional-outcome covenants, or a Groth16 proof that verifies fail-closed for StrictGroth16 circuits.',
  'oracle-attested':
    'The named, publicly-keyed external resolver the deployer binds by pubkey signs the outcome. Settlement is on-chain, but trust in the outcome sits with that external resolver, never with Covex.',
  'full-zk':
    'Proof verified off-chain by an external resolver you choose or run; payout requires that external resolver co-signature (not chain-enforced end-to-end, and never a Covex key).',
};

export const KNOWN_REALITIES = new Set(['on-chain', 'hybrid', 'oracle-attested', 'full-zk', 'on-chain-zk']);

export function enforcementSummary(reality) {
  const key = KNOWN_REALITIES.has(reality) ? reality : 'on-chain';
  return {
    headline: REALITY_HEADLINE[key],
    body: REALITY_BODY[key],
    badge: REALITY_BADGE_LABEL[key],
    oracleNote: ORACLE_NOTE[key] || '',
  };
}
