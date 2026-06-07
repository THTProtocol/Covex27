pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// multi_sig_gating.circom — Multi-sig / threshold gating stub (Covex)
// Proves N-of-M signatures or approvals met without revealing keys (placeholder).
template MultiSigGating() {
    signal input sigCount;
    signal input threshold;
    signal input gateOpen; // public
    signal input valid;

    component met = LessThan(8);
    met.in[0] <== threshold - 1;
    met.in[1] <== sigCount;
    met.out === 1;

    valid === 1;
}

component main { public [gateOpen, valid] } = MultiSigGating();
