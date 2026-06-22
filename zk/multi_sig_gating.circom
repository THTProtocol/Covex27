pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// multi_sig_gating.circom - prove an M-of-N signature/approval gate is OPEN
// (i.e. the collected signature count meets the threshold) WITHOUT revealing
// the exact signature count.
//   Private: sigCount
//   Public:  threshold, covenantId (H4 cross-covenant replay binding)
//   Output:  valid == 1  iff  sigCount >= threshold   (gate open), else 0
// `valid` is a CONSTRAINED OUTPUT derived from the M-of-N inequality - it is NOT a
// prover-supplied input. The old stub had `valid` as a public INPUT with `valid === 1`
// and left the comparator output dangling, so it proved NOTHING. Here `valid` IS the
// gate: a proof can be produced for a failing case too, and it will carry valid == 0.
//
// SOUNDNESS: GreaterEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits).
// Internally it runs LessThan(bits) on [threshold, sigCount], which decomposes
// sigCount + (1<<bits) - threshold with Num2Bits(bits+1). Both sigCount (private) and
// threshold (public) are FREE prover-supplied field elements here. Without range checks a
// prover can pick sigCount near the BN254 prime p (a field-negative, e.g. p-k) or pick a
// public threshold = p-k so the internal sum wraps mod p into the comparator's accept
// region, forging valid=1 for a FALSE M-of-N relation (e.g. sigCount=0 >= threshold=1).
// We bit-constrain BOTH comparator operands so each provably stays well under 2^bits:
//   sigCount, threshold <= 2^32-1  (covers any realistic N-of-M approval set; << 2^64)
// covenantId is NOT a comparator operand (it only feeds the cbindH4 quadratic replay
// binding), so it is not range-bound here - it carries no inequality meaning.
template MultiSigGating(bits) {
    signal input sigCount;     // private (how many valid sigs/approvals collected)
    signal input threshold;    // public  (M, the required minimum)
    signal input covenantId;   // public  (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind BOTH comparator operands so neither can wrap the field and bypass the
    // GreaterEqThan gate. These Num2Bits also reject negative/huge field elements outright.
    component rcSigCount = Num2Bits(32);
    rcSigCount.in <== sigCount;
    component rcThreshold = Num2Bits(32);
    rcThreshold.in <== threshold;

    component met = GreaterEqThan(bits);
    met.in[0] <== sigCount;
    met.in[1] <== threshold;
    valid <== met.out;
}

component main { public [threshold, covenantId] } = MultiSigGating(64);
