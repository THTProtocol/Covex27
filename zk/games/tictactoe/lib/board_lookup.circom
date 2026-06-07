pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";

template BoardLookup(nCells) {
    signal input board[nCells];
    signal input index;
    signal output value;

    component eq[nCells];
    signal acc[nCells];
    for (var i = 0; i < nCells; i++) {
        eq[i] = IsZero();
        eq[i].in <== i - index;
    }
    acc[0] <== eq[0].out * board[0];
    for (var i = 1; i < nCells; i++) {
        acc[i] <== acc[i - 1] + eq[i].out * board[i];
    }
    value <== acc[nCells - 1];
}