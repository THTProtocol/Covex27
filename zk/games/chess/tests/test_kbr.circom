pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../lib/piece_codec.circom";
include "../lib/piece_moves_kbr.circom";

// test_kbr.circom - Unit tests for Knight, Bishop, Rook, PathClearance

template TestKBR() {
    // --- Knight inputs ---
    signal input kn_adf;    signal input kn_adr;
    signal input kn_dest;   signal input kn_color;

    // --- Bishop inputs ---
    signal input bi_adf;    signal input bi_adr;
    signal input bi_dest;   signal input bi_color;

    // --- Rook inputs ---
    signal input rk_adf;    signal input rk_adr;
    signal input rk_dest;   signal input rk_color;

    // --- PathClearance inputs ---
    signal input pc_inter[7];
    signal input pc_pieces[7];

    // --- Outputs ---
    signal output kn_valid; signal output kn_cap;
    signal output bi_valid; signal output bi_cap;
    signal output rk_valid; signal output rk_cap;
    signal output pc_clear;

    component knight = KnightMoves();
    knight.abs_delta_file <== kn_adf;
    knight.abs_delta_rank <== kn_adr;
    knight.dest_piece <== kn_dest;
    knight.piece_color <== kn_color;
    kn_valid <== knight.is_valid;
    kn_cap <== knight.is_capture;

    component bishop = BishopMoves();
    bishop.abs_delta_file <== bi_adf;
    bishop.abs_delta_rank <== bi_adr;
    bishop.dest_piece <== bi_dest;
    bishop.piece_color <== bi_color;
    bi_valid <== bishop.is_valid;
    bi_cap <== bishop.is_capture;

    component rook = RookMoves();
    rook.abs_delta_file <== rk_adf;
    rook.abs_delta_rank <== rk_adr;
    rook.dest_piece <== rk_dest;
    rook.piece_color <== rk_color;
    rk_valid <== rook.is_valid;
    rk_cap <== rook.is_capture;

    component pc = PathClearance();
    pc.is_intermediate <== pc_inter;
    pc.path_pieces <== pc_pieces;
    pc_clear <== pc.path_clear;
}

component main = TestKBR();
