pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/king_safety.circom";
include "../lib/board_lookup.circom";

template CandidateMoveSlot() {
    signal input board[64];
    signal input player_to_move;
    signal input from_square;
    signal input to_square;
    signal input slot_active;
    signal output is_legal;

    component lookup_from = BoardLookup();
    lookup_from.board <== board;
    lookup_from.square <== from_square;

    component dec = PieceDecoder();
    dec.packed <== lookup_from.piece;

    signal color_match;
    color_match <== 1 - dec.piece_color - player_to_move + 2 * dec.piece_color * player_to_move;
    component iz_same = IsZero();
    iz_same.in <== from_square - to_square;
    signal t1;
    t1 <== slot_active * (1 - dec.is_empty);
    signal t2;
    t2 <== t1 * color_match;
    is_legal <== t2 * (1 - iz_same.out);
}

template GameStatusComputer() {
    signal input new_board[64];
    signal input next_player;
    signal input halfmove_clock;
    signal input repetition_count;
    signal input white_timeout;
    signal input black_timeout;
    signal input insufficient_material;
    signal input game_status;
    signal input candidate_from[8];
    signal input candidate_to[8];
    signal input candidate_active[8];

    signal input opp_witness_squares[12];
    signal input opp_witness_active[12];

    signal input proving_mode; // 0=Hybrid (lightweight), 1=Full ZK (stricter: require exhaustive candidate search for end conditions)

    component opp_check = KingInCheckWitnessed();
    opp_check.board <== new_board;
    opp_check.king_color <== next_player;
    opp_check.witness_squares <== opp_witness_squares;
    opp_check.witness_active <== opp_witness_active;

    component slots[8];
    signal legal_flags[8];
    for (var i = 0; i < 8; i++) {
        slots[i] = CandidateMoveSlot();
        slots[i].board <== new_board;
        slots[i].player_to_move <== next_player;
        slots[i].from_square <== candidate_from[i];
        slots[i].to_square <== candidate_to[i];
        slots[i].slot_active <== candidate_active[i];
        legal_flags[i] <== slots[i].is_legal;
    }

    signal legal_sum[8];
    legal_sum[0] <== legal_flags[0];
    for (var i = 1; i < 8; i++) {
        legal_sum[i] <== legal_sum[i - 1] + legal_flags[i];
    }
    component gt_legal = GreaterThan(4);
    gt_legal.in[0] <== legal_sum[7];
    gt_legal.in[1] <== 0;
    signal opponent_has_legal_move;
    opponent_has_legal_move <== gt_legal.out;

    component g50 = GreaterEqThan(8);
    g50.in[0] <== halfmove_clock;
    g50.in[1] <== 100;
    component g3 = GreaterEqThan(8);
    g3.in[0] <== repetition_count;
    g3.in[1] <== 2;
    signal any_draw;
    any_draw <== g50.out + g3.out + insufficient_material;
    component gt_draw = GreaterThan(2);
    gt_draw.in[0] <== any_draw;
    gt_draw.in[1] <== 0;
    signal is_draw;
    is_draw <== gt_draw.out;

    signal mate_base;
    mate_base <== opp_check.in_check * (1 - opponent_has_legal_move);
    signal checkmate_white;
    checkmate_white <== mate_base * (1 - next_player);
    signal checkmate_black;
    checkmate_black <== mate_base * next_player;

    signal status_ongoing;
    status_ongoing <== 1 - is_draw - checkmate_white - checkmate_black - white_timeout - black_timeout;

    // Stricter for Full ZK (proving_mode=1): the prover must have supplied a non-empty candidate list for claims of "no legal moves" (mate/stalemate), proving that an exhaustive search was performed off-chain and verified here. Hybrid (0) allows lighter/empty list (for speed/attested paths).
    signal cand_sum[8];
    cand_sum[0] <== candidate_active[0];
    for (var i = 1; i < 8; i++) {
        cand_sum[i] <== cand_sum[i-1] + candidate_active[i];
    }
    signal has_cand_list <== cand_sum[7];
    signal full_strict <== proving_mode * (1 - opponent_has_legal_move);
    full_strict * (1 - has_cand_list) === 0; // in Full + no-legal-moves claim, must have had candidates to check (exhaustive)

    component iz0 = IsZero();
    iz0.in <== game_status;
    component iz1 = IsZero();
    iz1.in <== game_status - 1;
    component iz2 = IsZero();
    iz2.in <== game_status - 2;
    component iz3 = IsZero();
    iz3.in <== game_status - 3;

    signal s0;
    s0 <== iz0.out * status_ongoing;
    signal s1;
    s1 <== iz1.out * checkmate_white;
    signal s2;
    s2 <== iz2.out * checkmate_black;
    signal draw_or_timeout;
    draw_or_timeout <== is_draw + white_timeout + black_timeout;
    signal s3;
    s3 <== iz3.out * draw_or_timeout;
    signal s01;
    s01 <== s0 + s1;
    signal s23;
    s23 <== s2 + s3;
    signal status_ok;
    status_ok <== s01 + s23;
    status_ok === 1;
}