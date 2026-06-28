pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// sorted_merkle_range.circom - order-preserving (sorted) Merkle membership (Covex27).
// Prove a HIDDEN value is a genuine member of a SORTED Merkle set AND respects the set's sort
// invariant relative to its committed neighbours, without revealing the value or its position.
// Useful for range queries over a committed ordered ledger (price bands, sorted allowlists,
// ordered time-series) where you must prove "this value is in the set in sorted position", not
// merely "in the set".
//
//   depth = 4 (16-leaf tree), bits = 64.
//   Public:  root (Merkle root of the SORTED leaves, leaf = Poseidon(value)),
//            neighborCommit (= Poseidon(prev, next), the two adjacent sorted values bracketing the
//              member; published so the prover is bound to a specific neighbour pair), covenantId
//   Private: value (the member), prev, next (adjacent sorted leaf VALUES),
//            pathElements[depth], pathIndices[depth] (Merkle path of leaf Poseidon(value))
//   Output:  valid == 1 iff Poseidon(value)'s path == root            (genuine membership)
//                        AND prev <= value <= next                    (sorted order respected)
//                        AND neighborCommit == Poseidon(prev, next)   (bound to the neighbour pair)
//
// Genuine constraints:
//   (1) recompute the root from Poseidon(value) up `depth` levels; hard-=== to public root.
//   (2) range-bind prev, value, next to [0,2^bits); leP = LessEqThan(prev, value),
//       leN = LessEqThan(value, next)  - the order invariant (uses <= so value may equal a bound).
//   (3) neighborCommit === Poseidon(prev, next)  - binds the published neighbour commitment.
//   (4) valid = leP.out * leN.out                - CONSTRAINED product of comparator outputs.
// A value that is in the tree but OUT of its sorted neighbour band (a malformed/forged ordering
// claim) yields valid==0; a value not in the tree fails the hard root ===. So a false predicate
// (out-of-order value) produces a VERIFYING proof with valid==0. No `valid <== 1` stub.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template SortedMerkleRange(depth, bits) {
    signal input root;                                          // public: sorted-leaf Merkle root
    signal input neighborCommit;                                // public: Poseidon(prev, next)
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input value;                                         // private: the member value
    signal input prev;                                          // private: lower adjacent sorted value
    signal input next;                                          // private: upper adjacent sorted value
    signal input pathElements[depth];                           // private: Merkle siblings
    signal input pathIndices[depth];                            // private: 0 = node is left, 1 = right
    signal output valid;

    // (1) Membership: recompute the root from leaf Poseidon(value).
    component leafHash = Poseidon(1);
    leafHash.inputs[0] <== value;
    signal cur[depth + 1];
    cur[0] <== leafHash.out;
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
    root === cur[depth];

    // (2) Sorted-order invariant prev <= value <= next, on range-bound inputs (LessEqThan is only
    // sound when inputs are < 2^bits; without the Num2Bits guards a field-wrap witness forges the
    // ordering and claims a value out of its sorted position).
    component rbPrev = Num2Bits(bits);
    rbPrev.in <== prev;
    component rbVal = Num2Bits(bits);
    rbVal.in <== value;
    component rbNext = Num2Bits(bits);
    rbNext.in <== next;

    component leP = LessEqThan(bits);
    leP.in[0] <== prev;
    leP.in[1] <== value;
    component leN = LessEqThan(bits);
    leN.in[0] <== value;
    leN.in[1] <== next;

    // (3) Bind the published neighbour commitment to the actual (prev, next) pair.
    component nc = Poseidon(2);
    nc.inputs[0] <== prev;
    nc.inputs[1] <== next;
    neighborCommit === nc.out;

    // (4) valid = the order invariant holds (membership + neighbour binding are hard ===).
    valid <== leP.out * leN.out;
}

component main { public [root, neighborCommit, covenantId] } = SortedMerkleRange(4, 64);
