pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/mux1.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// black_scholes_approx.circom - HONEST no-arbitrage BOUNDS check for a European CALL.
//
// IMPORTANT HONESTY NOTE: this is NOT an exact Black-Scholes price. Black-Scholes
// requires exp / ln / sqrt and the cumulative normal CDF, which are infeasible to
// express as arithmetic constraints in circom. So this circuit proves only that a
// claimed `price` sits inside the model-free NO-ARBITRAGE bounds for a call:
//
//     intrinsic = max(spot - strike, 0)        (the call's intrinsic value)
//     valid == 1  iff  price >= intrinsic  AND  price <= spot
//
// Rationale for the bounds (these hold for ANY arbitrage-free call price, not just BS):
//   - A call is worth at least its intrinsic value max(spot-strike,0) (lower bound).
//   - A call is never worth more than the underlying spot price (upper bound).
// Anything inside [intrinsic, spot] is admissible; the circuit does not assert the
// price is the BS-fair value, only that it is not free-money-arbitrageable.
//
//   Public:  spot, strike, price, covenantId   (spot/strike supplied by an external price oracle)
//   Output:  valid  (1 if both bound inequalities hold, else 0)
//
// `valid` is a CONSTRAINED OUTPUT computed from the two comparators ANDed together.
// It is NOT a prover-supplied input and there is NO `valid === 1` assertion, so a
// proof for out-of-bounds inputs still verifies cryptographically but yields valid==0.
// (The old stub took `valid` as a public input, asserted `valid === 1`, and left the
// comparator dangling - it proved nothing. This rewrite fixes that.)
//
// No field division is used. `spot - strike` is only ever selected as `intrinsic`
// when spot >= strike (so it is non-negative); the other branch selects 0.
//
// SOUNDNESS: LessEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits).
// spot, strike, price are prover-supplied field elements fed straight into the three
// comparators, and `spot - strike` is a SUBTRACTION of free field elements. Without
// range checks a prover can pick a value near the BN254 prime p (e.g. strike = p - k,
// a field-negative) so that a comparator operand, or the subtraction spot - strike,
// wraps mod p into the comparator's accept region and forges valid=1 for a FALSE bound
// relation (e.g. a price below intrinsic or above spot). We bit-constrain each of the
// three free price operands with Num2Bits(64); these also reject negative/huge field
// elements outright. With every operand < 2^64:
//   spot, strike, price             < 2^64 < 2^bits
//   intrinsic = spot - strike       < 2^64 < 2^bits   (selected only when spot >= strike,
//                                                       so non-negative; else 0)
// so no comparator operand can wrap the field. covenantId is NOT range-checked here: it
// is never fed to a comparator, only squared (cbindH4) for H4 cross-covenant replay
// binding, so wrapping cannot affect any inequality - it is already pinned by its use.
template BlackScholesApprox(bits) {
    signal input spot;        // public (price oracle)
    signal input strike;      // public (price oracle)
    signal input price;       // public (claimed call price, same fixed-point scale as spot/strike)
    signal input covenantId;  // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every comparator operand so neither a raw value nor the spot - strike
    // subtraction can wrap the field and bypass the bound checks. Prices are fixed-point
    // and fit in 2^64; this is the same Num2Bits pattern as collateral_ltv / loan_health.
    component rcSpot = Num2Bits(64);
    rcSpot.in <== spot;
    component rcStrike = Num2Bits(64);
    rcStrike.in <== strike;
    component rcPrice = Num2Bits(64);
    rcPrice.in <== price;

    // spotGeStrike = 1 iff spot >= strike  (i.e. strike <= spot)
    component spotGeStrike = LessEqThan(bits);
    spotGeStrike.in[0] <== strike;
    spotGeStrike.in[1] <== spot;

    // intrinsic = max(spot - strike, 0)
    //   branch s=1 (spot >= strike): spot - strike  (non-negative)
    //   branch s=0 (spot <  strike): 0
    component pick = Mux1();
    pick.c[0] <== 0;            // selected when spotGeStrike.out == 0
    pick.c[1] <== spot - strike;// selected when spotGeStrike.out == 1
    pick.s   <== spotGeStrike.out;
    signal intrinsic <== pick.out;

    // lower bound: price >= intrinsic   <=>   intrinsic <= price
    component lower = LessEqThan(bits);
    lower.in[0] <== intrinsic;
    lower.in[1] <== price;

    // upper bound: price <= spot
    component upper = LessEqThan(bits);
    upper.in[0] <== price;
    upper.in[1] <== spot;

    // valid = lower AND upper  (both comparator outputs are boolean)
    valid <== lower.out * upper.out;
}

component main { public [spot, strike, price, covenantId] } = BlackScholesApprox(128);
