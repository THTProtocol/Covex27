pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../lib/piece_codec.circom";
include "../lib/pawn_moves.circom";

// test_pawn.circom - Comprehensive pawn move test circuit
//
// Tests every pawn scenario:
//   Single push, double push, diagonal capture, en passant, promotion
//   All verified via witness signals.

template TestPawnMoves() {
    signal input dest_piece;
    signal input intermediate_piece;
    signal input en_passant_captured;
    signal input pawn_color;
    signal input from_file;
    signal input from_rank;
    signal input to_file;
    signal input to_rank;
    signal input promotion_piece;

    signal output is_single_push;
    signal output is_double_push;
    signal output is_capture;
    signal output is_en_passant;
    signal output is_promotion;
    signal output is_valid;

    component pm = PawnMoves();
    pm.dest_piece <== dest_piece;
    pm.intermediate_piece <== intermediate_piece;
    pm.en_passant_captured <== en_passant_captured;
    pm.pawn_color <== pawn_color;
    pm.from_file <== from_file;
    pm.from_rank <== from_rank;
    pm.to_file <== to_file;
    pm.to_rank <== to_rank;
    pm.promotion_piece <== promotion_piece;

    is_single_push <== pm.is_single_push;
    is_double_push <== pm.is_double_push;
    is_capture <== pm.is_capture;
    is_en_passant <== pm.is_en_passant;
    is_promotion <== pm.is_promotion;
    is_valid <== pm.is_valid;
}

component main = TestPawnMoves();
