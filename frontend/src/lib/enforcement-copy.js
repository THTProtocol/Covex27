// Single source of truth for honesty / enforcement-reality copy.
//
// Sacred palette (mirrored from pages/Readme.jsx and components/ui/Badge.jsx):
//   on-chain        = consensus-enforced, zero trust
//   hybrid          = an on-chain script gates release, but release depends on an
//                     oracle-supplied input the chain itself cannot decide (a
//                     market's revealed outcome secret, or a Groth16 proof the
//                     oracle verifies off-chain before co-signing)
//   oracle-attested = off-chain outcome signed by the named external resolver
//   full-zk         = Groth16 proof verified fail-closed by the disclosed
//                     external resolver, then co-signed on-chain
//
// There is NO "chain-enforced ZK" tier: no deployed circuit's proof is bound to a
// chain-checked hashlock (the circuits use MiMC7/range/timelock math, Kaspa's hashlock
// is blake2b256, and covenant_builder.rs has no proof->hashlock binding), so every ZK
// circuit is full-zk (verified OFF-CHAIN by the oracle). Every word here is load-bearing.
// Do not soften "consensus-enforced", "co-signed", "off-chain", or the explicit carve-out
// that full-zk is NOT on-chain trustless because Kaspa lacks a pairing verifier. No em dashes.

export const REALITY_HEADLINE = {
  'on-chain':        'Consensus-enforced on Kaspa',
  'hybrid':          'On-chain custody, oracle-gated release',
  'oracle-attested': 'Settled by the named external resolver',
  'full-zk':         'Zero-knowledge proof, oracle-verified off-chain',
};

export const REALITY_BODY = {
  'on-chain':
    'Funds are locked in the exact P2SH commitment. Kaspa consensus runs the redeem script and releases the money only if its conditions are met. No third party can move it, the chain is the referee.',
  'hybrid':
    'An on-chain script gates custody and every payout leg, but release depends on an oracle-supplied input the chain itself cannot decide. For prediction markets that input is the single committed outcome secret an external resolver reveals; for StrictGroth16 circuits it is a real Groth16 proof the oracle verifies fail-closed before contributing the consensus-required co-signature. Either way the custody is on-chain enforced, but which branch releases is gated by that trusted off-chain check, so it is not trustless.',
  'oracle-attested':
    'An off-chain outcome (a game result, a market event, a data feed) is signed by the external resolver, whose co-signature the chain still requires via the redeem script. Trust sits with that named, publicly-keyed oracle, the settlement itself is on-chain.',
  'full-zk':
    'A real Groth16 zero-knowledge proof is verified off-chain by an external resolver, then co-signed on-chain. The oracle will not co-sign without a valid proof. Not chain-enforced end-to-end because Kaspa lacks a pairing verifier, so payout still requires the oracle co-signature and is gated by that trusted off-chain check.',
};

export const REALITY_BADGE_LABEL = {
  'on-chain':        'On-chain enforced',
  'hybrid':          'Hybrid',
  'oracle-attested': 'Oracle-attested',
  'full-zk':         'Full ZK',
};

export const REALITY_VERB = {
  'on-chain':        'Enforced by Kaspa consensus',
  'hybrid':          'On-chain script, oracle-gated release',
  'oracle-attested': 'Co-signed by the external resolver',
  'full-zk':         'Proof verified off-chain, co-signed on-chain',
};

const ORACLE_NOTE = {
  'hybrid':
    'The named external resolver contributes the consensus-required co-signature only after its off-chain check passes: the revealed market outcome for prediction markets, or a Groth16 proof that verifies fail-closed for StrictGroth16 circuits.',
  'oracle-attested':
    'The named, publicly-keyed external resolver signs the outcome. Settlement is on-chain, but trust in the outcome sits with that oracle.',
  'full-zk':
    'Proof verified off-chain by an external resolver; payout requires the oracle co-signature (not chain-enforced end-to-end).',
};

export const KNOWN_REALITIES = new Set(['on-chain', 'hybrid', 'oracle-attested', 'full-zk']);

export function enforcementSummary(reality) {
  const key = KNOWN_REALITIES.has(reality) ? reality : 'on-chain';
  return {
    headline: REALITY_HEADLINE[key],
    body: REALITY_BODY[key],
    badge: REALITY_BADGE_LABEL[key],
    oracleNote: ORACLE_NOTE[key] || '',
  };
}
