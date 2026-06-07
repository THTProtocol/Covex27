pragma circom 2.0.0;

include "../lib/piece_codec.circom";
include "../lib/queen_king_castling.circom";

// test_qkc.circom - Unit tests for Queen, King, Castling validators

template TestQKC() {
    // Queen inputs
    signal input qn_adf;
    signal input qn_adr;
    signal input qn_dest;
    signal input qn_color;

    // King inputs
    signal input kg_adf;
    signal input kg_adr;
    signal input kg_dest;
    signal input kg_color;

    // Castling inputs
    signal input cs_from;
    signal input cs_to;
    signal input cs_color;
    signal input cs_rights;
    signal input cs_sq[3];
    signal input cs_king_safe;
    signal input cs_trav[2];

    // Outputs
    signal output qn_valid;
    signal output qn_cap;
    signal output kg_valid;
    signal output kg_cap;
    signal output cs_castling;
    signal output cs_ks;
    signal output cs_qs;
    signal output cs_new_rights;

    component queen = QueenMoves();
    queen.abs_delta_file <== qn_adf;
    queen.abs_delta_rank <== qn_adr;
    queen.dest_piece <== qn_dest;
    queen.piece_color <== qn_color;
    qn_valid <== queen.is_valid;
    qn_cap <== queen.is_capture;

    component king = KingMoves();
    king.abs_delta_file <== kg_adf;
    king.abs_delta_rank <== kg_adr;
    king.dest_piece <== kg_dest;
    king.piece_color <== kg_color;
    kg_valid <== king.is_valid;
    kg_cap <== king.is_capture;

    component castling = CastlingValidator();
    castling.from_square <== cs_from;
    castling.to_square <== cs_to;
    castling.player_color <== cs_color;
    castling.castling_rights <== cs_rights;
    castling.squares_empty[0] <== cs_sq[0];
    castling.squares_empty[1] <== cs_sq[1];
    castling.squares_empty[2] <== cs_sq[2];
    castling.king_not_in_check <== cs_king_safe;
    castling.traverse_squares_safe[0] <== cs_trav[0];
    castling.traverse_squares_safe[1] <== cs_trav[1];
    cs_castling <== castling.is_castling;
    cs_ks <== castling.is_ks;
    cs_qs <== castling.is_qs;
    cs_new_rights <== castling.new_castling_rights;
}

component main = TestQKC();
