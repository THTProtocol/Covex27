pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// Collateral Liquidation Proof (Phase 2 DeFi)
// Proves collateral value < liquidation threshold using range/price oracles.
// Stub for demo; in real: use price feed + range proof for under-collateralized position.

template CollateralLiquidation() {
    signal input collateral; // committed or public
    signal input debt;
    signal input threshold; // e.g. 150% 
    signal input valid; // 1 if liquidation triggered

    // Simplified: collateral * 100 < debt * threshold
    component lt = LessThan(64);
    lt.in[0] <== collateral * 100;
    lt.in[1] <== debt * threshold;

    valid === lt.out;
}

component main { public [debt, threshold] } = CollateralLiquidation();
