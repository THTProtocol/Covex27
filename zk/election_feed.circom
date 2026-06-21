pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// election_feed.circom - prove a declared 2-way winner is consistent with the
// reported tallies AND clears a victory margin threshold, WITHOUT trusting a
// prover-supplied validity flag.
//   Public: tallyA, tallyB, winner, threshold, covenantId
//   Output: valid == 1  iff
//       (winner == 0 AND tallyA > tallyB AND tallyA - tallyB >= threshold)
//    OR (winner == 1 AND tallyB > tallyA AND tallyB - tallyA >= threshold)
//   else 0
//
// `valid` is a CONSTRAINED OUTPUT computed from real comparators + a selector on
// `winner`. It is NOT a prover-supplied input, and the comparator outputs are NOT
// left dangling (the old stub declared `valid` as a public input, asserted
// `valid === 1`, and ignored the lone comparator - it proved NOTHING).
//
// Margin checks avoid field subtraction (which underflows): `tallyA - tallyB >= threshold`
// is rewritten as `tallyA >= tallyB + threshold` via GreaterEqThan. No field division is used.
//
// SOUNDNESS: GreaterThan/GreaterEqThan(bits) (and IsEqual) are only sound when every operand
// lies in [0, 2^bits) as an INTEGER. The margin operands `tallyB + threshold` and
// `tallyA + threshold` are SUMS of prover-supplied public field elements. Without range checks
// a prover can pick `threshold` near the BN254 prime p (a field-negative, e.g. threshold = p - k)
// so that `tallyB + threshold` WRAPS mod p down into the comparator's accept region. The result:
// `valid = 1` is forged for a FALSE integer margin (e.g. a 1-vote lead "clearing" a 1,000,000-vote
// threshold). VERIFIED exploitable on the un-ranged version. FIX: bit-constrain every free operand
// with Num2Bits so the integer sums provably stay below 2^bits and cannot wrap:
//   tallyA, tallyB <= 2^64-1, threshold <= 2^64-1
//     -> tallyB + threshold < 2^65 < 2^64+1... (so we size the comparator at bits=128 and the
//        operands are each < 2^65, well inside [0, 2^128) with no wrap possible).
// `winner` is additionally constrained to a boolean {0,1} so it cannot be an arbitrary field value
// that tricks the IsEqual selectors. `covenantId` is NOT range-checked: it is a hash-derived public
// binding (sha256(deploy_tx_id) mod p) consumed only via cbindH4 = covenantId*covenantId, never fed
// to a comparator, so it has no integer-relation soundness requirement.
template ElectionFeed(bits) {
    signal input tallyA;     // public
    signal input tallyB;     // public
    signal input winner;     // public (0 or 1)
    signal input threshold;  // public (required victory margin)
    signal input covenantId; // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // ---- range-bind every comparator operand so the margin sums cannot wrap the field ----
    // 64-bit caps keep each operand < 2^64; the largest sum (tally + threshold) is < 2^65, far
    // below the 2^128 comparator width, so the integer relation the comparator decides is the
    // real one.
    component rcTallyA = Num2Bits(64);
    rcTallyA.in <== tallyA;
    component rcTallyB = Num2Bits(64);
    rcTallyB.in <== tallyB;
    component rcThreshold = Num2Bits(64);
    rcThreshold.in <== threshold;

    // ---- winner must be a real boolean (0 or 1), not an arbitrary field element ----
    winner * (winner - 1) === 0;

    // ---- winner selector (exactly one of the two branches can be active) ----
    component isW0 = IsEqual();
    isW0.in[0] <== winner;
    isW0.in[1] <== 0;
    component isW1 = IsEqual();
    isW1.in[0] <== winner;
    isW1.in[1] <== 1;

    // ---- branch A: winner == 0 ----
    // strict lead: tallyA > tallyB
    component aStrict = GreaterThan(bits);
    aStrict.in[0] <== tallyA;
    aStrict.in[1] <== tallyB;
    // margin: tallyA - tallyB >= threshold  <=>  tallyA >= tallyB + threshold
    component aMargin = GreaterEqThan(bits);
    aMargin.in[0] <== tallyA;
    aMargin.in[1] <== tallyB + threshold;
    // AND the two comparator outputs (both are boolean 0/1)
    signal aLead <== aStrict.out * aMargin.out;
    // gate by the winner selector
    signal branchA <== isW0.out * aLead;

    // ---- branch B: winner == 1 ----
    component bStrict = GreaterThan(bits);
    bStrict.in[0] <== tallyB;
    bStrict.in[1] <== tallyA;
    component bMargin = GreaterEqThan(bits);
    bMargin.in[0] <== tallyB;
    bMargin.in[1] <== tallyA + threshold;
    signal bLead <== bStrict.out * bMargin.out;
    signal branchB <== isW1.out * bLead;

    // ---- OR the two mutually-exclusive branches ----
    // isW0 and isW1 cannot both be 1, so branchA + branchB is in {0,1}.
    valid <== branchA + branchB;
}

component main { public [tallyA, tallyB, winner, threshold, covenantId] } = ElectionFeed(128);
