pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// set_non_membership.circom — prove a PRIVATE leaf is NOT in a sorted blocklist (Covex27)
// Blocklist / sanctions-free attestation without revealing the leaf.
//
// Construction (sorted-Merkle non-membership, the standard cheap form):
//   The blocklist is a Merkle tree whose leaves are "range nodes" Poseidon(value, nextValue),
//   where (value, nextValue) are two ADJACENT entries of the sorted blocklist. A leaf X is
//   absent iff there exists a committed range node with value < X < nextValue (X falls strictly
//   between two adjacent blocked values, hence is itself not blocked). We prove ONE Merkle path
//   to such a range node, which is far cheaper than two separate membership paths yet is exactly
//   equivalent for a sorted set.
//
//   Public:  root (sorted-blocklist Merkle root, depth 4)
//   Private: leaf (the value being cleared), lo, hi (the bracketing adjacent blocked values),
//            pathElements[4], pathIndices[4] (Merkle path of the Poseidon(lo,hi) range node)
//   Output:  valid == 1 iff (lo < leaf) AND (leaf < hi) AND Merkle path of Poseidon(lo,hi) == root
//
// Genuine constraints:
//   (1) lt1 = LessThan(lo, leaf), lt2 = LessThan(leaf, hi)         — strict bracketing
//   (2) recompute the Merkle root from Poseidon(lo,hi) up `depth` levels and === it to root
//   (3) valid = lt1 * lt2 * (root match is hard-===, so it must hold for any witness)
// A satisfying witness can ONLY exist for a leaf genuinely absent from the committed list, and
// `valid` is 0 unless the strict-bracketing holds, so the oracle (which requires valid==1) cannot
// be made to clear a blocked leaf. No `valid <== 1` stub.
//
// bits = 64 caps the value domain. HONESTY: keys are a single-contributor Covex dev ceremony
// (pot*_final.ptau), NOT a production MPC. Verified OFF-CHAIN by the disclosed oracle, never on-chain.

template SetNonMembership(depth, bits) {
    signal input root;                                          // public: sorted-blocklist root
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input leaf;                                          // private: the value to clear
    signal input lo;                                            // private: lower adjacent blocked value
    signal input hi;                                            // private: upper adjacent blocked value
    signal input pathElements[depth];                           // private: Merkle siblings
    signal input pathIndices[depth];                            // private: 0 = node is left, 1 = node is right
    signal output valid;

    // (1) Strict bracketing: lo < leaf < hi  (so leaf is strictly between two adjacent blocked entries).
    component ltLo = LessThan(bits);
    ltLo.in[0] <== lo;
    ltLo.in[1] <== leaf;
    component ltHi = LessThan(bits);
    ltHi.in[0] <== leaf;
    ltHi.in[1] <== hi;

    // (2) Merkle path of the range node Poseidon(lo, hi) up to `root`.
    component rangeNode = Poseidon(2);
    rangeNode.inputs[0] <== lo;
    rangeNode.inputs[1] <== hi;

    signal cur[depth + 1];
    cur[0] <== rangeNode.out;

    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        // pathIndices[i] must be boolean.
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        // If index==0 the current node is the LEFT child; else it is the RIGHT child.
        // left  = index==0 ? cur : sibling ;  right = index==0 ? sibling : cur
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    // Hard constraint: the recomputed root must equal the public root.
    root === cur[depth];

    // (3) valid = bracketing holds (root match is already enforced by ===).
    valid <== ltLo.out * ltHi.out;
}

component main { public [root, covenantId] } = SetNonMembership(4, 64);
