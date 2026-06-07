pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";

// board_lookup.circom - Mux-based square lookup (Covex27)

template BoardLookup() {
    signal input board[64];
    signal input square;
    signal output piece;

    component eq[64];
    signal acc[64];
    for (var i = 0; i < 64; i++) {
        eq[i] = IsZero();
        eq[i].in <== i - square;
    }
    acc[0] <== eq[0].out * board[0];
    for (var i = 1; i < 64; i++) {
        acc[i] <== acc[i - 1] + eq[i].out * board[i];
    }
    piece <== acc[63];
}