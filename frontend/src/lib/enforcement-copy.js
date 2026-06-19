// Single source of truth for honesty / enforcement-reality copy.
//
// Sacred palette (mirrored from pages/Readme.jsx and components/ui/Badge.jsx):
//   on-chain        = consensus-enforced, zero trust
//   hybrid          = mandatory Groth16 proof + oracle co-signature
//   oracle-attested = off-chain outcome signed by the named Covex oracle
//   full-zk         = Groth16 proof verified fail-closed by the disclosed
//                     Covex oracle, then co-signed on-chain
//
// Every word here is load-bearing. Do not soften "consensus-enforced",
// "co-signed", "off-chain", or the explicit carve-out that full-zk is NOT
// on-chain trustless because Kaspa lacks a pairing verifier. No em dashes.

export const REALITY_HEADLINE = {
  'on-chain':        'Consensus-enforced on Kaspa',
  'hybrid':          'Groth16 proof plus oracle co-signature',
  'oracle-attested': 'Settled by the named Covex oracle',
  'full-zk':         'Zero-knowledge proof, oracle-verified off-chain',
  'full-zk-chain':   'ZK proof, chain-enforced via hashlock',
};

export const REALITY_BODY = {
  'on-chain':
    'Funds are locked in the exact P2SH commitment. Kaspa consensus runs the redeem script and releases the money only if its conditions are met. No third party can move it, the chain is the referee.',
  'hybrid':
    'A real Groth16 proof is mandatory and verified fail-closed by the disclosed Covex oracle. The oracle only contributes the consensus-required co-signature, not separate attested logic. Reserved for backend StrictGroth16 circuits where the proof body is genuinely required.',
  'oracle-attested':
    'An off-chain outcome (a game result, a market event, a data feed) is signed by the Covex oracle, whose co-signature the chain still requires via the redeem script. Trust sits with that named, publicly-keyed oracle, the settlement itself is on-chain.',
  'full-zk':
    'A real Groth16 zero-knowledge proof is verified off-chain by the disclosed Covex oracle, then co-signed on-chain. The oracle will not co-sign without a valid proof. Not chain-enforced end-to-end because Kaspa lacks a pairing verifier, so payout still requires the oracle co-signature and is gated by that trusted off-chain check.',
  'full-zk-chain':
    'The Groth16 proof is verified off-chain by the disclosed Covex oracle. Because the circuit reduces to a hashlock the chain checks (one of merkle_membership, age_verification, escrow_2party, range_proof), payout enforcement IS end-to-end on Kaspa: consensus runs the redeem script and releases the money only if the hashlock is satisfied.',
};

export const REALITY_BADGE_LABEL = {
  'on-chain':        'On-chain enforced',
  'hybrid':          'Hybrid',
  'oracle-attested': 'Oracle-attested',
  'full-zk':         'Full ZK',
  'full-zk-chain':   'Chain-enforced ZK',
};

export const REALITY_VERB = {
  'on-chain':        'Enforced by Kaspa consensus',
  'hybrid':          'Proof verified, oracle co-signs',
  'oracle-attested': 'Co-signed by the Covex oracle',
  'full-zk':         'Proof verified off-chain, co-signed on-chain',
  'full-zk-chain':   'Reduces to chain hashlock',
};

const ORACLE_NOTE = {
  'hybrid':
    'The named Covex oracle contributes the consensus-required co-signature only after the Groth16 proof verifies fail-closed.',
  'oracle-attested':
    'The named, publicly-keyed Covex oracle signs the outcome. Settlement is on-chain, but trust in the outcome sits with that oracle.',
  'full-zk':
    'Proof verified off-chain by the disclosed Covex oracle; payout requires the oracle co-signature (not chain-enforced end-to-end).',
  'full-zk-chain':
    'Proof verified off-chain by the disclosed Covex oracle, payout enforced by chain hashlock.',
};

const KNOWN_REALITIES = new Set(['on-chain', 'hybrid', 'oracle-attested', 'full-zk', 'full-zk-chain']);

export function enforcementSummary(reality) {
  const key = KNOWN_REALITIES.has(reality) ? reality : 'on-chain';
  return {
    headline: REALITY_HEADLINE[key],
    body: REALITY_BODY[key],
    badge: REALITY_BADGE_LABEL[key],
    oracleNote: ORACLE_NOTE[key] || '',
  };
}
