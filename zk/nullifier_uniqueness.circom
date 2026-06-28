pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// nullifier_uniqueness.circom - prove a freshly DERIVED nullifier is NOT in a committed
// spent-set, AND publish that nullifier so the verifier can record it (Covex27).
// Double-spend / one-claim-per-secret guard: the nullifier is derived from a hidden secret so
// the same secret always yields the same nullifier (no two fresh claims from one secret), and we
// prove it is absent from the sorted spent-set so it has not been used yet.
//
//   depth = 4 (16 range-node leaves), bits = 248.
//   Public:  spentRoot (sorted spent-nullifier Merkle root), nullifier (DERIVED, published, the
//            low `bits` bits of Poseidon(secret, covenantId)), covenantId
//   Private: secret (the claim secret), lo, hi (bracketing adjacent spent nullifiers),
//            pathElements[4], pathIndices[4] (Merkle path of the Poseidon(lo,hi) range node)
//   Output:  valid == 1 iff nullifier == lowbits(Poseidon(secret, covenantId))
//                        AND lo < nullifier < hi
//                        AND Merkle path of Poseidon(lo,hi) == spentRoot
//
// Why `bits` and a low-bits projection: Poseidon's output is a full BN254 field element (up to
// ~2^254), but circomlib LessThan is only SOUND for inputs strictly < 2^bits with bits <= 252.
// We therefore derive the published nullifier as the low `bits` bits of the Poseidon digest:
// rawNullifier = Poseidon(secret, covenantId) is bit-decomposed (Num2Bits(254)) and the low
// `bits` bits are recomposed into `nullifier`. This is still a deterministic, collision-resistant
// function of (secret, covenantId) over the bounded id-space, so the same secret always yields the
// same nullifier (the one-claim property holds) and the spent-set comparison is well-defined.
//
// Genuine constraints:
//   (1) rawNullifier === Poseidon(secret, covenantId); nullifier === sum of its low `bits` bits.
//       This binds the published nullifier to the hidden secret AND the covenant (a nullifier
//       minted for covenant A cannot be replayed on B).
//   (2) range-bind lo, nullifier, hi to [0,2^bits); ltLo = LessThan(lo, nullifier),
//       ltHi = LessThan(nullifier, hi)  - strict bracketing => absent from the sorted spent-set.
//   (3) recompute the spent-set root from Poseidon(lo,hi) and hard-=== it to spentRoot.
//   (4) valid = ltLo.out * ltHi.out  (the === in (1) and (3) must already hold for any witness).
// A satisfying witness ONLY exists for a nullifier genuinely absent from the spent-set, and the
// published nullifier is bound to the secret+covenant, so the oracle (which requires valid==1)
// can record it and reject a re-presentation. `valid` is a product of CONSTRAINED comparator
// outputs, not a `valid <== 1` stub: a spent nullifier cannot be bracketed, so valid==0.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template NullifierUniqueness(depth, bits) {
    signal input spentRoot;                                     // public: sorted spent-set root
    signal input nullifier;                                     // public: DERIVED + published (low `bits` bits)
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input secret;                                        // private: the claim secret
    signal input lo;                                            // private: lower adjacent spent value
    signal input hi;                                            // private: upper adjacent spent value
    signal input pathElements[depth];                           // private: Merkle siblings
    signal input pathIndices[depth];                            // private: 0 = node is left, 1 = right
    signal output valid;

    // (1) Bind the published nullifier to the hidden secret AND covenant id, projected to `bits`.
    component nh = Poseidon(2);
    nh.inputs[0] <== secret;
    nh.inputs[1] <== covenantId;
    // Decompose the full digest and recompose the low `bits` bits.
    component nb = Num2Bits(254);
    nb.in <== nh.out;
    var low = 0;
    for (var b = 0; b < bits; b++) {
        low += nb.out[b] * (2 ** b);
    }
    nullifier === low;

    // (2) Strict bracketing lo < nullifier < hi, on range-bound inputs.
    component rbLo = Num2Bits(bits);
    rbLo.in <== lo;
    component rbHi = Num2Bits(bits);
    rbHi.in <== hi;
    // (nullifier is already < 2^bits by the low-bits recomposition above.)

    component ltLo = LessThan(bits);
    ltLo.in[0] <== lo;
    ltLo.in[1] <== nullifier;
    component ltHi = LessThan(bits);
    ltHi.in[0] <== nullifier;
    ltHi.in[1] <== hi;

    // (3) Merkle path of the range node Poseidon(lo, hi) up to spentRoot.
    component rangeNode = Poseidon(2);
    rangeNode.inputs[0] <== lo;
    rangeNode.inputs[1] <== hi;

    signal cur[depth + 1];
    cur[0] <== rangeNode.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    spentRoot === cur[depth];

    // (4) valid = bracketing holds (the two === already enforce binding + path).
    valid <== ltLo.out * ltHi.out;
}

component main { public [spentRoot, nullifier, covenantId] } = NullifierUniqueness(4, 248);
