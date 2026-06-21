pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// loan_health.circom - prove a loan's health factor HF >= 1 WITHOUT revealing the
// collateral or debt amounts.
//   Private: collateral, debt
//   Public:  liqThreshold (scaled by 100, e.g. 150 = 1.5x), covenantId (H4 replay binding)
//   Output:  valid == 1  iff  collateral * liqThreshold >= debt * 100   (i.e. HF >= 1), else 0
// `valid` is a CONSTRAINED OUTPUT derived from the inequality - it is NOT a prover-supplied
// input, so the proof genuinely attests the health relation (the old stub did `valid === 1`
// with the comparator output left dangling, proving nothing). No field division is used; the
// HF = collateral*liqThreshold/(debt*100) >= 1 relation is checked by cross-multiplication.
//
// SOUNDNESS: LessEqThan(128) is only sound when BOTH operands lie in [0, 2^128). The operands
// here are products of prover-supplied field elements (debt*100, collateral*liqThreshold). Without
// range checks, a prover can pick a field element near the BN254 prime p so that the product wraps
// mod p into [p-2^128+1, p-1), which makes the comparator's internal X = in0 + 2^128 - in1 - 1
// reduce below 2^128 (sign bit cleared) and still be 129-bit decomposable -> a valid proof of
// HF>=1 for a maximally UNHEALTHY loan (e.g. collateral=0). To close this, we bit-constrain every
// input so each operand provably stays well under 2^128:
//   debt,collateral <= 2^64-1  ->  debt*100        <  2^71   < 2^128
//                                  collateral*liqT <  2^64 * 2^32 = 2^96 < 2^128
//   liqThreshold    <= 2^32-1   (covers any realistic scaled threshold)
template LoanHealth(bits) {
    signal input collateral;     // private
    signal input debt;           // private
    signal input liqThreshold;   // public (scaled by 100)
    signal input covenantId;     // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every operand input so the products cannot wrap the field and bypass the
    // comparator. These Num2Bits also reject negative/huge field elements outright.
    component rcCollateral = Num2Bits(64);
    rcCollateral.in <== collateral;
    component rcDebt = Num2Bits(64);
    rcDebt.in <== debt;
    component rcThreshold = Num2Bits(32);
    rcThreshold.in <== liqThreshold;

    // healthy iff  debt * 100 <= collateral * liqThreshold
    // operands: debt*100 < 2^71, collateral*liqThreshold < 2^96, both << 2^bits
    component healthy = LessEqThan(bits);
    healthy.in[0] <== debt * 100;
    healthy.in[1] <== collateral * liqThreshold;
    valid <== healthy.out;
}

component main { public [liqThreshold, covenantId] } = LoanHealth(128);
