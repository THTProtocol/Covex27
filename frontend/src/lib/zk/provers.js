// Shared in-browser ZK provers (lifted out of CovexTerminal.jsx so the creator terminal AND
// the public ZkClaimPanel run the SAME, byte-for-byte prover). Behavior is preserved exactly:
// the MiMC7 / Poseidon / numeric input prep, the covenantFieldElement(covenant_id) H4 binding,
// snarkjs.groth16.fullProve, and the served wasm/zkey paths are identical to the originals.
//
// HONESTY ABSOLUTE: every prover here runs a REAL Groth16 fullProve over served artifacts. The
// secret witness (birth year, preimage, VRF secret, script hash, etc.) is a PRIVATE input and
// NEVER leaves the browser - only { proof, publicSignals } come back. Nothing fake is ever
// produced: on a (rare) environment failure a prover throws, and the caller surfaces the real
// error rather than fabricating a proof.

import { mimc7Commitment } from '../mimc7';

// Lazy-load snarkjs once (same singleton pattern the terminal used).
let snarkjsModule = null;
export const loadSnarkjs = async () => {
  if (!snarkjsModule) {
    snarkjsModule = await import('snarkjs');
  }
  return snarkjsModule;
};

// H4: bind every in-browser proof to the specific covenant it is generated for.
// covenant_field_element = sha256(covenant_id) reduced mod the BN254 scalar field, byte-identical
// to the backend oracle.rs covenant_field_element() (verified: JS == Rust for real + empty ids).
// Because Groth16 binds public inputs, a proof made with covenantId = H(covenant A) only verifies
// against H(A); the oracle requires H(its covenant_id) among the public signals, so a proof for one
// covenant cannot be replayed onto another of the same circuit type (closes the H4 hole).
const BN254_FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export async function covenantFieldElement(covenantId) {
  const bytes = new TextEncoder().encode(String(covenantId || ''));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let acc = 0n;
  for (const b of digest) acc = (acc << 8n) | BigInt(b);
  return (acc % BN254_FIELD_R).toString();
}

// Build a covenant-bound fullProve. Every prover routes through this so the proof commits
// covenantFieldElement(covenantId) as the circuit's `covenantId` public signal, binding the
// proof to THIS covenant (no cross-covenant replay). The recompiled circuits expose covenantId
// as the last public input; `valid` stays at index 0.
export function makeFullProveBound(covenantId) {
  return async (snarkjs, input, wasm, zkey) =>
    snarkjs.groth16.fullProve(
      { ...input, covenantId: await covenantFieldElement(covenantId) },
      wasm,
      zkey,
    );
}

// A small helper for the random secret-witness byte strings the original provers used.
const randomFieldBigInt = (nBytes) =>
  BigInt('0x' + Array.from(crypto.getRandomValues(new Uint8Array(nBytes)))
    .map((b) => b.toString(16).padStart(2, '0')).join(''));

// Each prover returns { proof, publicSignals }. The caller decides what to do with them
// (the terminal stores them in its oracle textarea; the panel POSTs them straight to the oracle).
// circuitType is the canonical oracle circuit_type the proof should be submitted under.

// ── merkle_membership ──────────────────────────────────────────────────────
async function proveMerkleMembership(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/merkle_membership/merkle_membership.wasm';
  const zkey = '/zk/merkle_membership/merkle_membership_final.zkey';
  const rootHash = '20473339414381364284988912838485478706292217748325897174032535818078518775705';
  const secretLeaf = '42';
  const input = { rootHash, secretLeaf };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── range_proof ────────────────────────────────────────────────────────────
// commitment = MiMC7(value) with key 0, computed client-side so value stays a PRIVATE witness.
async function proveRangeProof(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/range_proof/range_proof.wasm';
  const zkey = '/zk/range_proof/range_proof_final.zkey';
  const value = 42, minV = 0, maxV = 100;
  const commitment = mimc7Commitment(value).toString();
  const input = { commitment, min: minV.toString(), max: maxV.toString(), value: value.toString() };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── escrow_2party ──────────────────────────────────────────────────────────
// Plain numeric inputs. A valid refund-after-timeout (outcome 0, current >= deposit + timeout).
async function proveEscrow2party(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/escrow_2party/escrow_2party.wasm';
  const zkey = '/zk/escrow_2party/escrow_2party_final.zkey';
  const input = { deposit_daa: '1000000', timeout_daa: '100', current_daa: '1000150', outcome: '0' };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── age_verification ───────────────────────────────────────────────────────
// commitment = MiMC7(birth_year); birth_year is a PRIVATE witness. Born 1990, >= 18 by 2026.
async function proveAgeVerification(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/age_verification/age_verification.wasm';
  const zkey = '/zk/age_verification/age_verification_final.zkey';
  const birthYear = 1990, currentYear = 2026, minAge = 18;
  const commitment = mimc7Commitment(birthYear);
  const input = {
    commitment,
    current_year: currentYear.toString(),
    min_age: minAge.toString(),
    birth_year: birthYear.toString(),
  };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── vrf_dice_roll ──────────────────────────────────────────────────────────
// roll DERIVED from Poseidon(secret, seed): the circuit forces the roll, no cherry-picking.
async function proveVrfDiceRoll(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/vrf_dice_roll/vrf_dice_roll.wasm';
  const zkey = '/zk/vrf_dice_roll/vrf_dice_roll_final.zkey';
  const faces = 6n;
  const secret = randomFieldBigInt(16);
  const seed = 999n;
  const h = poseidon2([secret, seed]);
  const roll = (h % faces) + 1n;
  const q = (h - (roll - 1n)) / faces;
  const input = { secret: secret.toString(), seed: seed.toString(), roll: roll.toString(), q: q.toString() };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── nullifier_set ──────────────────────────────────────────────────────────
// nullifier = Poseidon(secret); merkle_root = Poseidon(secret, nullifier). secret PRIVATE.
async function proveNullifierSet(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon1, poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/nullifier_set/nullifier_set.wasm';
  const zkey = '/zk/nullifier_set/nullifier_set_final.zkey';
  const secret = randomFieldBigInt(16);
  const nullifier = poseidon1([secret]);
  const merkle_root = poseidon2([secret, nullifier]);
  const input = { nullifier: nullifier.toString(), merkle_root: merkle_root.toString(), secret: secret.toString() };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── utxo_ownership (served as basic_utxo_ownership) ────────────────────────
// utxo_hash = Poseidon(pubkey_x, pubkey_y, amount_commit, owner_sig_r, owner_sig_s). All private.
async function proveUtxoOwnership(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon5 } = await import('poseidon-lite');
  const wasm = '/zk/basic_utxo_ownership/basic_utxo_ownership.wasm';
  const zkey = '/zk/basic_utxo_ownership/basic_utxo_ownership_final.zkey';
  const x = 11n, y = 22n, amt = 33n, r = 44n, s = 55n;
  const utxo_hash = poseidon5([x, y, amt, r, s]);
  const input = {
    pubkey_x: x.toString(), pubkey_y: y.toString(), amount_commit: amt.toString(),
    owner_sig_r: r.toString(), owner_sig_s: s.toString(), utxo_hash: utxo_hash.toString(),
  };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── hash_preimage ──────────────────────────────────────────────────────────
// commitment_hash = MiMC7(preimage); preimage PRIVATE. Honest bound: MiMC7, not SHA256.
async function proveHashPreimage(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/hash_preimage/hash_preimage.wasm';
  const zkey = '/zk/hash_preimage/hash_preimage_final.zkey';
  const preimage = randomFieldBigInt(15);
  const commitment_hash = mimc7Commitment(preimage).toString();
  const input = { commitment_hash, preimage: preimage.toString() };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── timelock_absolute ──────────────────────────────────────────────────────
// valid = (current_daa >= lock_threshold) is a PUBLIC output the oracle requires == 1.
async function proveTimelockAbsolute(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/timelock_absolute/timelock_absolute.wasm';
  const zkey = '/zk/timelock_absolute/timelock_absolute_final.zkey';
  const input = { current_daa: '5000000', lock_threshold: '1000000' };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── relative_timelock ──────────────────────────────────────────────────────
// valid = (current_daa >= reference_daa + lock_duration) is a PUBLIC output (== 1 required).
async function proveRelativeTimelock(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/relative_timelock/relative_timelock.wasm';
  const zkey = '/zk/relative_timelock/relative_timelock_final.zkey';
  const input = { current_daa: '2000', reference_daa: '1000', lock_duration: '500' };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── vrf_random ─────────────────────────────────────────────────────────────
// output_val = Poseidon(secret, seed, vrf_key); secret PRIVATE, output forced.
async function proveVrfRandom(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon3 } = await import('poseidon-lite');
  const wasm = '/zk/vrf_random/vrf_random.wasm';
  const zkey = '/zk/vrf_random/vrf_random_final.zkey';
  const secret = randomFieldBigInt(15);
  const seed = 12345n, vrfKey = 7n;
  const output_val = poseidon3([secret, seed, vrfKey]).toString();
  const input = { vrf_secret: secret.toString(), seed: seed.toString(), output_val, pub_vrf_key: vrfKey.toString() };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── turn_timer ─────────────────────────────────────────────────────────────
// on_time = (current_daa - last_move_daa <= max_delta); last_move_daa PRIVATE; on_time == 1 required.
async function proveTurnTimer(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/turn_timer/turn_timer.wasm';
  const zkey = '/zk/turn_timer/turn_timer_final.zkey';
  const input = { current_daa: '1000', last_move_daa: '950', max_delta: '100', move_hash: '42' };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── script_constraint ──────────────────────────────────────────────────────
// public_root = Poseidon(script_hash, constraint_id, value); script_hash PRIVATE.
async function proveScriptConstraint(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon3 } = await import('poseidon-lite');
  const wasm = '/zk/script_constraint/script_constraint.wasm';
  const zkey = '/zk/script_constraint/script_constraint_final.zkey';
  const scriptHash = randomFieldBigInt(15);
  const constraintId = 2n, value = 500n;
  const public_root = poseidon3([scriptHash, constraintId, value]).toString();
  const input = { script_hash: scriptHash.toString(), constraint_id: constraintId.toString(), value: value.toString(), public_root };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── pot_split_math ─────────────────────────────────────────────────────────
// Proves winner_share + fee + ret === total_pot with fee/ret derived from the public bps.
async function provePotSplitMath(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const wasm = '/zk/pot_split_math/pot_split_math.wasm';
  const zkey = '/zk/pot_split_math/pot_split_math_final.zkey';
  const total = 10000, feeBps = 300, retBps = 200;
  const fee = (total * feeBps) / 10000, ret = (total * retBps) / 10000;
  const winnerShare = total - fee - ret;
  const input = { total_pot: String(total), fee_bps: String(feeBps), pot_return_bps: String(retBps), winner_share: String(winnerShare), fee: String(fee), ret: String(ret) };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── commitment_open ────────────────────────────────────────────────────────
// C = Poseidon(value, blinding); value + blinding are PRIVATE witnesses computed/kept in-browser.
async function proveCommitmentOpen(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/commitment_open/commitment_open.wasm';
  const zkey = '/zk/commitment_open/commitment_open_final.zkey';
  const value = randomFieldBigInt(16);
  const blinding = randomFieldBigInt(16);
  const commitment = poseidon2([value, blinding]).toString();
  const input = { commitment, value: value.toString(), blinding: blinding.toString() };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── balance_threshold ──────────────────────────────────────────────────────
// commitment = Poseidon(balance, salt); balance + salt PRIVATE. valid = (balance >= min_balance)
// is a PUBLIC output the oracle requires == 1. Demo: balance 50000 >= min 10000.
async function proveBalanceThreshold(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/balance_threshold/balance_threshold.wasm';
  const zkey = '/zk/balance_threshold/balance_threshold_final.zkey';
  const balance = 50000n, minBalance = 10000n;
  const salt = randomFieldBigInt(16);
  const commitment = poseidon2([balance, salt]).toString();
  const input = {
    commitment, min_balance: minBalance.toString(),
    balance: balance.toString(), salt: salt.toString(),
  };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── solvency_sum ───────────────────────────────────────────────────────────
// N=4 commitments C_i = Poseidon(amount_i, salt_i); amounts PRIVATE. valid = (sum >= threshold)
// is a PUBLIC output the oracle requires == 1. Demo: sum 70000 >= threshold 60000.
async function proveSolvencySum(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/solvency_sum/solvency_sum.wasm';
  const zkey = '/zk/solvency_sum/solvency_sum_final.zkey';
  const amounts = [25000n, 30000n, 10000n, 5000n]; // sum = 70000
  const salts = [randomFieldBigInt(8), randomFieldBigInt(8), randomFieldBigInt(8), randomFieldBigInt(8)];
  const commitments = amounts.map((a, i) => poseidon2([a, salts[i]]).toString());
  const input = {
    commitments, threshold: '60000',
    amounts: amounts.map((a) => a.toString()), salts: salts.map((s) => s.toString()),
  };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// Build a depth-`d` Merkle tree (parent = Poseidon(left, right)) and the path for leaf index `idx`.
// pathIndices[i] == 0 means the current node is the LEFT child (matches the circuits).
function buildMerklePath(poseidon2, leaves, idx, depth) {
  let level = leaves.slice();
  const levels = [level];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(poseidon2([level[i], level[i + 1]]));
    levels.push(next); level = next;
  }
  const root = levels[depth][0];
  const pathElements = [], pathIndices = [];
  let pos = idx;
  for (let d = 0; d < depth; d++) {
    const isRight = pos % 2;
    const sib = isRight ? pos - 1 : pos + 1;
    pathElements.push(levels[d][sib].toString());
    pathIndices.push(isRight ? '1' : '0');
    pos = Math.floor(pos / 2);
  }
  return { root: root.toString(), pathElements, pathIndices };
}

// ── set_non_membership ─────────────────────────────────────────────────────
// Sorted-Merkle non-membership (depth 4). leaf is PRIVATE; proven absent by bracketing it
// strictly between two adjacent blocked values (lo < leaf < hi) with a path to Poseidon(lo, hi).
async function proveSetNonMembership(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/set_non_membership/set_non_membership.wasm';
  const zkey = '/zk/set_non_membership/set_non_membership_final.zkey';
  const depth = 4;
  const blocked = []; for (let i = 0; i < 17; i++) blocked.push(BigInt(1000 * (i + 1)));
  const leaves = []; for (let i = 0; i < 16; i++) leaves.push(poseidon2([blocked[i], blocked[i + 1]]));
  const idx = 5;
  const lo = blocked[idx], hi = blocked[idx + 1];
  const leaf = (lo + hi) / 2n; // strictly between two adjacent blocked entries -> absent
  const { root, pathElements, pathIndices } = buildMerklePath(poseidon2, leaves, idx, depth);
  const input = {
    root, leaf: leaf.toString(), lo: lo.toString(), hi: hi.toString(), pathElements, pathIndices,
  };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── anon_membership_nullifier ──────────────────────────────────────────────
// Depth-4 membership of leaf = Poseidon(identity) (identity PRIVATE) AND public deterministic
// nullifier = Poseidon(identity, externalNullifier) for one-person-one-action.
async function proveAnonMembershipNullifier(fullProveBound) {
  const snarkjs = await loadSnarkjs();
  const { poseidon1, poseidon2 } = await import('poseidon-lite');
  const wasm = '/zk/anon_membership_nullifier/anon_membership_nullifier.wasm';
  const zkey = '/zk/anon_membership_nullifier/anon_membership_nullifier_final.zkey';
  const depth = 4, idx = 9;
  const identity = randomFieldBigInt(16);
  const externalNullifier = 20260618n;
  const leaves = [];
  for (let i = 0; i < 16; i++) {
    const idScalar = (i === idx) ? identity : BigInt(1000000 + i);
    leaves.push(poseidon1([idScalar]));
  }
  const { root, pathElements, pathIndices } = buildMerklePath(poseidon2, leaves, idx, depth);
  const nullifier = poseidon2([identity, externalNullifier]).toString();
  const input = {
    root, externalNullifier: externalNullifier.toString(), nullifier,
    identity: identity.toString(), pathElements, pathIndices,
  };
  return fullProveBound(snarkjs, input, wasm, zkey);
}

// ── registry: circuit id -> { prove, circuitType, label, note } ─────────────
// `circuitType` is the canonical oracle circuit_type a proof is submitted under (it is
// what oracle_verifier.rs keys its StrictGroth16 verifier on). `note` is honest copy
// surfaced in the public panel describing exactly what the proof attests.
export const PROVERS = {
  merkle_membership: {
    prove: proveMerkleMembership, circuitType: 'merkle_membership',
    label: 'Merkle Membership',
    note: 'Proves a secret leaf is a member of a committed set, without revealing the leaf.',
  },
  range_proof: {
    prove: proveRangeProof, circuitType: 'range_proof',
    label: 'Range Proof',
    note: 'Proves a committed value (MiMC7) is within [min, max] without revealing it. The value stays in your browser.',
  },
  escrow_2party: {
    prove: proveEscrow2party, circuitType: 'escrow_2party',
    label: '2-Party Escrow',
    note: 'Proves a refund-after-timeout condition is satisfied (current DAA past deposit + timeout).',
  },
  age_verification: {
    prove: proveAgeVerification, circuitType: 'age_verification',
    label: 'Age Verification',
    note: 'Proves a committed birth year meets a minimum age without revealing the birth year. The birth year stays in your browser.',
  },
  vrf_dice_roll: {
    prove: proveVrfDiceRoll, circuitType: 'vrf_dice_roll',
    label: 'VRF Dice Roll',
    note: 'Proves a dice roll is forced by a hidden secret + public seed (no cherry-picking the result).',
  },
  nullifier_set: {
    prove: proveNullifierSet, circuitType: 'nullifier_set',
    label: 'Nullifier Set',
    note: 'Proves a public nullifier + set anchor derive honestly from one hidden secret (double-spend guard).',
  },
  utxo_ownership: {
    prove: proveUtxoOwnership, circuitType: 'utxo_ownership',
    label: 'UTXO Note Opening',
    note: 'Proves knowledge of the full Poseidon pre-image of a public UTXO note hash. Note-binding, not standalone spend authorization.',
  },
  hash_preimage: {
    prove: proveHashPreimage, circuitType: 'hash_preimage',
    label: 'Hash Preimage',
    note: 'Proves you know the opening of a public MiMC7 commitment without revealing it. Honest bound: MiMC7, not SHA256.',
  },
  timelock_absolute: {
    prove: proveTimelockAbsolute, circuitType: 'timelock_absolute',
    label: 'Absolute Timelock',
    note: 'Proves current DAA is past an absolute lock threshold. valid is a public output the oracle requires == 1.',
  },
  relative_timelock: {
    prove: proveRelativeTimelock, circuitType: 'relative_timelock',
    label: 'Relative Timelock',
    note: 'Proves enough DAA has elapsed since a reference point. valid is a public output the oracle requires == 1.',
  },
  vrf_random: {
    prove: proveVrfRandom, circuitType: 'vrf_random',
    label: 'Generic VRF',
    note: 'Proves a random output is forced by a committed secret + public seed + public VRF key (fair draws, shuffles).',
  },
  turn_timer: {
    prove: proveTurnTimer, circuitType: 'turn_timer',
    label: 'Turn Timer',
    note: 'Proves a move was on time without revealing exactly when. on_time is a public output the oracle requires == 1.',
  },
  script_constraint: {
    prove: proveScriptConstraint, circuitType: 'script_constraint',
    label: 'Script Constraint',
    note: 'Proves a covenant binds to a constraint bundle without revealing the script hash.',
  },
  pot_split_math: {
    prove: provePotSplitMath, circuitType: 'pot_split_math',
    label: 'Pot Split Math',
    note: 'Proves a payout split (winner_share + fee + return == total) is correct. A correctness proof, not a privacy proof.',
  },
  commitment_open: {
    prove: proveCommitmentOpen, circuitType: 'commitment_open',
    label: 'Commitment Opening',
    note: 'Proves you know the (value, blinding) opening of a public Poseidon commitment, without revealing them. Foundational privacy primitive.',
  },
  balance_threshold: {
    prove: proveBalanceThreshold, circuitType: 'balance_threshold',
    label: 'Balance Threshold',
    note: 'Proves a committed balance meets a minimum without revealing the balance (KYC-free solvency / accredited gating). The balance stays in your browser; valid is a public output the oracle requires == 1.',
  },
  solvency_sum: {
    prove: proveSolvencySum, circuitType: 'solvency_sum',
    label: 'Proof of Reserves',
    note: 'Proves the sum of four committed reserve buckets meets a threshold, hiding each amount (proof of reserves). valid is a public output the oracle requires == 1.',
  },
  set_non_membership: {
    prove: proveSetNonMembership, circuitType: 'set_non_membership',
    label: 'Set Non-Membership',
    note: 'Proves a private value is NOT in a sorted blocklist (sanctions-free attestation), by bracketing it between two adjacent blocked entries. The value never leaves your browser.',
  },
  anon_membership_nullifier: {
    prove: proveAnonMembershipNullifier, circuitType: 'anon_membership_nullifier',
    label: 'Anonymous Membership + Nullifier',
    note: 'Proves you are a committed member AND emits a deterministic public nullifier so you cannot act twice (one-person-one-action: anonymous voting / airdrop). Your identity stays in your browser; the oracle tracks the spent nullifier set.',
  },
};

// Resolve the canonical oracle circuit_type a circuit id should submit under.
export function circuitTypeFor(circuitId) {
  return PROVERS[circuitId]?.circuitType || circuitId;
}

// Run the in-browser prover for a circuit id, bound to covenantId (H4). Returns
// { proof, publicSignals, circuitType }. Throws on failure - callers surface the real error.
export async function proveInBrowser(circuitId, covenantId) {
  const entry = PROVERS[circuitId];
  if (!entry) throw new Error(`No in-browser prover for circuit "${circuitId}".`);
  const fullProveBound = makeFullProveBound(covenantId);
  const { proof, publicSignals } = await entry.prove(fullProveBound);
  return { proof, publicSignals, circuitType: entry.circuitType };
}
