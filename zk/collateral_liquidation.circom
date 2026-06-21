pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// collateral_liquidation.circom - prove a lending position IS liquidatable (LTV at or
// over the liquidation threshold) WITHOUT revealing the collateral or debt amounts.
//   Private: collateral, debt
//   Public:  threshold (liquidation LTV in basis points, e.g. 8500 = 85.00%), covenantId (H4 replay binding)
//   Output:  valid == 1  iff  debt * 10000 >= threshold * collateral   (i.e. LTV at/over liquidation), else 0
// `valid` is a CONSTRAINED OUTPUT derived from the inequality - it is NOT a prover-supplied
// input, so the proof genuinely attests the liquidation relation. The old stub took `valid`
// as a public INPUT and only did `valid === lt.out`, which lets a prover supply any outcome
// (and left the comparator dangling), proving nothing. No field division is used: the LTV
// relation debt/collateral >= threshold/10000 is checked by cross-multiplication.
//
// SOUNDNESS: GreaterEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). The operands
// here are products of prover-supplied field elements (debt*10000, threshold*collateral). Without
// range checks a prover can pick a field element near the BN254 prime p so the product wraps mod p
// into the comparator's accept region, forging valid=1 for a position that is NOT liquidatable (e.g.
// debt tiny but a field-negative collateral or threshold makes threshold*collateral wrap small). We
// bit-constrain every operand input so each product provably stays well under 2^bits:
//   debt,collateral <= 2^64-1  ->  debt*10000           < 2^64 * 2^14 = 2^78 < 2^128
//                                  threshold*collateral < 2^32 * 2^64 = 2^96 < 2^128
//   threshold       <= 2^32-1   (covers any realistic basis-point liquidation ceiling)
// covenantId is NOT range-checked: it never enters a comparator operand (it is only bound via
// cbindH4 = covenantId*covenantId for H4 replay binding), so wrapping it cannot forge the relation.
template CollateralLiquidation(bits) {
    signal input collateral;   // private
    signal input debt;         // private
    signal input threshold;    // public (liquidation LTV in bps)
    signal input covenantId;   // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every operand input so the products cannot wrap the field and bypass the
    // comparator. These Num2Bits also reject negative/huge field elements outright.
    component rcCollateral = Num2Bits(64);
    rcCollateral.in <== collateral;
    component rcDebt = Num2Bits(64);
    rcDebt.in <== debt;
    component rcThreshold = Num2Bits(32);
    rcThreshold.in <== threshold;

    // liquidatable iff  debt * 10000 >= threshold * collateral
    // operands: debt*10000 < 2^78, threshold*collateral < 2^96, both << 2^bits
    component liquidatable = GreaterEqThan(bits);
    liquidatable.in[0] <== debt * 10000;
    liquidatable.in[1] <== threshold * collateral;
    valid <== liquidatable.out;
}

component main { public [threshold, covenantId] } = CollateralLiquidation(128);
