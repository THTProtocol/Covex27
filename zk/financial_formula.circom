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

    // Stub quadratic only: simple mul/add for demo (no / or non-quad). For real, use proper fixed point or RISC0.
    signal temp <== principal * rate;
    signal approx <== temp + periods;

    component inTol = LessThan(64);
    inTol.in[0] <== computed;
    inTol.in[1] <== approx + 1000; // loose tol for stub
    inTol.out === 1;

    valid === 1;
}

component main { public [computed, valid] } = FinancialFormula();
