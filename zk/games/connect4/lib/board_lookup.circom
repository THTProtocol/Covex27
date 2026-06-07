pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";

template BoardLookup42() {
    signal input board[42];
    signal input index;
    signal output value;

    component eq[42];
    signal acc[42];
    for (var i = 0; i < 42; i++) {
        eq[i] = IsZero();
        eq[i].in <== i - index;
    }
    acc[0] <== eq[0].out * board[0];
    for (var i = 1; i < 42; i++) {
        acc[i] <== acc[i - 1] + eq[i].out * board[i];
    }
    value <== acc[41];
}