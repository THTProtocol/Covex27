pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";

// piece_moves_kbr.circom - Knight, Bishop, Rook validators (Covex27)
//
// Each template checks piece-specific move geometry and destination rules.
// Path clearance (for bishop/rook) is handled by MoveDispatcher using
// the standalone PathClearance template.

// =============================================================================
// KnightMoves - L-shape move (no path clearance)
// =============================================================================
// Knight pattern: (|df|,|dr|) in {(1,2), (2,1)}
// Destination: empty or opponent piece
//
// Constraint count: ~50
// =============================================================================
template KnightMoves() {
    signal input abs_delta_file;   // 0-7, pre-computed by DeltaSquares
    signal input abs_delta_rank;   // 0-7
    signal input dest_piece;       // packed encoding of destination square
    signal input piece_color;      // 0=white, 1=black

    signal output is_valid;        // 1 if knight can move here
    signal output is_capture;      // 1 if capturing opponent piece

    // --- Check knight geometry: (1,2) or (2,1) ---
    component iz_adf1 = IsZero();
    iz_adf1.in <== abs_delta_file - 1;

    component iz_adr2 = IsZero();
    iz_adr2.in <== abs_delta_rank - 2;

    component iz_adf2 = IsZero();
    iz_adf2.in <== abs_delta_file - 2;

    component iz_adr1 = IsZero();
    iz_adr1.in <== abs_delta_rank - 1;

    signal pat1 <== iz_adf1.out * iz_adr2.out;  // (1,2)
    signal pat2 <== iz_adf2.out * iz_adr1.out;  // (2,1)
    signal knight_geometry;
    knight_geometry <== pat1 + pat2;

    // --- Destination check: empty or opponent ---
    component dec = PieceDecoder();
    dec.packed <== dest_piece;

    signal dest_has_piece;
    dest_has_piece <== 1 - dec.is_empty;

    signal opposite;
    opposite <== piece_color + dec.piece_color - 2 * piece_color * dec.piece_color;

    signal dest_ok;
    dest_ok <== dec.is_empty + dest_has_piece * opposite;

    signal valid_tmp <== knight_geometry * dest_ok;

    is_valid <== valid_tmp;
    is_capture <== dest_has_piece * opposite;
}


// =============================================================================
// PathClearance - Verify intermediate squares are empty along a ray
// =============================================================================
// Accepts: an array of 7 packed piece values along the ray (from + k*step),
// and an array of 7 flags indicating which squares are intermediate (vs destination).
//
// For each intermediate square: is_intermediate[k] * (1 - is_empty) == 0
// i.e., if it's intermediate, it MUST be empty.
// If it's the destination (or beyond), no constraint.
//
// Inputs:
//   is_intermediate[7]  - 1 if square k is between from and dest (exclusive)
//   path_pieces[7]      - packed piece at each square along the ray
//
// Outputs:
//   path_clear          - always 1 (constraints fail if path blocked)
//
// Constraint count: ~120
// =============================================================================
template PathClearance() {
    signal input is_intermediate[7];
    signal input path_pieces[7];
    signal output path_clear;

    // Unrolled 7-step path clearance (component decl not allowed in for loops)
    component dec0 = PieceDecoder();
    dec0.packed <== path_pieces[0];
    is_intermediate[0] * (1 - dec0.is_empty) === 0;

    component dec1 = PieceDecoder();
    dec1.packed <== path_pieces[1];
    is_intermediate[1] * (1 - dec1.is_empty) === 0;

    component dec2 = PieceDecoder();
    dec2.packed <== path_pieces[2];
    is_intermediate[2] * (1 - dec2.is_empty) === 0;

    component dec3 = PieceDecoder();
    dec3.packed <== path_pieces[3];
    is_intermediate[3] * (1 - dec3.is_empty) === 0;

    component dec4 = PieceDecoder();
    dec4.packed <== path_pieces[4];
    is_intermediate[4] * (1 - dec4.is_empty) === 0;

    component dec5 = PieceDecoder();
    dec5.packed <== path_pieces[5];
    is_intermediate[5] * (1 - dec5.is_empty) === 0;

    component dec6 = PieceDecoder();
    dec6.packed <== path_pieces[6];
    is_intermediate[6] * (1 - dec6.is_empty) === 0;

    path_clear <== 1;
}


// =============================================================================
// BishopMoves - Diagonal movement
// =============================================================================
// Bishop pattern: |df| == |dr| AND |df| > 0
// Destination: empty or opponent piece
//
// Path clearance is NOT handled here — MoveDispatcher wires PathClearance.
//
// Constraint count: ~60
// =============================================================================
template BishopMoves() {
    signal input abs_delta_file;     // 0-7
    signal input abs_delta_rank;     // 0-7
    signal input dest_piece;         // packed
    signal input piece_color;        // 0 or 1

    signal output is_valid;          // 1 if bishop geometry + dest both OK
    signal output is_capture;

    // --- Bishop geometry: |df| == |dr| AND |df| > 0 ---
    component iz_eq = IsZero();
    iz_eq.in <== abs_delta_file - abs_delta_rank;

    component iz_zero = IsZero();
    iz_zero.in <== abs_delta_file;

    signal bishop_geometry;
    bishop_geometry <== iz_eq.out * (1 - iz_zero.out);

    // --- Destination check ---
    component dec = PieceDecoder();
    dec.packed <== dest_piece;

    signal dest_has_piece;
    dest_has_piece <== 1 - dec.is_empty;

    signal opposite;
    opposite <== piece_color + dec.piece_color - 2 * piece_color * dec.piece_color;

    signal dest_ok;
    dest_ok <== dec.is_empty + dest_has_piece * opposite;

    signal basic_valid <== bishop_geometry * dest_ok;

    is_valid <== basic_valid;
    is_capture <== dest_has_piece * opposite;
}


// =============================================================================
// RookMoves - Orthogonal movement
// =============================================================================
// Rook pattern: (|df| > 0 AND |dr| == 0) OR (|dr| > 0 AND |df| == 0)
// Destination: empty or opponent
//
// Constraint count: ~60
// =============================================================================
template RookMoves() {
    signal input abs_delta_file;     // 0-7
    signal input abs_delta_rank;     // 0-7
    signal input dest_piece;         // packed
    signal input piece_color;        // 0 or 1

    signal output is_valid;
    signal output is_capture;

    // --- Rook geometry: file-only OR rank-only, not both zero ---
    component iz_f = IsZero();
    iz_f.in <== abs_delta_file;

    component iz_r = IsZero();
    iz_r.in <== abs_delta_rank;

    signal file_move <== (1 - iz_f.out) * iz_r.out;  // |df|>0, |dr|==0
    signal rank_move <== iz_f.out * (1 - iz_r.out);  // |df|==0, |dr|>0

    signal rook_geometry;
    rook_geometry <== file_move + rank_move;

    // --- Destination check ---
    component dec = PieceDecoder();
    dec.packed <== dest_piece;

    signal dest_has_piece;
    dest_has_piece <== 1 - dec.is_empty;

    signal opposite;
    opposite <== piece_color + dec.piece_color - 2 * piece_color * dec.piece_color;

    signal dest_ok;
    dest_ok <== dec.is_empty + dest_has_piece * opposite;

    signal basic_valid <== rook_geometry * dest_ok;

    is_valid <== basic_valid;
    is_capture <== dest_has_piece * opposite;
}
