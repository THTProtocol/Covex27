pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/mimc.circom";

// board_hasher.circom - Full position hashing (Covex27)
//
// Hashes 64 board squares + 4 metadata fields via 68 MiMC7 chain steps.
// Component array declared at top scope, wired in unrolled loops.
//
// Constraint budget: ~20,400 (68 * ~300 per MiMC7)

template FullPositionHasher() {
    signal input board[64];
    signal input player_to_move;
    signal input castling_rights;
    signal input en_passant_target;
    signal input halfmove_clock;
    signal output position_hash;

    // Declare all 68 MiMC7 instances at top scope
    component m[68];
    for (var i = 0; i < 68; i++) {
        m[i] = MiMC7(91);
    }

    // Initial state
    component h0 = MiMC7(91);
    h0.x_in <== 0;
    h0.k <== 0;

    signal state[68];

    // Step 0: absorb board[0]
    m[0].x_in <== h0.out + board[0];
    m[0].k <== 0;
    state[0] <== m[0].out;

    // Steps 1..63: absorb board[1..63]
    for (var i = 1; i < 64; i++) {
        m[i].x_in <== state[i - 1] + board[i];
        m[i].k <== 0;
        state[i] <== m[i].out;
    }

    // Step 64: absorb player_to_move
    m[64].x_in <== state[63] + player_to_move;
    m[64].k <== 0;
    state[64] <== m[64].out;

    // Step 65: absorb castling_rights
    m[65].x_in <== state[64] + castling_rights;
    m[65].k <== 0;
    state[65] <== m[65].out;

    // Step 66: absorb en_passant_target
    m[66].x_in <== state[65] + en_passant_target;
    m[66].k <== 0;
    state[66] <== m[66].out;

    // Step 67: absorb halfmove_clock
    m[67].x_in <== state[66] + halfmove_clock;
    m[67].k <== 0;
    state[67] <== m[67].out;

    position_hash <== state[67];
}
