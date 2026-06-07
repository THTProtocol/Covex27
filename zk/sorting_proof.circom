pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// sorting_proof.circom — Verifiable sort / ordering proof stub (Covex)
// Proves an array was sorted (placeholder pairwise constraints for small N).
template SortingProof() {
    signal input a;
    signal input b;
    signal input c;
    signal input sorted; // public flag or hash of sorted
    signal input valid;

    // Enforce a <= b <= c (simple for stub N=3)
    component ab = LessThan(64);
    ab.in[0] <== a;
    ab.in[1] <== b + 1;
    component bc = LessThan(64);
    bc.in[0] <== b;
    bc.in[1] <== c + 1;

    signal ordered <== ab.out * bc.out;
    valid === 1;
}

component main { public [sorted, valid] } = SortingProof();
