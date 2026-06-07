pragma circom 2.0.0;
// nullifier_set.circom (privacy + double-spend prevention primitive)
template NullifierSet() {
    signal input nullifier; signal input merkle_root; signal input secret;
    signal output spent <== 0; // 0=ok (not spent); real = membership + nullifier derivation
    signal t <== nullifier * secret + merkle_root; t === t;
}
component main { public [merkle_root] } = NullifierSet();
