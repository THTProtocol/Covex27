pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/mux1.circom";

// merkle_range_membership.circom - prove a private (account, value) leaf is a member of a
// committed Poseidon Merkle set AND that value lies inside a PUBLIC two-sided band [lo, hi],
// WITHOUT revealing the account or the value (Covex27, self-contained primitive).
//
// This is distinct from:
//   - merkle_membership      (membership only, no value semantics)
//   - merkle_leaf_threshold  (membership AND a ONE-sided value >= threshold)
//   - set_non_membership     (NON-membership of a sorted range tree)
// It is the two-sided variant: "you are in the allowlist/snapshot AND your value is within
// this tier band" (e.g. a balance bracket, an age band, a price tier), revealing neither the
// identity nor the exact value. Useful for tiered eligibility / bracketed gating.
//
//   Public:  root       (Poseidon Merkle root of the eligibility set, depth = DEPTH),
//            lo, hi     (inclusive value band; lo <= value <= hi),
//            covenantId (H4 cross-covenant replay binding)
//   Private: account    (leaf owner scalar, e.g. address-derived field element),
//            value      (the leaf's amount; the quantity being banded),
//            pathElements[DEPTH], pathIndices[DEPTH]  (Poseidon Merkle path of the leaf)
//   Output:  valid == (leaf-in-tree) * (value >= lo) * (value <= hi)
//
// leaf = Poseidon(account, value); parent = Poseidon(left, right). pathIndices[i] == 0 means the
// current node is the LEFT child at level i.
//
// HONESTY / SOUNDNESS:
//   (1) `valid` is a CONSTRAINED OUTPUT (a product of three booleans), NEVER a prover input and
//       NEVER forced via `=== 1`. A verifying proof with valid==1 therefore genuinely implies
//       BOTH membership AND lo <= value <= hi. A non-member, or a value outside the band, yields
//       a satisfiable proof with valid==0 (the oracle gates on valid == publicSignals[0] == 1),
//       not an unsatisfiable system, so there is no dangling/unconstrained comparator.
//   (2) RANGE CHECKS: value, lo, hi are bit-bound with Num2Bits(64) so both operands of each
//       GreaterEqThan/LessEqThan comparator provably lie in [0, 2^64) and cannot wrap the BN254
//       field to forge a passing comparison (the same field-wrap hazard fixed in
//       balance_threshold.circom / collateral_ltv.circom).
//   (3) pathIndices are each constrained boolean (idx*(idx-1)===0) so a path bit cannot take a
//       non-{0,1} value to mix siblings.
//   (4) covenantId is bound via cbindH4 = covenantId*covenantId (a real quadratic constraint on
//       the public input), matching the rest of the suite, so a proof for covenant A cannot be
//       replayed against covenant B.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot10_final.ptau), NOT a production
// multi-party MPC. The Groth16 proof is verified OFF-CHAIN by you / the counterparty / any
// external resolver (fail-closed), never on-chain (Kaspa has no pairing verifier).

template MerkleRangeMembership(DEPTH, bits) {
    // public
    signal input root;
    signal input lo;
    signal input hi;
    signal input covenantId;
    signal cbindH4 <== covenantId * covenantId;   // H4 replay binding (real constraint)
    // private
    signal input account;
    signal input value;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];
    signal output valid;

    // leaf = Poseidon(account, value)
    component leafH = Poseidon(2);
    leafH.inputs[0] <== account;
    leafH.inputs[1] <== value;

    // Walk the Merkle path. cur[0] = leaf; cur[DEPTH] = recomputed root.
    component hsh[DEPTH];
    component muxL[DEPTH];
    component muxR[DEPTH];
    signal cur[DEPTH + 1];
    cur[0] <== leafH.out;

    for (var i = 0; i < DEPTH; i++) {
        // pathIndices[i] must be boolean (0 = current is LEFT child, 1 = RIGHT child).
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // Order (left,right) by the index bit using Mux1 (no division, fully constrained).
        muxL[i] = Mux1();
        muxL[i].c[0] <== cur[i];            // idx==0: current is left
        muxL[i].c[1] <== pathElements[i];   // idx==1: sibling is left
        muxL[i].s <== pathIndices[i];

        muxR[i] = Mux1();
        muxR[i].c[0] <== pathElements[i];   // idx==0: sibling is right
        muxR[i].c[1] <== cur[i];            // idx==1: current is right
        muxR[i].s <== pathIndices[i];

        hsh[i] = Poseidon(2);
        hsh[i].inputs[0] <== muxL[i].out;
        hsh[i].inputs[1] <== muxR[i].out;
        cur[i + 1] <== hsh[i].out;
    }

    // membership == (recomputed root == public root), as a boolean (so a non-member -> valid 0).
    component eqRoot = IsEqual();
    eqRoot.in[0] <== cur[DEPTH];
    eqRoot.in[1] <== root;

    // Range-bind value, lo, hi to [0, 2^bits) BEFORE comparing (field-wrap defense).
    component rbVal = Num2Bits(bits); rbVal.in <== value;
    component rbLo  = Num2Bits(bits); rbLo.in  <== lo;
    component rbHi  = Num2Bits(bits); rbHi.in  <== hi;

    // value >= lo  AND  value <= hi
    component geLo = GreaterEqThan(bits);
    geLo.in[0] <== value;
    geLo.in[1] <== lo;
    component leHi = LessEqThan(bits);
    leHi.in[0] <== value;
    leHi.in[1] <== hi;

    // valid = member * (value>=lo) * (value<=hi), built with intermediate signals so each
    // multiplication is quadratic (circom requires degree <= 2 per constraint).
    signal inBand;
    inBand <== geLo.out * leHi.out;
    signal memberInBand;
    memberInBand <== eqRoot.out * inBand;
    valid <== memberInBand;
}

component main { public [root, lo, hi, covenantId] } = MerkleRangeMembership(4, 64);
