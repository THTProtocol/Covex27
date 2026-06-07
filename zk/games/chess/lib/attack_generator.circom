pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";
include "../lib/square_utils.circom";
include "../lib/board_lookup.circom";

// Witnessed attack verification: chess.js supplies all attacker squares;
// circuit verifies each listed square truly attacks the target.

template PieceAttacksTarget() {
    signal input from_square;
    signal input target_square;
    signal input piece_type;
    signal output attacks;

    component delta = DeltaSquares();
    delta.from_square <== from_square;
    delta.to_square <== target_square;

    component from_coord = SquareToCoord();
    from_coord.square <== from_square;
    component to_coord = SquareToCoord();
    to_coord.square <== target_square;

    component iz_pt = IsZero();
    iz_pt.in <== piece_type - 1;
    component iz_pdf = IsZero();
    iz_pdf.in <== delta.abs_delta_file - 1;
    signal pawn_dr;
    pawn_dr <== to_coord.rank - from_coord.rank;
    component iz_pdr_w = IsZero();
    iz_pdr_w.in <== pawn_dr - 1;
    component iz_pdr_b = IsZero();
    iz_pdr_b.in <== pawn_dr + 1;
    signal pawn_pat;
    pawn_pat <== iz_pdr_w.out + iz_pdr_b.out;
    signal pawn_tmp;
    pawn_tmp <== iz_pdf.out * pawn_pat;
    signal pawn_attack;
    pawn_attack <== iz_pt.out * pawn_tmp;

    component iz_nt = IsZero();
    iz_nt.in <== piece_type - 2;
    component iz_adf1 = IsZero();
    iz_adf1.in <== delta.abs_delta_file - 1;
    component iz_adr2 = IsZero();
    iz_adr2.in <== delta.abs_delta_rank - 2;
    component iz_adf2 = IsZero();
    iz_adf2.in <== delta.abs_delta_file - 2;
    component iz_adr1 = IsZero();
    iz_adr1.in <== delta.abs_delta_rank - 1;
    signal knight_p1;
    knight_p1 <== iz_adf1.out * iz_adr2.out;
    signal knight_p2;
    knight_p2 <== iz_adf2.out * iz_adr1.out;
    signal knight_pat;
    knight_pat <== knight_p1 + knight_p2;
    signal knight_attack;
    knight_attack <== iz_nt.out * knight_pat;

    component iz_bt = IsZero();
    iz_bt.in <== piece_type - 3;
    component iz_diag = IsZero();
    iz_diag.in <== delta.abs_delta_file - delta.abs_delta_rank;
    component iz_nz = IsZero();
    iz_nz.in <== delta.abs_delta_file;
    signal bishop_geom;
    bishop_geom <== iz_diag.out * (1 - iz_nz.out);
    signal bishop_attack;
    bishop_attack <== iz_bt.out * bishop_geom;

    component iz_rt = IsZero();
    iz_rt.in <== piece_type - 4;
    component iz_rf = IsZero();
    iz_rf.in <== delta.abs_delta_file;
    component iz_rr = IsZero();
    iz_rr.in <== delta.abs_delta_rank;
    signal rook_file;
    rook_file <== (1 - iz_rf.out) * iz_rr.out;
    signal rook_rank;
    rook_rank <== iz_rf.out * (1 - iz_rr.out);
    signal rook_geom;
    rook_geom <== rook_file + rook_rank;
    signal rook_attack;
    rook_attack <== iz_rt.out * rook_geom;

    component iz_qt = IsZero();
    iz_qt.in <== piece_type - 5;
    signal queen_geom;
    queen_geom <== bishop_geom + rook_geom;
    signal queen_attack;
    queen_attack <== iz_qt.out * queen_geom;

    component iz_kt = IsZero();
    iz_kt.in <== piece_type - 6;
    component iz_kdf0 = IsZero();
    iz_kdf0.in <== delta.abs_delta_file;
    component iz_kdf1 = IsZero();
    iz_kdf1.in <== delta.abs_delta_file - 1;
    signal king_df;
    king_df <== iz_kdf0.out + iz_kdf1.out;
    component iz_kdr0 = IsZero();
    iz_kdr0.in <== delta.abs_delta_rank;
    component iz_kdr1 = IsZero();
    iz_kdr1.in <== delta.abs_delta_rank - 1;
    signal king_dr;
    king_dr <== iz_kdr0.out + iz_kdr1.out;
    component iz_both = IsZero();
    iz_both.in <== delta.abs_delta_file + delta.abs_delta_rank;
    signal king_tmp;
    king_tmp <== king_df * king_dr;
    signal king_geom;
    king_geom <== king_tmp * (1 - iz_both.out);
    signal king_attack;
    king_attack <== iz_kt.out * king_geom;

    signal sum_a;
    sum_a <== pawn_attack + knight_attack;
    signal sum_b;
    sum_b <== bishop_attack + rook_attack;
    signal sum_c;
    sum_c <== queen_attack + king_attack;
    signal sum_ab;
    sum_ab <== sum_a + sum_b;
    attacks <== sum_ab + sum_c;
}

template WitnessedAttackCheck() {
    signal input board[64];
    signal input target_square;
    signal input attacker_color;
    signal input witness_squares[12];
    signal input witness_active[12];
    signal output attacked;

    component lookup[12];
    component dec[12];
    component atk[12];
    signal verified[12];
    signal color_match[12];
    signal active_piece[12];
    signal active_tmp[12];
    for (var i = 0; i < 12; i++) {
        lookup[i] = BoardLookup();
        dec[i] = PieceDecoder();
        atk[i] = PieceAttacksTarget();
    }
    for (var i = 0; i < 12; i++) {
        lookup[i].board <== board;
        lookup[i].square <== witness_squares[i];
        dec[i].packed <== lookup[i].piece;
        atk[i].from_square <== witness_squares[i];
        atk[i].target_square <== target_square;
        atk[i].piece_type <== dec[i].piece_type;
        color_match[i] <== 1 - dec[i].piece_color - attacker_color + 2 * dec[i].piece_color * attacker_color;
        active_tmp[i] <== witness_active[i] * (1 - dec[i].is_empty);
        active_piece[i] <== active_tmp[i] * color_match[i];
        verified[i] <== active_piece[i] * atk[i].attacks;
    }

    signal total[12];
    total[0] <== verified[0];
    for (var i = 1; i < 12; i++) {
        total[i] <== total[i - 1] + verified[i];
    }
    component gt = GreaterThan(4);
    gt.in[0] <== total[11];
    gt.in[1] <== 0;
    attacked <== gt.out;
}