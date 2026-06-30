// Grounded covenant-assistant engine. Maps a plain-English goal to REAL covenants from the live
// catalog. It is honest by construction: it only ever returns circuits that actually exist in the
// `circuits` array (ZK_CIRCUIT_TYPES) with their TRUE enforcement reality, so it cannot invent a
// circuit or overclaim ZK / trustlessness. Pure, deterministic, zero-dependency.

const REALITY_EXPLAIN = {
  'on-chain': 'Kaspa consensus enforces the spend directly. Your own wallet redeems by satisfying the published script, and no Covex key sits in the payout path. Trustless for custody and payout; metadata and labels are still computed by Covex.',
  'full-zk': 'A real Groth16 proof is required and verified off-chain (by you, the counterparty, or any external verifier) before it gates the release through a 2-of-2 cosign plus a CSV timeout. The proof cannot be faked; for the circom suite the proof is verified off-chain, not checked by the chain.',
  hybrid: 'A zero-knowledge property proof plus an external resolver attestation resolve it.',
  'oracle-attested': 'Resolved by an external resolver the deployer binds by pubkey at deploy: the resolver signs an attestation of the outcome, then it is paid out on-chain. Covex never attests real-world facts; the resolver is the one trusted component and it is always disclosed (these stay disabled for real value until they can be made trustless).',
  decorative: 'A metadata marker. It carries information but does not itself gate a spend.',
};

// Intent rules: trigger phrases -> hints used to find the matching circuit in the REAL catalog.
const INTENTS = [
  { kw: ['escrow', 'hold funds', 'hold the funds', 'in escrow', 'buyer', 'seller', 'goods', 'release the'], find: ['escrow_2party', 'escrow'], lead: 'A two-party escrow holds the funds until the agreed condition is met.' },
  { kw: ['refund', 'timeout', 'deadline', 'expire', 'does not ship', 'fails to', 'within 30', 'within 7', 'within'], find: ['escrow_2party', 'timelock'], lead: 'An escrow/timeout covenant refunds after the deadline if the condition is not met.' },
  { kw: ['vesting', 'vest', 'unlock after', 'lock until', 'lock for', 'cliff', 'release on', 'release after', 'time lock', 'timelock'], find: ['timelock_absolute', 'timelock', 'relative_timelock'], lead: 'A timelock locks the funds until a chosen time, then releases them.' },
  { kw: ['whitelist', 'allowlist', 'eligibility', 'eligible', 'airdrop', 'membership', 'member', 'allow list'], find: ['merkle_membership', 'merkle'], lead: 'A Merkle-membership proof shows an address is on a committed list without revealing the list.' },
  { kw: ['age', 'over 18', '18+', '21+', 'kyc', 'birth', 'adult', 'old enough', 'minimum age'], find: ['age_verification'], lead: 'Age verification proves someone meets an age threshold without revealing their birth date.' },
  { kw: ['range', 'between', 'at least', 'at most', 'min ', 'max ', 'collateral', 'sufficient', 'within bounds'], find: ['range_proof', 'range'], lead: 'A range proof shows a hidden value lies within bounds without revealing it.' },
  { kw: ['multisig', 'multi-sig', 'multi sig', 'n of m', 'n-of-m', 'signers', 'approval', 'co-sign', 'quorum', 'committee'], find: ['multi_sig', 'multisig', 'threshold'], lead: 'A multi-signature threshold requires several keys to approve a spend.' },
  { kw: ['prediction', 'bet', 'wager', 'market', 'outcome', 'odds', 'forecast'], find: ['prediction_market', 'prediction'], lead: 'A conditional-outcome covenant pays out based on a resolved real-world outcome.' },
  { kw: ['auction', 'bid', 'bidder', 'clearing', 'highest'], find: ['auction'], lead: 'An auction covenant clears bids and pays the winner.' },
  { kw: ['random', 'dice', 'lottery', 'vrf', 'shuffle', 'fair draw', 'fairness', 'coin flip'], find: ['vrf', 'dice'], lead: 'A VRF gives verifiable randomness for draws and shuffles.' },
  { kw: ['hash', 'preimage', 'secret', 'atomic swap', 'htlc', 'reveal'], find: ['hash_preimage', 'htlc', 'hash'], lead: 'A hashlock releases funds when the secret preimage is revealed (atomic-swap style).' },
  { kw: ['token gated', 'token-gated', 'gated', 'gate access', 'holders', 'hold token'], find: ['token_gated', 'gating', 'merkle'], lead: 'Token-gating restricts access or spend to qualifying holders.' },
  { kw: ['loan', 'lend', 'borrow', 'ltv', 'health factor', 'liquidation', 'collateralized'], find: ['loan', 'collateral_ltv', 'liquidation', 'ltv'], lead: 'A lending covenant tracks collateral health and triggers on an LTV threshold.' },
  { kw: ['dao', 'governance', 'vote', 'voting', 'treasury', 'proposal'], find: ['merkle_dao', 'dao', 'treasury'], lead: 'A DAO/governance covenant gates actions by committed voting power.' },
  { kw: ['chess'], find: ['chess_v1', 'chess'], lead: 'A chess covenant settles a real game between two staked players.' },
  { kw: ['poker'], find: ['poker_v1', 'poker'], lead: 'A poker covenant settles a real hand with a verifiable deal.' },
  { kw: ['blackjack'], find: ['blackjack'], lead: 'A blackjack covenant settles a staked hand.' },
  { kw: ['game', 'play', 'arena', 'duel', 'match', 'tournament'], find: ['chess_v1', 'poker_v1', 'blackjack'], lead: 'A game covenant stakes two players and settles the on-chain result.' },
];

function findInCatalog(circuits, hints) {
  for (const h of hints) {
    const exact = circuits.find((c) => c.id === h);
    if (exact) return exact;
  }
  for (const h of hints) {
    const needle = h.replace(/_/g, ' ');
    const part = circuits.find((c) => c.id.includes(h) || c.name.toLowerCase().includes(needle));
    if (part) return part;
  }
  return null;
}

export function suggestCovenants(query, circuits) {
  const q = (query || '').toLowerCase();
  if (!q.trim() || !Array.isArray(circuits) || !circuits.length) return [];
  const scored = [];
  const seen = new Set();

  // 1) Curated intent rules (high confidence).
  for (const intent of INTENTS) {
    const hits = intent.kw.filter((k) => q.includes(k)).length;
    if (!hits) continue;
    const circuit = findInCatalog(circuits, intent.find);
    if (!circuit || seen.has(circuit.id)) continue;
    seen.add(circuit.id);
    scored.push({ circuit, score: 1000 + hits * 10, why: intent.lead });
  }

  // 2) Keyword-overlap fallback over the WHOLE real catalog (catches anything the rules miss).
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (words.length) {
    for (const c of circuits) {
      if (seen.has(c.id)) continue;
      const hay = `${c.name} ${c.id} ${c.description} ${c.category}`.toLowerCase();
      const overlap = words.filter((w) => hay.includes(w)).length;
      if (overlap >= 2) {
        scored.push({ circuit: c, score: overlap, why: `Matches your description: ${(c.description || '').slice(0, 100)}` });
        seen.add(c.id);
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => ({
    id: s.circuit.id,
    circuit: s.circuit,
    name: s.circuit.name, // deterministic suggestions seed the builder name with the circuit name
    why: s.why,
    // Honest confidence derived from HOW the match was made: a curated intent rule (score >= 1000)
    // is a strong match; a broad keyword-overlap fallback is good (>= 3 words) or possible (2 words).
    confidence: s.score >= 1000 ? 'high' : s.score >= 3 ? 'medium' : 'low',
    realityNote: REALITY_EXPLAIN[s.circuit.reality] || REALITY_EXPLAIN['oracle-attested'],
  }));
}
