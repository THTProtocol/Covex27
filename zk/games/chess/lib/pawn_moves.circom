pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";

// pawn_moves.circom - Pawn movement validator for zk chess (Covex27)
//
// Enforces ALL FIDE pawn rules:
//   - Single push: forward one square, destination empty
//   - Double push: forward two from starting rank, both squares empty
//   - Diagonal capture: forward-diagonal, destination has opponent piece
//   - En passant: diagonal capture on en passant target square
//   - Promotion: must specify valid promotion piece (1-4) when reaching last rank
//
// The board is represented as 64 squares elsewhere. This module receives
// only the relevant squares (dest, intermediate, en-passant-capturable).
//
// Output: exactly one of {is_single, is_double, is_capture, is_ep} is 1.
// is_promotion is an additional flag (set when pawn reaches last rank).
// is_valid = 1 iff the move is legal.

template PawnMoves() {
    // --- Inputs ---
    signal input dest_piece;               // packed value of destination square
    signal input intermediate_piece;       // packed value of square between from and to
    signal input en_passant_captured;      // packed value of pawn capturable en passant
    signal input pawn_color;               // 0=white, 1=black
    signal input from_file;                // 0-7
    signal input from_rank;               // 0-7
    signal input to_file;                  // 0-7
    signal input to_rank;                  // 0-7
    signal input promotion_piece;          // 0=none, 1=Q, 2=R, 3=B, 4=N

    // --- Outputs ---
    signal output is_single_push;
    signal output is_double_push;
    signal output is_capture;
    signal output is_en_passant;
    signal output is_promotion;
    signal output is_valid;

    // =====================================================================
    // Direction sign: +1 for white, -1 for black (p-1 in field)
    // =====================================================================
    signal neg_one;
    neg_one <-- 21888242871839275222246405745257275088548364400416034343698204186575808495616;
    neg_one + 1 === 0;

    signal pawn_dir;
    // white: 1 + 0*(neg_one-1) = 1. black: 1 + 1*(neg_one-1) = neg_one = -1.
    pawn_dir <== 1 + pawn_color * (neg_one - 1);

    // =====================================================================
    // Step 1: Rank delta in pawn-facing direction
    // rank_step = (to_rank - from_rank) * pawn_dir
    // Must be 1 or 2 (always positive after sign correction)
    // =====================================================================
    signal rank_step;
    rank_step <== (to_rank - from_rank) * pawn_dir;

    component iz_r1 = IsZero();
    iz_r1.in <== rank_step - 1;
    // IsZero(rank_step - 1)

    component iz_r2 = IsZero();
    iz_r2.in <== rank_step - 2;
    // IsZero(rank_step - 2)

    // =====================================================================
    // Step 2: File delta — must be 0, +1, or -1
    // =====================================================================
    signal file_step;
    file_step <== to_file - from_file;

    component iz_f0 = IsZero();
    iz_f0.in <== file_step;

    component iz_fp1 = IsZero();
    iz_fp1.in <== file_step - 1;
    // file_step - 1 == 0  →  file_step == 1

    component iz_fn1 = IsZero();
    iz_fn1.in <== file_step + 1;
    // file_step + 1 == 0  →  file_step == -1

    // =====================================================================
    // Decode contents of destination square
    // =====================================================================
    component dec_dest = PieceDecoder();
    dec_dest.packed <== dest_piece;

    // =====================================================================
    // Step 3: Single push
    //   file_step == 0 AND rank_step == 1 AND dest is empty
    // =====================================================================
    signal is_single_tmp <== iz_f0.out * iz_r1.out;
    signal is_single;
    is_single <== is_single_tmp * dec_dest.is_empty;

    // =====================================================================
    // Step 4: Double push
    //   file_step == 0 AND rank_step == 2 AND from_rank == start_rank
    //   AND intermediate_piece is empty AND dest is empty
    //
    //   start_rank: 1 for white, 6 for black = 1 + 5*pawn_color
    // =====================================================================
    signal start_rank;
    start_rank <== 1 + 5 * pawn_color;

    component dec_inter = PieceDecoder();
    dec_inter.packed <== intermediate_piece;

    signal is_double_t1 <== iz_f0.out * iz_r2.out;
    signal is_double_t2 <== dec_dest.is_empty * dec_inter.is_empty;
    signal is_double_raw;
    is_double_raw <== is_double_t1 * is_double_t2;

    // from_rank == start_rank ?
    component iz_ds = IsZero();
    iz_ds.in <== from_rank - start_rank;

    signal is_double;
    is_double <== is_double_raw * iz_ds.out;

    // =====================================================================
    // Step 5: Diagonal capture
    //   |file_step| == 1 AND rank_step == 1 AND dest has opponent piece
    // =====================================================================
    signal dest_has_piece;
    dest_has_piece <== 1 - dec_dest.is_empty;

    // dest color is opposite to pawn_color
    signal opposite_color;
    opposite_color <== pawn_color + dec_dest.piece_color - 2 * pawn_color * dec_dest.piece_color;

    // |file_step| == 1: either fp1 or fn1 (mutually exclusive for valid deltas)
    signal file_change_1;
    file_change_1 <== iz_fp1.out + iz_fn1.out;
    // Cannot be 2 simultaneously (file_step cannot be both 1 and -1 mod p)

    signal is_cap_t1 <== file_change_1 * iz_r1.out;
    signal is_cap_t2 <== dest_has_piece * opposite_color;
    signal is_diag_capture;
    is_diag_capture <== is_cap_t1 * is_cap_t2;

    // =====================================================================
    // Step 6: En passant capture
    //   |file_step| == 1 AND rank_step == 1 AND dest is empty
    //   AND en_passant_captured is an opponent pawn
    //   AND from_rank == ep_source_rank (4 for white, 3 for black)
    // =====================================================================
    component dec_ep = PieceDecoder();
    dec_ep.packed <== en_passant_captured;

    // Captured piece must be a pawn (piece_type == 1)
    component iz_ep_pawn = IsZero();
    iz_ep_pawn.in <== dec_ep.piece_type - 1;
    // piece_type - 1 == 0

    // Captured piece color must oppose pawn_color
    signal ep_opposite_color;
    ep_opposite_color <== pawn_color + dec_ep.piece_color - 2 * pawn_color * dec_ep.piece_color;

    // En passant only valid when pawn is on rank 4 (white) or 3 (black)
    // ep_source = 4 - pawn_color  → 4 for white, 3 for black
    signal ep_source;
    ep_source <== 4 - pawn_color;

    component iz_epr = IsZero();
    iz_epr.in <== from_rank - ep_source;

    signal is_ep_t1 <== file_change_1 * iz_r1.out;
    signal is_ep_t2 <== dec_dest.is_empty * iz_ep_pawn.out;
    signal is_ep_t3 <== is_ep_t1 * is_ep_t2;
    signal is_ep_raw;
    is_ep_raw <== is_ep_t3 * ep_opposite_color;

    signal is_ep;
    is_ep <== is_ep_raw * iz_epr.out;

    // =====================================================================
    // Step 7: Promotion
    //   Pawn reaches rank 7 (white) or rank 0 (black).
    //   If promoting: promotion_piece must be in [1,4].
    //   If not promoting: promotion_piece must be 0.
    // =====================================================================
    signal last_rank;
    last_rank <== 7 - 7 * pawn_color;
    // white: 7-0=7, black: 7-7=0

    component iz_last = IsZero();
    iz_last.in <== to_rank - last_rank;

    // promotion_piece in [0,4]
    component n2b_pp = Num2Bits(3);
    n2b_pp.in <== promotion_piece;
    // Reject values 5,6,7: if bit[2] is 1, both bit[1] and bit[0] must be 0
    n2b_pp.out[2] * n2b_pp.out[1] === 0;
    n2b_pp.out[2] * n2b_pp.out[0] === 0;
    // This allows: 0,1,2,3,4 and rejects 5(101), 6(110), 7(111).

    // Enforce: iz_last + IsZero(promotion_piece) == 1
    // This means: if promoting, pp != 0; if not promoting, pp == 0.
    component iz_pp = IsZero();
    iz_pp.in <== promotion_piece;
    iz_last.out + iz_pp.out === 1;

    is_promotion <== iz_last.out;

    // =====================================================================
    // Step 8: Mutual exclusion + validity gate
    //   Exactly one move type must be active, AND rank/file deltas valid.
    // =====================================================================
    signal move_sum;
    move_sum <== is_single + is_double + is_diag_capture + is_ep;

    component iz_exact = IsZero();
    iz_exact.in <== move_sum - 1;
    // move_sum - 1 == 0

    signal valid_rank;
    valid_rank <== iz_r1.out + iz_r2.out;
    // 1 if rank_step is 1 or 2, 0 otherwise. Cannot be 2.

    signal valid_file;
    valid_file <== iz_f0.out + iz_fp1.out + iz_fn1.out;
    // 1 if file_step is 0, +1, or -1. Cannot be >1.

    signal is_valid_tmp <== iz_exact.out * valid_rank;
    is_valid <== is_valid_tmp * valid_file;

    // --- Output assignments ---
    is_single_push <== is_single;
    is_double_push <== is_double;
    is_capture <== is_diag_capture;
    is_en_passant <== is_ep;
}
