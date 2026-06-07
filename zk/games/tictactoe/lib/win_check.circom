pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";

template TicTacToeWinCheck() {
    signal input board[9];
    signal input player;
    signal output has_win;

    var LINES[8][3] = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6]
    ];

    component e0[8][3];
    component nz[8][3];
    signal line_win[8];
    signal t0[8];
    signal t1[8];
    signal t2[8];
    signal t3[8];
    signal t4[8];

    for (var l = 0; l < 8; l++) {
        for (var k = 0; k < 3; k++) {
            e0[l][k] = IsZero();
            nz[l][k] = IsZero();
            e0[l][k].in <== board[LINES[l][k]] - player;
            nz[l][k].in <== board[LINES[l][k]];
        }
        t0[l] <== (1 - e0[l][0].out) * (1 - e0[l][1].out);
        t1[l] <== t0[l] * (1 - e0[l][2].out);
        t2[l] <== t1[l] * (1 - nz[l][0].out);
        t3[l] <== t2[l] * (1 - nz[l][1].out);
        line_win[l] <== t3[l] * (1 - nz[l][2].out);
    }

    signal acc[8];
    acc[0] <== line_win[0];
    for (var i = 1; i < 8; i++) {
        acc[i] <== acc[i - 1] + line_win[i];
    }
    component any = IsZero();
    any.in <== acc[7];
    has_win <== 1 - any.out;
}