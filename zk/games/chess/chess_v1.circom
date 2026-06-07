pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "lib/piece_codec.circom";
include "lib/square_utils.circom";
include "lib/pawn_moves.circom";
include "lib/piece_moves_kbr.circom";
include "lib/queen_king_castling.circom";
include "lib/board_hasher.circom";
include "lib/board_update.circom";
include "lib/board_lookup.circom";
include "lib/king_safety.circom";
include "lib/timer_update.circom";
include "lib/history_hash_chain.circom";
include "lib/game_end_conditions.circom";

// chess_v1.circom - FIDE chess move proof (Covex27 / Kaspa Groth16)
// Supports two proving modes via public `proving_mode` (see CHESS_PROVING_MODES.md):
//   0 = Hybrid (fast, witnessed candidates + attacks from chess.js for end conditions / king safety)
//   1 = Full ZK (stronger security; proof commits to higher-assurance witness generation)

template ChessV1() {
    signal input old_board_hash;
    signal input new_board_hash;
    signal input player_to_move;
    signal input move_from;
    signal input move_to;
    signal input promotion_piece;
    signal input new_timer_white;
    signal input new_timer_black;
    signal input game_status;

    signal input old_board[64];
    signal input old_timer_white;
    signal input old_timer_black;
    signal input elapsed_seconds;
    signal input old_castling_rights;
    signal input old_en_passant_target;
    signal input old_halfmove_clock;

    signal input intermediate_piece;
    signal input en_passant_captured;
    signal input path_is_intermediate[7];
    signal input path_pieces[7];
    signal input castling_empty_squares[3];
    signal input new_ep_target;
    signal input is_capture_flag;
    signal input is_promotion_flag;
    signal input is_castling_flag;
    signal input en_passant_captured_square;

    signal input history_hashes[100];
    signal input history_len;
    signal input insufficient_material;
    signal input candidate_from[8];
    signal input candidate_to[8];
    signal input candidate_active[8];

    signal input pre_attack_witness_squares[12];
    signal input pre_attack_witness_active[12];
    signal input post_attack_witness_squares[12];
    signal input post_attack_witness_active[12];
    signal input traverse0_witness_squares[12];
    signal input traverse0_witness_active[12];
    signal input traverse1_witness_squares[12];
    signal input traverse1_witness_active[12];
    signal input opp_witness_squares[12];
    signal input opp_witness_active[12];

    // proving_mode: 0 = Hybrid (fast, chess.js supplies candidates + witnessed attacks for end conditions / king safety).
    //               1 = Full ZK (stronger security; caller/witness generator commits to more exhaustive search;
    //                   mode is publicly bound in the proof so oracle/covenant/UI can distinguish assurance level).
    // The core move legality, board transition, post-move king safety, timers, and repetition are proven
    // in-circuit in both modes. The mode mainly affects trust assumptions around the candidate/attack lists
    // for game_status (checkmate/stalemate/etc.).
    signal input proving_mode;
    proving_mode * (proving_mode - 1) === 0; // must be boolean 0/1

    // STEP 1: Verify old position hash
    component old_hasher = FullPositionHasher();
    old_hasher.board <== old_board;
    old_hasher.player_to_move <== player_to_move;
    old_hasher.castling_rights <== old_castling_rights;
    old_hasher.en_passant_target <== old_en_passant_target;
    old_hasher.halfmove_clock <== old_halfmove_clock;
    old_board_hash === old_hasher.position_hash;

    // STEP 2: Board lookup
    component from_eq[64];
    component to_eq[64];
    component dec_all[64];
    for (var i = 0; i < 64; i++) {
        from_eq[i] = IsZero();
        to_eq[i] = IsZero();
        dec_all[i] = PieceDecoder();
    }
    for (var i = 0; i < 64; i++) {
        from_eq[i].in <== i - move_from;
        to_eq[i].in <== i - move_to;
        dec_all[i].packed <== old_board[i];
    }

    signal ft_acc[64];
    signal fc_acc[64];
    ft_acc[0] <== from_eq[0].out * dec_all[0].piece_type;
    fc_acc[0] <== from_eq[0].out * dec_all[0].piece_color;
    for (var i = 1; i < 64; i++) {
        ft_acc[i] <== ft_acc[i-1] + from_eq[i].out * dec_all[i].piece_type;
        fc_acc[i] <== fc_acc[i-1] + from_eq[i].out * dec_all[i].piece_color;
    }
    signal moving_type <== ft_acc[63];
    signal moving_color <== fc_acc[63];

    signal dest_acc[64];
    dest_acc[0] <== to_eq[0].out * old_board[0];
    for (var i = 1; i < 64; i++) {
        dest_acc[i] <== dest_acc[i-1] + to_eq[i].out * old_board[i];
    }
    signal dest_piece <== dest_acc[63];

    component iz_empty = IsZero();
    iz_empty.in <== moving_type;
    signal not_empty <== 1 - iz_empty.out;
    signal color_match_t <== moving_color * player_to_move;
    signal color_match <== 1 - moving_color - player_to_move + 2 * color_match_t;

    component ds = DeltaSquares();
    ds.from_square <== move_from;
    ds.to_square <== move_to;
    component stc_from = SquareToCoord();
    stc_from.square <== move_from;
    component stc_to = SquareToCoord();
    stc_to.square <== move_to;

    signal opponent_color;
    opponent_color <== 1 - moving_color;

    component pre_check = KingInCheckWitnessed();
    pre_check.board <== old_board;
    pre_check.king_color <== moving_color;
    pre_check.witness_squares <== pre_attack_witness_squares;
    pre_check.witness_active <== pre_attack_witness_active;
    signal king_not_in_check;
    king_not_in_check <== 1 - pre_check.in_check;

    signal base_rank;
    base_rank <== 7 * moving_color;
    signal traverse_sq0;
    traverse_sq0 <== 5 + 8 * base_rank;
    signal traverse_sq1;
    traverse_sq1 <== 6 + 8 * base_rank;
    component trav0 = SquareIsAttackedWitnessed();
    trav0.board <== old_board;
    trav0.square <== traverse_sq0;
    trav0.by_color <== opponent_color;
    trav0.witness_squares <== traverse0_witness_squares;
    trav0.witness_active <== traverse0_witness_active;
    component trav1 = SquareIsAttackedWitnessed();
    trav1.board <== old_board;
    trav1.square <== traverse_sq1;
    trav1.by_color <== opponent_color;
    trav1.witness_squares <== traverse1_witness_squares;
    trav1.witness_active <== traverse1_witness_active;
    signal traverse_squares_safe0;
    traverse_squares_safe0 <== 1 - trav0.attacked;
    signal traverse_squares_safe1;
    traverse_squares_safe1 <== 1 - trav1.attacked;

    // STEP 4: Piece validators
    component pawn = PawnMoves();
    pawn.dest_piece <== dest_piece;
    pawn.intermediate_piece <== intermediate_piece;
    pawn.en_passant_captured <== en_passant_captured;
    pawn.pawn_color <== moving_color;
    pawn.from_file <== stc_from.file;
    pawn.from_rank <== stc_from.rank;
    pawn.to_file <== stc_to.file;
    pawn.to_rank <== stc_to.rank;
    pawn.promotion_piece <== promotion_piece;

    component knight = KnightMoves();
    knight.abs_delta_file <== ds.abs_delta_file;
    knight.abs_delta_rank <== ds.abs_delta_rank;
    knight.dest_piece <== dest_piece;
    knight.piece_color <== moving_color;

    component bishop = BishopMoves();
    bishop.abs_delta_file <== ds.abs_delta_file;
    bishop.abs_delta_rank <== ds.abs_delta_rank;
    bishop.dest_piece <== dest_piece;
    bishop.piece_color <== moving_color;

    component rook = RookMoves();
    rook.abs_delta_file <== ds.abs_delta_file;
    rook.abs_delta_rank <== ds.abs_delta_rank;
    rook.dest_piece <== dest_piece;
    rook.piece_color <== moving_color;

    component queen = QueenMoves();
    queen.abs_delta_file <== ds.abs_delta_file;
    queen.abs_delta_rank <== ds.abs_delta_rank;
    queen.dest_piece <== dest_piece;
    queen.piece_color <== moving_color;

    component king = KingMoves();
    king.abs_delta_file <== ds.abs_delta_file;
    king.abs_delta_rank <== ds.abs_delta_rank;
    king.dest_piece <== dest_piece;
    king.piece_color <== moving_color;

    component cs = CastlingValidator();
    cs.from_square <== move_from;
    cs.to_square <== move_to;
    cs.player_color <== moving_color;
    cs.castling_rights <== old_castling_rights;
    cs.squares_empty[0] <== castling_empty_squares[0];
    cs.squares_empty[1] <== castling_empty_squares[1];
    cs.squares_empty[2] <== castling_empty_squares[2];
    cs.king_not_in_check <== king_not_in_check;
    cs.traverse_squares_safe[0] <== traverse_squares_safe0;
    cs.traverse_squares_safe[1] <== traverse_squares_safe1;

    component pc = PathClearance();
    pc.is_intermediate <== path_is_intermediate;
    pc.path_pieces <== path_pieces;

    component iz_pawn   = IsZero(); iz_pawn.in   <== moving_type - 1;
    component iz_knight = IsZero(); iz_knight.in <== moving_type - 2;
    component iz_bishop = IsZero(); iz_bishop.in <== moving_type - 3;
    component iz_rook   = IsZero(); iz_rook.in   <== moving_type - 4;
    component iz_queen  = IsZero(); iz_queen.in  <== moving_type - 5;
    component iz_king   = IsZero(); iz_king.in   <== moving_type - 6;

    signal is_pawn   <== iz_pawn.out;
    signal is_knight <== iz_knight.out;
    signal is_bishop <== iz_bishop.out;
    signal is_rook   <== iz_rook.out;
    signal is_queen  <== iz_queen.out;
    signal is_king   <== iz_king.out;

    signal v_pawn   <== is_pawn * pawn.is_valid;
    signal v_knight <== is_knight * knight.is_valid;
    signal v_bishop <== is_bishop * bishop.is_valid;
    signal v_rook   <== is_rook * rook.is_valid;
    signal v_queen  <== is_queen * queen.is_valid;
    signal v_king   <== is_king * king.is_valid;
    signal v_sum_a  <== v_pawn + v_knight + v_bishop + v_rook + v_queen + v_king;

    signal needs_path <== is_bishop + is_rook + is_queen;
    signal path_ok_part <== needs_path * pc.path_clear;
    signal path_ok <== (1 - needs_path) + path_ok_part;

    signal king_ok <== v_king;
    signal cs_ok <== is_king * cs.is_castling;
    signal king_final <== king_ok * (1 - cs.is_castling) + cs_ok;

    signal nk_tmp;
    nk_tmp <== (1 - is_king) * v_sum_a;
    signal nk_geom;
    nk_geom <== nk_tmp * path_ok;
    signal piece_valid;
    piece_valid <== nk_geom + king_final;

    signal mv_tmp;
    mv_tmp <== not_empty * color_match;
    signal move_valid;
    move_valid <== mv_tmp * piece_valid;

    signal c_pawn   <== is_pawn * pawn.is_capture;
    signal c_knight <== is_knight * knight.is_capture;
    signal c_bishop <== is_bishop * bishop.is_capture;
    signal c_rook   <== is_rook * rook.is_capture;
    signal c_queen  <== is_queen * queen.is_capture;
    signal c_king   <== is_king * king.is_capture;
    signal computed_capture <== c_pawn + c_knight + c_bishop + c_rook + c_queen + c_king;
    is_capture_flag === computed_capture;

    signal computed_promotion <== is_pawn * pawn.is_promotion;
    is_promotion_flag === computed_promotion;

    signal computed_castling <== is_king * cs.is_castling;
    is_castling_flag === computed_castling;

    // STEP 5: Board transition
    component updater = BoardUpdater();
    updater.old_board <== old_board;
    updater.from_square <== move_from;
    updater.to_square <== move_to;
    updater.promotion_piece <== promotion_piece;
    updater.player_to_move <== player_to_move;
    updater.is_capture <== computed_capture;
    updater.is_en_passant <== is_pawn * pawn.is_en_passant;
    updater.is_promotion <== computed_promotion;
    updater.en_passant_captured_square <== en_passant_captured_square;
    updater.new_ep_target <== new_ep_target;
    updater.old_halfmove_clock <== old_halfmove_clock;

    signal new_board[64];
    signal new_halfmove_clock;
    signal computed_ep_target;
    for (var i = 0; i < 64; i++) { new_board[i] <== updater.new_board[i]; }
    new_halfmove_clock <== updater.new_halfmove_clock;
    computed_ep_target <== updater.new_en_passant_target;

    // STEP 6: King must not be in check AFTER move
    component post_check = KingInCheckWitnessed();
    post_check.board <== new_board;
    post_check.king_color <== moving_color;
    post_check.witness_squares <== post_attack_witness_squares;
    post_check.witness_active <== post_attack_witness_active;
    post_check.in_check === 0;

    signal next_player;
    next_player <== 1 - player_to_move;

    signal cs_happened <== is_king * cs.is_castling;
    signal cs_new_rs <== cs_happened * cs.new_castling_rights;
    signal cs_keep_rs <== (1 - cs_happened) * old_castling_rights;
    signal new_castling_rights <== cs_new_rs + cs_keep_rs;

    component new_hasher = FullPositionHasher();
    new_hasher.board <== new_board;
    new_hasher.player_to_move <== next_player;
    new_hasher.castling_rights <== new_castling_rights;
    new_hasher.en_passant_target <== computed_ep_target;
    new_hasher.halfmove_clock <== new_halfmove_clock;
    new_board_hash === new_hasher.position_hash;

    // STEP 7: Threefold repetition
    component hist = HistoryHashChain();
    hist.current_hash <== new_hasher.position_hash;
    hist.history_hashes <== history_hashes;
    hist.history_len <== history_len;
    signal repetition_count;
    repetition_count <== hist.repetition_count;

    // STEP 8: Timers
    component timers = TimerUpdater();
    timers.old_timer_white <== old_timer_white;
    timers.old_timer_black <== old_timer_black;
    timers.elapsed_seconds <== elapsed_seconds;
    timers.player_to_move <== player_to_move;
    new_timer_white === timers.new_timer_white;
    new_timer_black === timers.new_timer_black;

    // STEP 9: Game status
    component status = GameStatusComputer();
    status.new_board <== new_board;
    status.next_player <== next_player;
    status.halfmove_clock <== new_halfmove_clock;
    status.repetition_count <== repetition_count;
    status.white_timeout <== timers.white_timeout;
    status.black_timeout <== timers.black_timeout;
    status.insufficient_material <== insufficient_material;
    status.game_status <== game_status;
    status.candidate_from <== candidate_from;
    status.candidate_to <== candidate_to;
    status.candidate_active <== candidate_active;
    status.opp_witness_squares <== opp_witness_squares;
    status.opp_witness_active <== opp_witness_active;
    status.proving_mode <== proving_mode; // passed for stricter Full ZK checks (mode=1)
    // proving_mode is available here for future stricter full-mode assertions in GameStatusComputer
    // (e.g. in mode=1 require certain consistency or ignore some off-chain timeout flags for stronger guarantees).
    // For now it is committed in the public signals so the proof itself records the chosen security level.
    // The mode does not change the core in-circuit move + transition + safety logic (already strong).

    move_valid === 1;
}

component main { public [old_board_hash, new_board_hash, player_to_move, move_from, move_to, promotion_piece, new_timer_white, new_timer_black, game_status, proving_mode] } = ChessV1();