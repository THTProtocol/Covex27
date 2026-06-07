pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";

// queen_king_castling.circom - Queen, King, and Castling validators (Covex27)

// =============================================================================
// QueenMoves - Union of bishop and rook geometry (~40 constraints)
// =============================================================================
template QueenMoves() {
    signal input abs_delta_file;
    signal input abs_delta_rank;
    signal input dest_piece;
    signal input piece_color;

    signal output is_valid;
    signal output is_capture;

    // Bishop geometry: |df| == |dr| AND |df| > 0
    component bi_eq = IsZero();
    bi_eq.in <== abs_delta_file - abs_delta_rank;
    component bi_nz = IsZero();
    bi_nz.in <== abs_delta_file;
    signal bishop_geometry;
    bishop_geometry <== bi_eq.out * (1 - bi_nz.out);

    // Rook geometry: (|df|>0,|dr|==0) OR (|df|==0,|dr|>0)
    component rk_fz = IsZero();
    rk_fz.in <== abs_delta_file;
    component rk_rz = IsZero();
    rk_rz.in <== abs_delta_rank;
    signal rook_file <== (1 - rk_fz.out) * rk_rz.out;
    signal rook_rank <== rk_fz.out * (1 - rk_rz.out);
    signal rook_geometry;
    rook_geometry <== rook_file + rook_rank;

    signal queen_geometry;
    queen_geometry <== bishop_geometry + rook_geometry;

    // Destination
    component dec = PieceDecoder();
    dec.packed <== dest_piece;
    signal dest_has_piece;
    dest_has_piece <== 1 - dec.is_empty;
    signal opposite;
    opposite <== piece_color + dec.piece_color - 2 * piece_color * dec.piece_color;
    signal dest_ok;
    dest_ok <== dec.is_empty + dest_has_piece * opposite;

    signal basic_valid <== queen_geometry * dest_ok;
    is_valid <== basic_valid;
    is_capture <== dest_has_piece * opposite;
}


// =============================================================================
// KingMoves - One step any direction (~50 constraints)
// =============================================================================
template KingMoves() {
    signal input abs_delta_file;
    signal input abs_delta_rank;
    signal input dest_piece;
    signal input piece_color;

    signal output is_valid;
    signal output is_capture;

    // |df| in {0,1}, |dr| in {0,1}, not both zero
    component iz_df0 = IsZero();
    iz_df0.in <== abs_delta_file;
    component iz_df1 = IsZero();
    iz_df1.in <== abs_delta_file - 1;
    signal valid_df;
    valid_df <== iz_df0.out + iz_df1.out;

    component iz_dr0 = IsZero();
    iz_dr0.in <== abs_delta_rank;
    component iz_dr1 = IsZero();
    iz_dr1.in <== abs_delta_rank - 1;
    signal valid_dr;
    valid_dr <== iz_dr0.out + iz_dr1.out;

    component iz_both = IsZero();
    iz_both.in <== abs_delta_file + abs_delta_rank;

    signal king_geom_tmp <== valid_df * valid_dr;
    signal king_geometry;
    king_geometry <== king_geom_tmp * (1 - iz_both.out);

    // Destination
    component dec = PieceDecoder();
    dec.packed <== dest_piece;
    signal dest_has_piece;
    dest_has_piece <== 1 - dec.is_empty;
    signal opposite;
    opposite <== piece_color + dec.piece_color - 2 * piece_color * dec.piece_color;
    signal dest_ok;
    dest_ok <== dec.is_empty + dest_has_piece * opposite;

    signal basic_valid <== king_geometry * dest_ok;
    is_valid <== basic_valid;
    is_capture <== dest_has_piece * opposite;
}


// =============================================================================
// CastlingValidator - FIDE castling rules (~350 constraints)
// =============================================================================
template CastlingValidator() {
    signal input from_square;
    signal input to_square;
    signal input player_color;          // 0=white, 1=black
    signal input castling_rights;       // 4-bit bitmap: WK|WQ|BK|BQ
    signal input squares_empty[3];
    signal input king_not_in_check;
    signal input traverse_squares_safe[2];

    signal output is_castling;
    signal output is_ks;
    signal output is_qs;
    signal output new_castling_rights;

    // --- Base rank ---
    signal base_rank;
    base_rank <== 7 * player_color;

    // --- King start and castling destinations ---
    signal king_start;
    king_start <== 4 + 8 * base_rank;
    signal king_ks;
    king_ks <== 6 + 8 * base_rank;
    signal king_qs;
    king_qs <== 2 + 8 * base_rank;

    // --- Pattern matching ---
    component iz_from = IsZero();
    iz_from.in <== from_square - king_start;

    component iz_to_ks = IsZero();
    iz_to_ks.in <== to_square - king_ks;

    signal pattern_ks <== iz_from.out * iz_to_ks.out;

    component iz_to_qs = IsZero();
    iz_to_qs.in <== to_square - king_qs;

    signal pattern_qs <== iz_from.out * iz_to_qs.out;

    // --- Castling rights bits ---
    component n2b_rights = Num2Bits(4);
    n2b_rights.in <== castling_rights;

    // has_ks_right: bit0 (white) or bit2 (black)
    // Mux: (1-c)*bit0 + c*bit2  -- split into two multiplications
    signal t_ks_w <== (1 - player_color) * n2b_rights.out[0];
    signal t_ks_b <== player_color * n2b_rights.out[2];
    signal has_ks_right;
    has_ks_right <== t_ks_w + t_ks_b;

    // has_qs_right: bit1 (white) or bit3 (black)
    signal t_qs_w <== (1 - player_color) * n2b_rights.out[1];
    signal t_qs_b <== player_color * n2b_rights.out[3];
    signal has_qs_right;
    has_qs_right <== t_qs_w + t_qs_b;

    // --- Path clearance ---
    component dec_sq0 = PieceDecoder();
    dec_sq0.packed <== squares_empty[0];
    component dec_sq1 = PieceDecoder();
    dec_sq1.packed <== squares_empty[1];
    component dec_sq2 = PieceDecoder();
    dec_sq2.packed <== squares_empty[2];

    // KS: first 2 squares must be empty
    signal ks_clear_tmp <== dec_sq0.is_empty * dec_sq1.is_empty;
    signal ks_path_clear;
    ks_path_clear <== ks_clear_tmp;

    // QS: all 3 squares must be empty
    signal qs_clear_tmp <== dec_sq0.is_empty * dec_sq1.is_empty;
    signal qs_path_clear;
    qs_path_clear <== qs_clear_tmp * dec_sq2.is_empty;

    // --- KS validity: pattern_ks * has_ks_right * ks_path_clear * king_not_in_check * traverse_squares_safe[0] ---
    signal ks_t1 <== pattern_ks * has_ks_right;
    signal ks_t2 <== ks_t1 * ks_path_clear;
    signal ks_t3 <== ks_t2 * king_not_in_check;
    signal ks_valid;
    ks_valid <== ks_t3 * traverse_squares_safe[0];

    // --- QS validity ---
    signal qs_t1 <== pattern_qs * has_qs_right;
    signal qs_t2 <== qs_t1 * qs_path_clear;
    signal qs_t3 <== qs_t2 * king_not_in_check;
    signal qs_valid;
    qs_valid <== qs_t3 * traverse_squares_safe[1];

    // --- Outputs ---
    is_ks <== ks_valid;
    is_qs <== qs_valid;
    is_castling <== ks_valid + qs_valid;

    // --- Update castling rights ---
    // After castling, clear this color's rights.
    // White (color=0): bits[0]=0, bits[1]=0, keep bits[2..3]
    // Black (color=1): bits[2]=0, bits[3]=0, keep bits[0..1]
    signal new_bit0 <== player_color * n2b_rights.out[0];  // 0 if white, keep if black
    signal new_bit1 <== player_color * n2b_rights.out[1];
    signal new_bit2 <== (1 - player_color) * n2b_rights.out[2];  // keep if white, 0 if black
    signal new_bit3 <== (1 - player_color) * n2b_rights.out[3];

    component b2n_new = Bits2Num(4);
    b2n_new.in[0] <== new_bit0;
    b2n_new.in[1] <== new_bit1;
    b2n_new.in[2] <== new_bit2;
    b2n_new.in[3] <== new_bit3;
    new_castling_rights <== b2n_new.out;
}
