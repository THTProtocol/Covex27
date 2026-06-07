pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// Prove a covenant script constraint bundle hashes to public_root.
// constraint_id + value are public so users/covenants pick limits at deploy time.

template ScriptConstraint() {
    signal input script_hash;
    signal input constraint_id;
    signal input value;
    signal input public_root;
    signal output ok;

    component h = Poseidon(3);
    h.inputs[0] <== script_hash;
    h.inputs[1] <== constraint_id;
    h.inputs[2] <== value;

    public_root === h.out;
    ok <== 1;
}

component main { public [public_root, constraint_id, value] } = ScriptConstraint();