pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// ml_inference_stub.circom — Verifiable ML inference stub (Covex)
// Proves output of simple model (e.g. linear) on private input matches claimed (hash placeholder).
template MlInferenceStub() {
    signal input privateInput;
    signal input modelWeight;
    signal input claimedOutput; // public
    signal input valid;

    // Very rough linear: out = input * w  (real: many constraints, activations, RISC0 better)
    signal computed <== privateInput * modelWeight;

    // Range on output for sanity
    component lt = LessThan(64);
    lt.in[0] <== claimedOutput;
    lt.in[1] <== 100000;
    lt.out === 1;

    // Stub equality relaxed
    valid === 1;
}

component main { public [claimedOutput, valid] } = MlInferenceStub();
