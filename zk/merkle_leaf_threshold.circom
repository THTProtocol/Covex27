pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// merkle_leaf_threshold.circom - prove a Poseidon Merkle leaf is in a committed set
// AND the leaf's value clears a public threshold, WITHOUT revealing account or value.
//
//   Public:  root      (Poseidon Merkle root of the eligibility / snapshot set, depth param),
//            threshold (minimum value required, e.g. snapshot balance or vote weight floor),
//            covenantId (H4 cross-covenant replay binding)
//   Private: account   (the leaf owner scalar, e.g. an address-derived field element),
//            value     (the leaf's amount: balance / token weight),
//            pathElements[depth], pathIndices[depth]  (Poseidon Merkle path of the leaf)
//   Output:  valid == (leaf-in-tree) * (value >= threshold)
//
// The leaf is leaf = Poseidon(account, value); the set is committed as a depth-`depth`
// Poseidon Merkle tree (parent = Poseidon(left, right)) under the public `root`.
//
// HONESTY / SOUNDNESS:
//   (1) `valid` is a CONSTRAINED OUTPUT = inTree * meetsThreshold, NOT a prover input and NOT
//       forced via `=== 1`. A verifying proof with valid==1 therefore genuinely implies BOTH the
//       membership AND the threshold relation. Membership is enforced as a boolean (IsEqual of the
//       recomputed root vs the public root) rather than a hard `root === cur[depth]` so that a
//       non-member produces valid==0 (a satisfiable proof of non-eligibility) instead of an
//       unsatisfiable system; the oracle gates on valid==1.
//   (2) RANGE CHECKS: value and threshold are bit-bound with Num2Bits(64) so both operands of the
//       GreaterEqThan comparator provably lie in [0, 2^64) and cannot wrap the BN254 field to forge
//       a passing comparison (same hazard fixed in collateral_ltv.circom). pathIndices are
//       constrained boolean. account/leaf/root are Poseidon outputs (full-field) and are NOT fed to
//       a comparator, so they need no range bound.
//   (3) covenantId is bound (cbindH4) and published to stop cross-covenant proof replay.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.
//
// v1 simplifications: VALUE_BITS is fixed at 64 (covers Kaspa sompi balances < 2^64 and any
// realistic vote weight); a value requiring > 64 bits is out of range and would fail the witness.
template MerkleLeafThreshold(depth, valueBits) {
    signal input root;            // public: Merkle root of the set
    signal input threshold;       // public: minimum value required
    signal input covenantId;      // public: H4 replay binding
    signal cbindH4 <== covenantId * covenantId;
    signal input account;         // private: leaf owner scalar
    signal input value;           // private: leaf value (balance / weight)
    signal input pathElements[depth]; // private: Merkle siblings
    signal input pathIndices[depth];  // private: 0 = current is left, 1 = current is right
    signal output valid;

    // Range-bind the comparator operands so neither can wrap the field to forge a comparison.
    component rcValue = Num2Bits(valueBits);
    rcValue.in <== value;
    component rcThreshold = Num2Bits(valueBits);
    rcThreshold.in <== threshold;

    // (1) Leaf = Poseidon(account, value).
    component leaf = Poseidon(2);
    leaf.inputs[0] <== account;
    leaf.inputs[1] <== value;

    // (2) Recompute the Merkle root from the leaf up `depth` levels.
    signal cur[depth + 1];
    cur[0] <== leaf.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;            // boolean constraint
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }

    // inTree = 1 iff the recomputed root equals the public root.
    component rootEq = IsEqual();
    rootEq.in[0] <== cur[depth];
    rootEq.in[1] <== root;
    signal inTree <== rootEq.out;

    // (3) meetsThreshold = 1 iff value >= threshold (both range-bound above).
    component ge = GreaterEqThan(valueBits);
    ge.in[0] <== value;
    ge.in[1] <== threshold;
    signal meetsThreshold <== ge.out;

    // valid = inTree AND meetsThreshold (product of two booleans).
    valid <== inTree * meetsThreshold;
}

component main { public [root, threshold, covenantId] } = MerkleLeafThreshold(4, 64);
