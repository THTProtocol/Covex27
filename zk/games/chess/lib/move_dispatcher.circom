pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";
include "../lib/square_utils.circom";
include "../lib/pawn_moves.circom";
include "../lib/piece_moves_kbr.circom";
include "../lib/queen_king_castling.circom";

// move_dispatcher.circom - Unified move validation for zk chess (Covex27)

template MoveDispatcher() {
    // --- Inputs ---
    signal input board[64];
    signal input from_square;
    signal input to_square;
    signal input promotion_piece;
    signal input player_to_move;
    signal input en_passant_target;
    signal input castling_rights;
    signal input king_not_in_check;
    signal input traverse_squares_safe[2];
    signal input path_is_intermediate[7];
    signal input path_pieces[7];
    signal input intermediate_piece;
    signal input en_passant_captured;
    signal input castling_empty_squares[3];

    // --- Outputs ---
    signal output is_valid_move;
    signal output is_capture;
    signal output is_en_passant;
    signal output is_promotion;
    signal output is_castling;
    signal output is_ks;
    signal output is_qs;
    signal output new_castling_rights;

    // === ALL COMPONENT ARRAYS — TOP SCOPE ===
    component from_eq[64];
    component to_eq[64];
    component dec_all[64];

    for (var i = 0; i < 64; i++) {
        from_eq[i] = IsZero();
        to_eq[i] = IsZero();
        dec_all[i] = PieceDecoder();
    }

    // === Step 1: Wire equality matchers and decoders ===
    for (var i = 0; i < 64; i++) {
        from_eq[i].in <== i - from_square;
        to_eq[i].in <== i - to_square;
        dec_all[i].packed <== board[i];
    }

    // === Step 2: Mux-accumulate from_square piece type/color ===
    signal from_type_acc[64];
    signal from_color_acc[64];
    from_type_acc[0] <== from_eq[0].out * dec_all[0].piece_type;
    from_color_acc[0] <== from_eq[0].out * dec_all[0].piece_color;
    for (var i = 1; i < 64; i++) {
        from_type_acc[i] <== from_type_acc[i-1] + from_eq[i].out * dec_all[i].piece_type;
        from_color_acc[i] <== from_color_acc[i-1] + from_eq[i].out * dec_all[i].piece_color;
    }
    signal piece_type;
    signal piece_color;
    piece_type <== from_type_acc[63];
    piece_color <== from_color_acc[63];

    // === Step 3: Mux-accumulate dest_piece ===
    signal dest_acc[64];
    dest_acc[0] <== to_eq[0].out * board[0];
    for (var i = 1; i < 64; i++) {
        dest_acc[i] <== dest_acc[i-1] + to_eq[i].out * board[i];
    }
    signal dest_piece;
    dest_piece <== dest_acc[63];

    // === Step 4: Basic sanity checks ===
    component iz_empty = IsZero();
    iz_empty.in <== piece_type;
    signal not_empty <== 1 - iz_empty.out;
    signal color_match <== 1 - piece_color - player_to_move + 2 * piece_color * player_to_move;

    // === Step 5: Deltas ===
    component ds = DeltaSquares();
    ds.from_square <== from_square;
    ds.to_square <== to_square;

    component stc_from = SquareToCoord();
    stc_from.square <== from_square;
    component stc_to = SquareToCoord();
    stc_to.square <== to_square;

    // === Step 6: Piece validators ===
    component pawn = PawnMoves();
    pawn.dest_piece <== dest_piece;
    pawn.intermediate_piece <== intermediate_piece;
    pawn.en_passant_captured <== en_passant_captured;
    pawn.pawn_color <== piece_color;
    pawn.from_file <== stc_from.file;
    pawn.from_rank <== stc_from.rank;
    pawn.to_file <== stc_to.file;
    pawn.to_rank <== stc_to.rank;
    pawn.promotion_piece <== promotion_piece;

    component knight = KnightMoves();
    knight.abs_delta_file <== ds.abs_delta_file;
    knight.abs_delta_rank <== ds.abs_delta_rank;
    knight.dest_piece <== dest_piece;
    knight.piece_color <== piece_color;

    component bishop = BishopMoves();
    bishop.abs_delta_file <== ds.abs_delta_file;
    bishop.abs_delta_rank <== ds.abs_delta_rank;
    bishop.dest_piece <== dest_piece;
    bishop.piece_color <== piece_color;

    component rook = RookMoves();
    rook.abs_delta_file <== ds.abs_delta_file;
    rook.abs_delta_rank <== ds.abs_delta_rank;
    rook.dest_piece <== dest_piece;
    rook.piece_color <== piece_color;

    component queen = QueenMoves();
    queen.abs_delta_file <== ds.abs_delta_file;
    queen.abs_delta_rank <== ds.abs_delta_rank;
    queen.dest_piece <== dest_piece;
    queen.piece_color <== piece_color;

    component king = KingMoves();
    king.abs_delta_file <== ds.abs_delta_file;
    king.abs_delta_rank <== ds.abs_delta_rank;
    king.dest_piece <== dest_piece;
    king.piece_color <== piece_color;

    component cs = CastlingValidator();
    cs.from_square <== from_square;
    cs.to_square <== to_square;
    cs.player_color <== piece_color;
    cs.castling_rights <== castling_rights;
    cs.squares_empty[0] <== castling_empty_squares[0];
    cs.squares_empty[1] <== castling_empty_squares[1];
    cs.squares_empty[2] <== castling_empty_squares[2];
    cs.king_not_in_check <== king_not_in_check;
    cs.traverse_squares_safe[0] <== traverse_squares_safe[0];
    cs.traverse_squares_safe[1] <== traverse_squares_safe[1];

    component pc = PathClearance();
    pc.is_intermediate <== path_is_intermediate;
    pc.path_pieces <== path_pieces;

    // === Step 7: Piece-type matchers ===
    component iz_pawn_t = IsZero();
    iz_pawn_t.in <== piece_type - 1;
    component iz_knight_t = IsZero();
    iz_knight_t.in <== piece_type - 2;
    component iz_bishop_t = IsZero();
    iz_bishop_t.in <== piece_type - 3;
    component iz_rook_t = IsZero();
    iz_rook_t.in <== piece_type - 4;
    component iz_queen_t = IsZero();
    iz_queen_t.in <== piece_type - 5;
    component iz_king_t = IsZero();
    iz_king_t.in <== piece_type - 6;

    signal is_pawn <== iz_pawn_t.out;
    signal is_knight <== iz_knight_t.out;
    signal is_bishop <== iz_bishop_t.out;
    signal is_rook <== iz_rook_t.out;
    signal is_queen <== iz_queen_t.out;
    signal is_king <== iz_king_t.out;

    // === Step 8: Mux results ===
    signal base_valid <== is_pawn * pawn.is_valid
                       + is_knight * knight.is_valid
                       + is_bishop * bishop.is_valid
                       + is_rook * rook.is_valid
                       + is_queen * queen.is_valid
                       + is_king * king.is_valid;

    signal needs_path;
    needs_path <== is_bishop + is_rook + is_queen;

    // path_ok = 1 - needs_path + needs_path*pc.path_clear
    signal path_ok <== (1 - needs_path) + needs_path * pc.path_clear;

    signal king_valid <== is_king * king.is_valid;
    // King moving (not castling): king.is_valid=1 AND cs not activated
    signal king_move_ok <== king_valid * (1 - cs.is_castling);
    // Castling: cs.is_castling AND piece is king
    signal cs_ok <== is_king * cs.is_castling;

    signal piece_valid <== (1 - is_king) * base_valid * path_ok  // non-king pieces
                        + king_move_ok                           // king normal move
                        + cs_ok;                                 // castling

    signal move_valid <== not_empty * color_match * piece_valid;

    // === Step 9: Capture ===
    signal is_capture_out <== is_pawn * pawn.is_capture
                           + is_knight * knight.is_capture
                           + is_bishop * bishop.is_capture
                           + is_rook * rook.is_capture
                           + is_queen * queen.is_capture
                           + is_king * king.is_capture;

    // === Step 10: Outputs ===
    is_valid_move <== move_valid;
    is_capture <== is_capture_out;
    is_en_passant <== is_pawn * pawn.is_en_passant;
    is_promotion <== is_pawn * pawn.is_promotion;
    is_castling <== is_king * cs.is_castling;
    is_ks <== is_king * cs.is_ks;
    is_qs <== is_king * cs.is_qs;
    // Castling rights: cleared if castling happened
    signal t_cs_clear <== cs.is_castling * cs.new_castling_rights;
    signal t_cs_keep <== (1 - cs.is_castling) * castling_rights;
    new_castling_rights <== t_cs_clear + t_cs_keep;
}
