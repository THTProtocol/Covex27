pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// Derive nullifier from secret and bind to merkle_root (set anchor).
// spent output is 0 when derivation is valid (not a double-spend proof alone).

template NullifierSet() {
    signal input nullifier;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input merkle_root;
    signal input secret;
    signal output spent;

    component derive = Poseidon(1);
    derive.inputs[0] <== secret;
    nullifier === derive.out;

    component bind = Poseidon(2);
    bind.inputs[0] <== secret;
    bind.inputs[1] <== nullifier;
    merkle_root === bind.out;

    spent <== 0;
}

component main { public [nullifier, merkle_root, covenantId] } = NullifierSet();