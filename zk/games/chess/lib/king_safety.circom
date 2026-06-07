pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../lib/piece_codec.circom";
include "../lib/attack_generator.circom";

template FindKingSquare() {
    signal input board[64];
    signal input king_color;
    signal output king_square;

    component dec[64];
    component iz_k[64];
    signal is_king[64];
    signal weighted[64];
    signal color_match[64];
    signal king_tmp[64];
    for (var i = 0; i < 64; i++) {
        dec[i] = PieceDecoder();
        iz_k[i] = IsZero();
    }
    for (var i = 0; i < 64; i++) {
        dec[i].packed <== board[i];
        iz_k[i].in <== dec[i].piece_type - 6;
        color_match[i] <== 1 - dec[i].piece_color - king_color + 2 * dec[i].piece_color * king_color;
        king_tmp[i] <== iz_k[i].out * color_match[i];
        is_king[i] <== king_tmp[i] * (1 - dec[i].is_empty);
        weighted[i] <== is_king[i] * i;
    }

    signal acc[64];
    acc[0] <== weighted[0];
    for (var i = 1; i < 64; i++) {
        acc[i] <== acc[i - 1] + weighted[i];
    }
    king_square <== acc[63];

    signal count[64];
    count[0] <== is_king[0];
    for (var i = 1; i < 64; i++) {
        count[i] <== count[i - 1] + is_king[i];
    }
    count[63] === 1;
}

template KingInCheckWitnessed() {
    signal input board[64];
    signal input king_color;
    signal input witness_squares[12];
    signal input witness_active[12];
    signal output in_check;

    component finder = FindKingSquare();
    finder.board <== board;
    finder.king_color <== king_color;

    signal opponent_color;
    opponent_color <== 1 - king_color;

    component atk = WitnessedAttackCheck();
    atk.board <== board;
    atk.target_square <== finder.king_square;
    atk.attacker_color <== opponent_color;
    atk.witness_squares <== witness_squares;
    atk.witness_active <== witness_active;
    in_check <== atk.attacked;
}

template SquareIsAttackedWitnessed() {
    signal input board[64];
    signal input square;
    signal input by_color;
    signal input witness_squares[12];
    signal input witness_active[12];
    signal output attacked;

    component atk = WitnessedAttackCheck();
    atk.board <== board;
    atk.target_square <== square;
    atk.attacker_color <== by_color;
    atk.witness_squares <== witness_squares;
    atk.witness_active <== witness_active;
    attacked <== atk.attacked;
}