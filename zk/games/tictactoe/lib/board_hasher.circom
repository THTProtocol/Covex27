pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/mimc.circom";

// MiMC7 chain hash over board cells + player_to_move metadata.
template TicTacToeBoardHasher(nCells) {
    signal input board[nCells];
    signal input player_to_move;
    signal output board_hash;

    component h0 = MiMC7(91);
    h0.x_in <== 0;
    h0.k <== 0;

    component m[nCells + 1];
    for (var i = 0; i < nCells + 1; i++) {
        m[i] = MiMC7(91);
    }

    signal state[nCells + 1];
    m[0].x_in <== h0.out + board[0];
    m[0].k <== 0;
    state[0] <== m[0].out;

    for (var i = 1; i < nCells; i++) {
        m[i].x_in <== state[i - 1] + board[i];
        m[i].k <== 0;
        state[i] <== m[i].out;
    }

    m[nCells].x_in <== state[nCells - 1] + player_to_move;
    m[nCells].k <== 0;
    board_hash <== m[nCells].out;
}