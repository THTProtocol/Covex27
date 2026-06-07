pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "mimc_hash.circom";

template MerklePathVerifier(depth) {
    signal input leaf;
    signal input root;
    signal input path_elements[depth];
    signal input path_indices[depth];

    signal current[depth + 1];
    component hashers[depth];
    component idx_ok[depth];
    signal left[depth];
    signal right[depth];
    signal t0[depth];
    signal t1[depth];
    signal u0[depth];
    signal u1[depth];

    current[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        idx_ok[i] = IsZero();
        idx_ok[i].in <== path_indices[i] * (1 - path_indices[i]);
        idx_ok[i].out === 1;

        t0[i] <== (1 - path_indices[i]) * current[i];
        t1[i] <== path_indices[i] * path_elements[i];
        left[i] <== t0[i] + t1[i];

        u0[i] <== path_indices[i] * current[i];
        u1[i] <== (1 - path_indices[i]) * path_elements[i];
        right[i] <== u0[i] + u1[i];

        hashers[i] = MiMC7Hash2();
        hashers[i].left <== left[i];
        hashers[i].right <== right[i];
        current[i + 1] <== hashers[i].out;
    }
    root === current[depth];
}