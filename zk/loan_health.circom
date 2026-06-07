pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// loan_health.circom — Loan health factor / HF stub (Covex)
// HF = collat * liqThresh / debt > 1 (placeholder for lending health monitoring).
template LoanHealth() {
    signal input collateral;
    signal input debt;
    signal input liqThreshold; // e.g. 150
    signal input healthFactor; // public scaled
    signal input valid;

    // health > 100 (meaning >1.0) stub check
    component healthy = LessThan(64);
    healthy.in[0] <== debt * 100;
    healthy.in[1] <== collateral * liqThreshold;

    valid === 1;
}

component main { public [healthFactor, valid] } = LoanHealth();
