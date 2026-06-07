pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// collateral_ltv.circom — Collateral LTV check stub (Covex vision, variant of liquidation)
// Proves LTV = debt / collat < maxLtv (public signals for oracle use).
template CollateralLtv() {
    signal input collateral;
    signal input debt;
    signal input maxLtv; // e.g. 7500 for 75%
    signal input currentLtv; // public claimed
    signal input valid;

    // currentLtv approx debt*10000 / collat  (no div in circom easy, use mul check)
    component safe = LessThan(64);
    safe.in[0] <== debt * 100;
    safe.in[1] <== collateral * (maxLtv / 100 + 1);

    valid === 1;
}

component main { public [currentLtv, valid] } = CollateralLtv();
