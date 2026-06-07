pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";

// board_update.circom - State transition for zk chess (Covex27)
//
// All component arrays declared at top scope. Wiring in loops.

template BoardUpdater() {
    signal input old_board[64];
    signal input from_square;
    signal input to_square;
    signal input promotion_piece;
    signal input player_to_move;
    signal input is_capture;
    signal input is_en_passant;
    signal input is_promotion;
    signal input en_passant_captured_square;
    signal input new_ep_target;
    signal input old_halfmove_clock;

    signal output new_board[64];
    signal output new_en_passant_target;
    signal output new_halfmove_clock;

    // --- Component arrays: decoders + eq checkers ---
    component dec[64];
    component from_eq[64];
    component to_eq[64];
    component ep_eq[64];

    for (var i = 0; i < 64; i++) {
        dec[i] = PieceDecoder();
        from_eq[i] = IsZero();
        to_eq[i] = IsZero();
        ep_eq[i] = IsZero();
    }

    // Wiring: decoders
    for (var i = 0; i < 64; i++) {
        dec[i].packed <== old_board[i];
    }

    // Wiring: equality checkers
    for (var i = 0; i < 64; i++) {
        from_eq[i].in <== i - from_square;
        to_eq[i].in <== i - to_square;
        ep_eq[i].in <== i - en_passant_captured_square;
    }

    // --- Extract decoded type/color per square ---
    signal old_type[64];
    signal old_color[64];
    for (var i = 0; i < 64; i++) {
        old_type[i] <== dec[i].piece_type;
        old_color[i] <== dec[i].piece_color;
    }

    // --- Mux-accumulate: moving piece type/color ---
    signal type_acc[64];
    signal color_acc[64];
    type_acc[0] <== from_eq[0].out * old_type[0];
    color_acc[0] <== from_eq[0].out * old_color[0];
    for (var i = 1; i < 64; i++) {
        type_acc[i] <== type_acc[i-1] + from_eq[i].out * old_type[i];
        color_acc[i] <== color_acc[i-1] + from_eq[i].out * old_color[i];
    }
    signal moving_piece_type;
    signal moving_piece_color;
    moving_piece_type <== type_acc[63];
    moving_piece_color <== color_acc[63];

    // --- New piece (promotion) ---
    signal t_promo <== is_promotion * promotion_piece;
    signal t_orig <== (1 - is_promotion) * moving_piece_type;
    signal new_piece_type <== t_promo + t_orig;
    signal new_piece <== new_piece_type + 8 * moving_piece_color;

    // --- Build new board via per-square mux ---
    signal ep_flag[64];
    signal is_modified[64];
    signal t_to_piece[64];
    signal t_old_piece[64];
    for (var i = 0; i < 64; i++) {
        ep_flag[i] <== is_en_passant * ep_eq[i].out;
        is_modified[i] <== to_eq[i].out + from_eq[i].out + ep_flag[i];
        t_to_piece[i] <== to_eq[i].out * new_piece;
        t_old_piece[i] <== (1 - is_modified[i]) * old_board[i];
        new_board[i] <== t_to_piece[i] + t_old_piece[i];
    }

    // --- En passant target ---
    new_en_passant_target <== new_ep_target;

    // --- Halfmove clock ---
    component iz_pawn = IsZero();
    iz_pawn.in <== moving_piece_type - 1;
    signal is_pawn;
    is_pawn <== iz_pawn.out;

    signal reset_clock;
    reset_clock <== is_pawn + is_capture;

    component iz_reset = IsZero();
    iz_reset.in <== reset_clock;
    signal do_increment;
    do_increment <== 1 - iz_reset.out;

    signal t_inc <== do_increment * (old_halfmove_clock + 1);
    new_halfmove_clock <== t_inc;
}
