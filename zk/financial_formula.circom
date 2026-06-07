pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// financial_formula.circom — Financial formula verification stub (Covex e.g. NPV, APR)
// Proves computed value from inputs satisfies formula within tolerance (placeholder math).
template FinancialFormula() {
    signal input principal;
    signal input rate;
    signal input periods;
    signal input computed; // public result e.g. FV
    signal input valid;

    // Rough: FV ~ principal * (1 + rate)^periods  -- no pow, use mul placeholder
    signal approx <== principal * (rate + 1000) * (periods + 1) / 1000; // scaled stub

    component inTol = LessThan(64);
    inTol.in[0] <== computed - 100;
    inTol.in[1] <== approx + 100;
    inTol.out === 1;

    valid === 1;
}

component main { public [computed, valid] } = FinancialFormula();
