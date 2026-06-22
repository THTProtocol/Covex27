pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// collateral_ltv.circom - prove a loan's LTV is within the allowed maximum WITHOUT
// revealing the collateral or debt amounts.
//   Private: collateral, debt
//   Public:  maxLtvBps (basis points, e.g. 7500 = 75.00%), covenantId (H4 replay binding)
//   Output:  valid == 1  iff  debt * 10000 <= maxLtvBps * collateral   (i.e. LTV <= max), else 0
// `valid` is a CONSTRAINED OUTPUT derived from the inequality - it is NOT a prover-supplied
// input, so the proof genuinely attests the LTV relation (the old stub did `valid === 1` with
// the comparator output left dangling, proving nothing). No field division is used.
//
// SOUNDNESS: LessEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). The operands
// here are products of prover-supplied field elements (debt*10000, maxLtvBps*collateral). Without
// range checks a prover can pick a field element near the BN254 prime p so the product wraps mod p
// into the comparator's accept region, forging valid=1 for an over-leveraged loan (e.g. debt huge,
// collateral=0). We bit-constrain every input so each operand provably stays well under 2^bits:
//   debt,collateral <= 2^64-1  ->  debt*10000           < 2^64 * 2^14 = 2^78 < 2^128
//                                  maxLtvBps*collateral  < 2^32 * 2^64 = 2^96 < 2^128
//   maxLtvBps       <= 2^32-1   (covers any realistic basis-point ceiling)
template CollateralLtv(bits) {
    signal input collateral;   // private
    signal input debt;         // private
    signal input maxLtvBps;    // public
    signal input covenantId;   // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every operand so the products cannot wrap the field and bypass the comparator.
    component rcCollateral = Num2Bits(64);
    rcCollateral.in <== collateral;
    component rcDebt = Num2Bits(64);
    rcDebt.in <== debt;
    component rcMaxLtv = Num2Bits(32);
    rcMaxLtv.in <== maxLtvBps;

    component withinLtv = LessEqThan(bits);
    withinLtv.in[0] <== debt * 10000;
    withinLtv.in[1] <== maxLtvBps * collateral;
    valid <== withinLtv.out;
}

component main { public [maxLtvBps, covenantId] } = CollateralLtv(128);
