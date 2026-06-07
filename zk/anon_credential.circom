pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

// anon_credential.circom — Anonymous credential / ZK proof of attribute stub (Covex)
// Proves possession of credential (e.g. age >18) via commitment without revealing.
template AnonCredential() {
    signal input secretCred;
    signal input attrValue; // private attr e.g. birth year
    signal input minAttr;   // public
    signal input credNullifier; // public
    signal input valid;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secretCred;
    hasher.inputs[1] <== attrValue;

    component ok = LessThan(32);
    ok.in[0] <== minAttr - 1;
    ok.in[1] <== attrValue;
    ok.out === 1;

    valid === 1;
}

component main { public [credNullifier, valid] } = AnonCredential();
