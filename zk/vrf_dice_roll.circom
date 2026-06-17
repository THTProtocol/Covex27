pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// VRF dice: roll in [1, faces] derived from Poseidon(secret, seed).
// User/game chooses faces via template param (default 6).

template VrfDiceRoll(faces) {
    signal input secret;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input seed;
    signal input roll;
    signal input q;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== seed;
    signal computed <== hasher.out;

    component gte1 = GreaterEqThan(16);
    gte1.in[0] <== roll;
    gte1.in[1] <== 1;
    gte1.out === 1;

    component lte = LessEqThan(16);
    lte.in[0] <== roll;
    lte.in[1] <== faces;
    lte.out === 1;

    q * faces + roll - 1 === computed;
}

component main { public [seed, roll, covenantId] } = VrfDiceRoll(6);