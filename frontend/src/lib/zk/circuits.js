// The canonical ZK circuit catalog lives in components/CovexTerminal.jsx
// (exported as ZK_CIRCUIT_TYPES). Every consumer imports it from there; there is no
// duplicate copy here. This module owns the served-artifact path helpers and the
// canonical enforcement-reality sets (VERIFIED_FULL_ZK below) only.

// Served-artifact directory aliases: a few circuit ids are served under a different
// directory name than the catalog id. The vkey/wasm/zkey live under the ALIAS, so any
// link built as /zk/<id>/<id>_vkey.json must resolve <id> through this map or it 404s.
//   utxo_ownership -> basic_utxo_ownership (the only current divergence).
export const ARTIFACT_DIR = {
  utxo_ownership: 'basic_utxo_ownership',
};

// Resolve a circuit id to the directory+prefix its served artifacts actually use.
export function artifactId(circuitId) {
  return ARTIFACT_DIR[circuitId] || circuitId;
}

// Build the served Groth16 verification-key URL for a circuit, honoring the alias map
// so the link resolves (both the directory and the file prefix use the aliased id).
export function vkeyPathFor(circuitId) {
  if (!circuitId || circuitId === 'none') return null;
  const dir = artifactId(circuitId);
  return `/zk/${dir}/${dir}_vkey.json`;
}

// ── CANONICAL ZK REALITY SETS (single source of truth) ───────────────────────
// These three sets used to be COPY-PASTED into CovexTerminal.jsx, TransparencyModal.jsx
// and OnChainLockSection.jsx, which is exactly the duplicate-set drift that has bitten
// this codebase before (one set updated, the others stale, so a badge lies). They now
// live HERE and every consumer imports them. Membership is byte-for-byte the same as the
// CovexTerminal sets were - this is a de-dupe, NOT a re-scoping. Do not change membership
// here without generating a real proof for the circuit (HONESTY ABSOLUTE).

// Circuits whose Groth16 proof is verified END-TO-END (real accept + tamper-reject): they ship a
// served proving key (.zkey) AND a working in-browser prover. HONESTY: this verification is OFF-CHAIN
// (by you, the counterparty, or any external verifier - snarkjs against the audited vkey). For this
// circom suite the proof is verified off-chain; a valid proof gates a 2-of-2 cosign + CSV timeout, and
// only a BIP340 Schnorr co-signature is verified on-chain. The KIP-16 OpZkPrecompile is a
// separate on-chain ZK path the settlement covenant targets, gated until proven live on Kaspa.
// The trusted setup is a single-contributor Covex dev ceremony, NOT a production multi-party MPC.
// This set therefore drives the genuine "in-browser prover" capability + off-chain-verified note; it
// is NEVER rendered as a 'full-zk' / trustless / on-chain-ZK badge (every ZK reality renders as
// oracle-attested - see ZK_CIRCUIT_TYPES post-processing in CovexTerminal). TWENTY-SIX qualify today
// (the original 14, plus 5 privacy/identity/solvency circuits, plus merkle_range_membership +
// equality_of_commitments (zkwave 2026-06-28), plus 5 circomwave 2026-06-28 primitives
// (merkle_multi_membership, nullifier_uniqueness, threshold_sig_knowledge, pedersen_open_equals,
// sorted_merkle_range) - each node-verified accept + tamper-reject + false-predicate valid==0).
export const VERIFIED_FULL_ZK = new Set([
  'merkle_membership', 'age_verification', 'escrow_2party', 'range_proof', 'vrf_dice_roll',
  'nullifier_set', 'utxo_ownership', 'hash_preimage', 'timelock_absolute', 'relative_timelock',
  'vrf_random', 'turn_timer', 'script_constraint', 'pot_split_math',
  'commitment_open', 'balance_threshold', 'solvency_sum', 'set_non_membership',
  'anon_membership_nullifier',
  // Two new self-contained primitives (zkwave 2026-06-28), node-verified accept + tamper-reject
  // + negative-predicate (out-of-band / different-value -> valid==0) against the served vkey:
  //   merkle_range_membership : Merkle-set membership AND a two-sided value band [lo,hi].
  //   equality_of_commitments : two public Poseidon commitments open to one hidden value.
  'merkle_range_membership', 'equality_of_commitments',
  // Five self-contained primitives (circomwave 2026-06-28), each proven END-TO-END against the
  // SERVED wasm + _final.zkey + vkey: honest proof accepts (valid==1), a tampered public-signal /
  // pi_a is rejected, and a FALSE predicate produces a verifying proof carrying valid==0 (so
  // `valid` is a genuine constrained output, not a stub). pot10 (<=1024 constraints) /pot12 dev
  // ceremony:
  //   merkle_multi_membership : K=3 hidden leaves all under ONE shared depth-4 Merkle root.
  //   nullifier_uniqueness    : a DERIVED nullifier (bound to secret+covenant) is fresh vs a
  //                             committed sorted spent-set (one-claim-per-secret guard).
  //   threshold_sig_knowledge : knowledge of a K-of-N quorum of Shamir shares reconstructing a
  //                             committed group secret, without revealing the shares.
  //   pedersen_open_equals    : a hidden committed value equals a public expected value.
  //   sorted_merkle_range     : order-preserving (sorted) Merkle membership (prev <= value <= next).
  'merkle_multi_membership', 'nullifier_uniqueness', 'threshold_sig_knowledge',
  'pedersen_open_equals', 'sorted_merkle_range',
]);

// Circuits with a WORKING in-browser Groth16 prover (real fullProve over served artifacts).
// age_verification + range_proof + hash_preimage commit via pure-JS MiMC7; vrf_dice_roll +
// nullifier_set + utxo_ownership + vrf_random + script_constraint compute their Poseidon
// commitment via poseidon-lite (byte-identical to circomlib, no wasm); timelock_absolute +
// relative_timelock + turn_timer + pot_split_math are plain-numeric (the wasm derives the
// public valid/on_time/ok output). All fullProve the served wasm+zkey, node-verified accept +
// tamper-reject. Kept identical to VERIFIED_FULL_ZK (same 26 ids). commitment_open / balance_threshold
// / solvency_sum / set_non_membership / anon_membership_nullifier / merkle_range_membership /
// equality_of_commitments / merkle_multi_membership / nullifier_uniqueness /
// threshold_sig_knowledge / pedersen_open_equals / sorted_merkle_range compute their Poseidon
// commitments + Merkle paths via poseidon-lite (byte-identical to circomlib, no wasm) before fullProve.
export const IN_BROWSER_PROVERS = new Set([
  'merkle_membership', 'escrow_2party', 'age_verification', 'range_proof', 'vrf_dice_roll',
  'nullifier_set', 'utxo_ownership', 'hash_preimage', 'timelock_absolute', 'relative_timelock',
  'vrf_random', 'turn_timer', 'script_constraint', 'pot_split_math',
  'commitment_open', 'balance_threshold', 'solvency_sum', 'set_non_membership',
  'anon_membership_nullifier',
  // New primitives (zkwave 2026-06-28): both fullProve the served wasm+zkey and compute their
  // Poseidon commitments / Merkle path via the same poseidon path the other privacy circuits use.
  'merkle_range_membership', 'equality_of_commitments',
  // circomwave 2026-06-28 primitives: each fullProves the served wasm+zkey and computes its
  // Poseidon commitments / Merkle paths via the same poseidon path the other privacy circuits use.
  'merkle_multi_membership', 'nullifier_uniqueness', 'threshold_sig_knowledge',
  'pedersen_open_equals', 'sorted_merkle_range',
]);

// Circuits the BACKEND oracle fail-closed Groth16-verifies (oracle_verifier.rs `StrictGroth16`):
// a real proof is REQUIRED and a bodyless request is rejected, never rubber-stamped. ONLY these
// honestly back the 'hybrid' label. Kept in sync with build_registry() in
// backend/src/oracle_verifier.rs (accounting for HashMap last-insert-wins re-pins). These 31
// ids are the COMPLETE final-state StrictGroth16 registry (the original 19 + catalog aliases like
// merkle_dao / merkle_airdrop / range_collateral / timelock_abs / basic_utxo_ownership, plus 5
// privacy/identity/solvency circuits, plus 5 circomwave 2026-06-28 primitives, all node-verified
// before registration).
export const STRICT_GROTH16 = new Set([
  'merkle_membership', 'merkle_dao', 'merkle_airdrop', 'range_proof', 'range_collateral',
  'timelock_absolute', 'timelock_abs', 'hash_preimage', 'age_verification', 'escrow_2party',
  'utxo_ownership', 'basic_utxo_ownership', 'relative_timelock', 'vrf_dice_roll', 'vrf_random',
  'script_constraint', 'pot_split_math', 'turn_timer', 'nullifier_set',
  'commitment_open', 'balance_threshold', 'solvency_sum', 'set_non_membership',
  'anon_membership_nullifier',
  // New StrictGroth16 circuits (zkwave 2026-06-28), node-verified before registration: real proof
  // verifies, tampered proof + valid==0 negative-predicate rejected. Kept in sync with
  // build_registry() in backend/src/oracle_verifier.rs.
  'merkle_range_membership', 'equality_of_commitments',
  // circomwave 2026-06-28 StrictGroth16 circuits, node-verified before registration: real proof
  // verifies, tampered proof rejected, false-predicate proof verifies with valid==0. Kept in sync
  // with build_registry() in backend/src/oracle_verifier.rs (merkle_multi_membership was promoted
  // out of the attested crypto-primitive stubs).
  'merkle_multi_membership', 'nullifier_uniqueness', 'threshold_sig_knowledge',
  'pedersen_open_equals', 'sorted_merkle_range',
]);

// Convenience: a circuit id has a genuine in-browser Groth16 prove path the public panel can run,
// whose proof is verified OFF-CHAIN (by you, the counterparty, or any external verifier, fail-closed).
// NOT an on-chain-ZK claim: a valid proof gates a 2-of-2 cosign + CSV timeout (Kaspa has no on-chain
// pairing verifier; the only on-chain check is a Schnorr co-signature). Name kept for code stability.
export function isVerifiedFullZk(circuitId) {
  return !!circuitId && VERIFIED_FULL_ZK.has(circuitId) && IN_BROWSER_PROVERS.has(circuitId);
}

// HONESTY ABSOLUTE: there is NO "chain-enforced ZK" tier and no such set in this codebase.
// No deployed circuit's ZK proof is enforced end-to-end on-chain. A chain-enforcement claim
// would require the redeem script's blake2b256 hashlock to correspond to the circuit's public
// output, but the circuits use MiMC7/range/timelock math (Kaspa's hashlock is blake2b256, and
// escrow_2party has no hash at all), and covenant_builder.rs contains no circuit-output ->
// hashlock binding. Every VERIFIED_FULL_ZK circuit is Groth16-verified OFF-CHAIN (by you, the
// counterparty, or any external verifier, fail-closed); a valid proof gates a 2-of-2 cosign +
// CSV timeout, and the only on-chain check is a BIP340 Schnorr co-signature. Do NOT reintroduce a
// chain-enforced set until covenant_builder.rs actually binds a circuit's public output to a
// consensus-checked hashlock and a tampered proof is provably rejected on-chain. Until then the
// honest ZK tier is full-zk (verified off-chain).
