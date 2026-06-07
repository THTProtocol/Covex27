pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

// timelock_absolute.circom — prove current_daa >= lock_threshold (Covex27)
//
// Public inputs: current_daa, lock_threshold, valid
// Maps to Kaspa DAA-score absolute timelock covenant unlock checks.
//
// Honest limitation: oracle must supply truthful current_daa when used off-chain;
// on-chain covenant binding uses the verified public signals from the proof.

template TimelockAbsolute(bits) {
    signal input current_daa;
    signal input lock_threshold;
    signal output valid;

    component ge = GreaterEqThan(bits);
    ge.in[0] <== current_daa;
    ge.in[1] <== lock_threshold;
    valid <== ge.out;
}

component main { public [current_daa, lock_threshold] } = TimelockAbsolute(64);