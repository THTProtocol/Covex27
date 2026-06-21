// ZK Studio provers: editable-input, FULLY TRUSTLESS in-browser Groth16 prove + verify.
//
// HONESTY ABSOLUTE: every entry here runs a REAL snarkjs.groth16.fullProve over the SAME served
// wasm + zkey artifacts the rest of Covex uses, then verifies the proof with snarkjs.groth16.verify
// against the SAME served verification key - entirely in the browser, with NO server and NO oracle.
// The private witness (birth year, balance, preimage, secret, blinding, amounts...) is computed and
// kept in the browser; only { proof, publicSignals } are produced. Nothing fake is ever emitted: on
// any environment/input failure the prover throws and the caller surfaces the real error.
//
// This module is SEPARATE from lib/zk/provers.js (the oracle-claim path) on purpose: provers.js binds
// every proof to a covenant id (H4) and submits to the oracle; the Studio is the standalone "prove it
// yourself, verify it yourself" engine and deliberately does NOT bind to a covenant or touch a server.
// The commitment math (MiMC7 / Poseidon) is byte-identical to provers.js so a Studio proof would also
// verify at the oracle if a covenant id were supplied.

import { mimc7Commitment } from '../mimc7';
import { loadSnarkjs, covenantFieldElement } from './provers';
import { vkeyPathFor, artifactId } from './circuits';

// The recompiled Covex circuits expose `covenantId` as their last public input (the H4 covenant
// binding). The Studio is standalone (not bound to a deployed covenant), so it binds every proof to
// covenantFieldElement('') - a fixed, valid BN254 field element - which is exactly what the served
// wasm expects in that slot. The public signals therefore include this binding; a Studio proof would
// also verify at the oracle if the same binding were supplied. This is required for the witness to be
// complete: omitting it makes fullProve fail with "Not all inputs have been set".
const STUDIO_COVENANT_ID = '';

// ── small helpers ────────────────────────────────────────────────────────────
const randomFieldBigInt = (nBytes) =>
  BigInt('0x' + Array.from(crypto.getRandomValues(new Uint8Array(nBytes)))
    .map((b) => b.toString(16).padStart(2, '0')).join(''));

// Parse a non-negative integer field input into a BigInt, throwing a friendly error on bad input.
function bigUint(label, v) {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) throw new Error(`${label} must be a whole number (got "${s}").`);
  return BigInt(s);
}

const wasmPath = (id) => `/zk/${artifactId(id)}/${artifactId(id)}.wasm`;
const zkeyPath = (id) => `/zk/${artifactId(id)}/${artifactId(id)}_final.zkey`;

// ── input schemas (the editable form fields per flagship circuit) ─────────────
// Each field: { key, label, type ('int'), default, hint }. Circuits with no `fields`
// run their fixed worked example (the witness is randomised in-browser each run).
//
// `prepare(values)` turns the form values into the exact circom witness object the served wasm
// expects, computing any commitment / Poseidon hash client-side so secrets stay private. It returns
// { input, publicNote } where publicNote is an honest plain-English line about what was just proven.

export const STUDIO_CIRCUITS = {
  age_verification: {
    label: 'Age Verification',
    category: 'identity',
    statement: 'I am at least N years old, without revealing my birth year.',
    fields: [
      { key: 'birth_year', label: 'Your birth year (private)', default: '1990', hint: 'Stays in your browser. Only the commitment is public.' },
      { key: 'min_age', label: 'Minimum age to prove', default: '18' },
      { key: 'current_year', label: 'Current year', default: '2026' },
    ],
    prepare(v) {
      const birthYear = bigUint('Birth year', v.birth_year);
      const minAge = bigUint('Minimum age', v.min_age);
      const currentYear = bigUint('Current year', v.current_year);
      if (currentYear - birthYear < minAge) {
        throw new Error(`This statement is false: ${currentYear} - ${birthYear} = ${currentYear - birthYear} is below the ${minAge} minimum. The circuit will not prove a false claim.`);
      }
      const commitment = mimc7Commitment(Number(birthYear));
      return {
        input: {
          commitment,
          current_year: currentYear.toString(),
          min_age: minAge.toString(),
          birth_year: birthYear.toString(),
        },
        publicNote: `Proved age >= ${minAge} as of ${currentYear}. The birth year ${birthYear} never left your browser.`,
      };
    },
  },

  balance_threshold: {
    label: 'Balance Threshold',
    category: 'defi',
    statement: 'My balance is at least the minimum, without revealing the balance.',
    fields: [
      { key: 'balance', label: 'Your balance (private)', default: '50000', hint: 'Stays in your browser. Only a Poseidon commitment is public.' },
      { key: 'min_balance', label: 'Minimum balance to prove', default: '10000' },
    ],
    async prepare(v) {
      const { poseidon2 } = await import('poseidon-lite');
      const balance = bigUint('Balance', v.balance);
      const minBalance = bigUint('Minimum balance', v.min_balance);
      if (balance < minBalance) {
        throw new Error(`This statement is false: balance ${balance} is below the minimum ${minBalance}. The circuit will not prove a false claim.`);
      }
      const salt = randomFieldBigInt(16);
      const commitment = poseidon2([balance, salt]).toString();
      return {
        input: { commitment, min_balance: minBalance.toString(), balance: balance.toString(), salt: salt.toString() },
        publicNote: `Proved balance >= ${minBalance}. The actual balance ${balance} never left your browser.`,
      };
    },
  },

  range_proof: {
    label: 'Range Proof',
    category: 'defi',
    statement: 'A committed value is within [min, max], without revealing it.',
    fields: [
      { key: 'value', label: 'Secret value (private)', default: '42', hint: 'Stays in your browser. Only the MiMC7 commitment is public.' },
      { key: 'min', label: 'Range minimum', default: '0' },
      { key: 'max', label: 'Range maximum', default: '100' },
    ],
    prepare(v) {
      const value = bigUint('Value', v.value);
      const minV = bigUint('Minimum', v.min);
      const maxV = bigUint('Maximum', v.max);
      if (value < minV || value > maxV) {
        throw new Error(`This statement is false: ${value} is not within [${minV}, ${maxV}]. The circuit will not prove a false claim.`);
      }
      const commitment = mimc7Commitment(Number(value)).toString();
      return {
        input: { commitment, min: minV.toString(), max: maxV.toString(), value: value.toString() },
        publicNote: `Proved a committed value is within [${minV}, ${maxV}]. The value ${value} never left your browser.`,
      };
    },
  },

  solvency_sum: {
    label: 'Proof of Reserves',
    category: 'defi',
    statement: 'The sum of four hidden reserve buckets meets a threshold.',
    fields: [
      { key: 'a0', label: 'Reserve bucket 1 (private)', default: '25000' },
      { key: 'a1', label: 'Reserve bucket 2 (private)', default: '30000' },
      { key: 'a2', label: 'Reserve bucket 3 (private)', default: '10000' },
      { key: 'a3', label: 'Reserve bucket 4 (private)', default: '5000' },
      { key: 'threshold', label: 'Threshold to prove', default: '60000' },
    ],
    async prepare(v) {
      const { poseidon2 } = await import('poseidon-lite');
      const amounts = [bigUint('Bucket 1', v.a0), bigUint('Bucket 2', v.a1), bigUint('Bucket 3', v.a2), bigUint('Bucket 4', v.a3)];
      const threshold = bigUint('Threshold', v.threshold);
      const sum = amounts.reduce((acc, x) => acc + x, 0n);
      if (sum < threshold) {
        throw new Error(`This statement is false: the buckets sum to ${sum}, below the ${threshold} threshold. The circuit will not prove a false claim.`);
      }
      const salts = amounts.map(() => randomFieldBigInt(8));
      const commitments = amounts.map((a, i) => poseidon2([a, salts[i]]).toString());
      return {
        input: {
          commitments, threshold: threshold.toString(),
          amounts: amounts.map((a) => a.toString()), salts: salts.map((s) => s.toString()),
        },
        publicNote: `Proved four hidden reserves sum to >= ${threshold} (actual sum ${sum}). No individual amount left your browser.`,
      };
    },
  },

  commitment_open: {
    label: 'Commitment Opening',
    category: 'privacy',
    statement: 'I know the (value, blinding) opening of a public Poseidon commitment.',
    fields: [
      { key: 'value', label: 'Committed value (private)', default: '12345' },
      { key: 'blinding', label: 'Blinding factor (private, blank = random)', default: '', hint: 'Leave blank for a fresh random blinding.' },
    ],
    async prepare(v) {
      const { poseidon2 } = await import('poseidon-lite');
      const value = bigUint('Value', v.value);
      const blinding = String(v.blinding ?? '').trim() === '' ? randomFieldBigInt(16) : bigUint('Blinding', v.blinding);
      const commitment = poseidon2([value, blinding]).toString();
      return {
        input: { commitment, value: value.toString(), blinding: blinding.toString() },
        publicNote: 'Proved knowledge of the opening of a public Poseidon commitment. Neither the value nor the blinding left your browser.',
      };
    },
  },

  hash_preimage: {
    label: 'Hash Preimage',
    category: 'privacy',
    statement: 'I know the MiMC7 preimage of a public commitment, without revealing it.',
    fields: [
      { key: 'preimage', label: 'Secret preimage (private, blank = random)', default: '', hint: 'Leave blank for a fresh random preimage.' },
    ],
    prepare(v) {
      const preimage = String(v.preimage ?? '').trim() === '' ? randomFieldBigInt(15) : bigUint('Preimage', v.preimage);
      const commitment_hash = mimc7Commitment(preimage).toString();
      return {
        input: { commitment_hash, preimage: preimage.toString() },
        publicNote: 'Proved knowledge of a MiMC7 preimage. The preimage never left your browser. Honest bound: MiMC7, not SHA256.',
      };
    },
  },

  timelock_absolute: {
    label: 'Absolute Timelock',
    category: 'kaspa',
    statement: 'The current DAA score is past an absolute lock threshold.',
    fields: [
      { key: 'current_daa', label: 'Current DAA score', default: '5000000' },
      { key: 'lock_threshold', label: 'Lock threshold (DAA)', default: '1000000' },
    ],
    prepare(v) {
      const current = bigUint('Current DAA', v.current_daa);
      const threshold = bigUint('Lock threshold', v.lock_threshold);
      if (current < threshold) {
        throw new Error(`This statement is false: current DAA ${current} has not reached the threshold ${threshold}. valid would be 0; the oracle requires valid == 1.`);
      }
      return {
        input: { current_daa: current.toString(), lock_threshold: threshold.toString() },
        publicNote: `Proved current DAA ${current} is past the absolute lock ${threshold}. valid is a public output == 1.`,
      };
    },
  },

  relative_timelock: {
    label: 'Relative Timelock',
    category: 'kaspa',
    statement: 'Enough DAA has elapsed since a reference point.',
    fields: [
      { key: 'current_daa', label: 'Current DAA score', default: '2000' },
      { key: 'reference_daa', label: 'Reference DAA score', default: '1000' },
      { key: 'lock_duration', label: 'Lock duration (DAA)', default: '500' },
    ],
    prepare(v) {
      const current = bigUint('Current DAA', v.current_daa);
      const reference = bigUint('Reference DAA', v.reference_daa);
      const duration = bigUint('Lock duration', v.lock_duration);
      if (current < reference + duration) {
        throw new Error(`This statement is false: ${current} < ${reference} + ${duration}. valid would be 0; the oracle requires valid == 1.`);
      }
      return {
        input: { current_daa: current.toString(), reference_daa: reference.toString(), lock_duration: duration.toString() },
        publicNote: `Proved at least ${duration} DAA elapsed since ${reference}. valid is a public output == 1.`,
      };
    },
  },

  vrf_dice_roll: {
    label: 'VRF Dice Roll',
    category: 'randomness',
    statement: 'A dice roll is forced by a hidden secret + public seed (no cherry-picking).',
    fields: [
      { key: 'seed', label: 'Public seed', default: '999' },
      { key: 'faces', label: 'Number of faces', default: '6' },
    ],
    async prepare(v) {
      const { poseidon2 } = await import('poseidon-lite');
      const seed = bigUint('Seed', v.seed);
      const faces = bigUint('Faces', v.faces);
      if (faces < 2n) throw new Error('Faces must be at least 2.');
      const secret = randomFieldBigInt(16);
      const h = poseidon2([secret, seed]);
      const roll = (h % faces) + 1n;
      const q = (h - (roll - 1n)) / faces;
      return {
        input: { secret: secret.toString(), seed: seed.toString(), roll: roll.toString(), q: q.toString() },
        publicNote: `The roll is forced to ${roll} by Poseidon(secret, ${seed}). The secret was generated and kept in your browser, so no one cherry-picked the result.`,
      };
    },
  },

  merkle_membership: {
    label: 'Merkle Membership',
    category: 'identity',
    statement: 'A secret leaf is a member of a committed set, without revealing the leaf.',
    // Fixed worked example: the circuit ships a fixed committed root for its demo tree.
    fields: [],
    prepare() {
      const rootHash = '20473339414381364284988912838485478706292217748325897174032535818078518775705';
      const secretLeaf = '42';
      return {
        input: { rootHash, secretLeaf },
        publicNote: 'Proved a secret leaf is in the committed set. The leaf never left your browser.',
      };
    },
  },
};

// The curated flagship order shown in the Studio's prover panel.
export const STUDIO_FLAGSHIP_ORDER = [
  'age_verification', 'balance_threshold', 'range_proof', 'solvency_sum',
  'commitment_open', 'merkle_membership', 'hash_preimage',
  'timelock_absolute', 'relative_timelock', 'vrf_dice_roll',
];

export function studioFieldDefaults(circuitId) {
  const c = STUDIO_CIRCUITS[circuitId];
  if (!c) return {};
  const out = {};
  for (const f of (c.fields || [])) out[f.key] = f.default ?? '';
  return out;
}

// Run the FULLY trustless prove + verify cycle for a flagship circuit, entirely in the browser:
//   1. snarkjs.groth16.fullProve(witness, served wasm, served zkey)   -> { proof, publicSignals }
//   2. fetch the served verification key JSON
//   3. snarkjs.groth16.verify(vkey, publicSignals, proof)             -> boolean
// Returns { proof, publicSignals, verified, publicNote, vkeyPath, timings }. Throws on a real failure;
// never fabricates a proof or a verify result.
export async function studioProveAndVerify(circuitId, values) {
  const circuit = STUDIO_CIRCUITS[circuitId];
  if (!circuit) throw new Error(`No Studio prover for circuit "${circuitId}".`);

  const snarkjs = await loadSnarkjs();
  const prepared = await circuit.prepare(values || {});
  const { input, publicNote } = prepared;

  // Bind to the Studio's fixed covenant field element (the recompiled wasm requires `covenantId`
  // as its last public input). Without it fullProve fails with "Not all inputs have been set".
  const witness = { ...input, covenantId: await covenantFieldElement(STUDIO_COVENANT_ID) };

  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, wasmPath(circuitId), zkeyPath(circuitId));
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const vkeyPath = vkeyPathFor(circuitId);
  const vkeyRes = await fetch(vkeyPath);
  if (!vkeyRes.ok) throw new Error(`Could not load the verification key (${vkeyPath}): HTTP ${vkeyRes.status}.`);
  const vkey = await vkeyRes.json();

  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const t2 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  return {
    proof,
    publicSignals,
    verified,
    publicNote,
    vkeyPath,
    timings: { proveMs: Math.round(t1 - t0), verifyMs: Math.round(t2 - t1) },
  };
}
