pragma circom 2.0.0;

include "../privacy_mixer/lib/nullifier.circom";

// Standalone nullifier proof: binds public nullifier to private (secret, nullifier_key).
template NullifierV1() {
    signal input nullifier;
    signal input secret;
    signal input nullifier_key;
    signal output valid;

    component n = NullifierHash();
    n.secret <== secret;
    n.nullifier_key <== nullifier_key;
    n.nullifier <== nullifier;
    valid <== 1;
}

component main { public [nullifier] } = NullifierV1();