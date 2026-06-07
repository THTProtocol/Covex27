pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/mimc.circom";

// 7x6 board (42 cells) + player_to_move via MiMC7 chain.
template Connect4BoardHasher() {
    signal input board[42];
    signal input player_to_move;
    signal output board_hash;

    component h0 = MiMC7(91);
    h0.x_in <== 0;
    h0.k <== 0;

    component m[43];
    for (var i = 0; i < 43; i++) {
        m[i] = MiMC7(91);
    }

    signal state[43];
    m[0].x_in <== h0.out + board[0];
    m[0].k <== 0;
    state[0] <== m[0].out;

    for (var i = 1; i < 42; i++) {
        m[i].x_in <== state[i - 1] + board[i];
        m[i].k <== 0;
        state[i] <== m[i].out;
    }

    m[42].x_in <== state[41] + player_to_move;
    m[42].k <== 0;
    board_hash <== m[42].out;
}