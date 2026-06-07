pragma circom 2.0.0;

include "../lib/piece_codec.circom";

// test_piece_codec.circom - Unit test circuit for piece_codec.circom
//
// All inputs are private witness. All outputs are public by default in circom 2.x.
// Tests: Encoding, Decoding, IsSlidingPiece, IsOpponentColor,
//        IsPieceColor, IsSpecificPiece

template TestPieceCodec() {
    signal input enc_type;
    signal input enc_color;
    signal input dec_packed;
    signal input slide_type;
    signal input color_a;
    signal input color_b;
    signal input pc_packed;
    signal input pc_target_color;
    signal input spec_type;
    signal input spec_target;

    signal output enc_packed;
    signal output dec_type;
    signal output dec_color;
    signal output dec_empty;
    signal output sliding;
    signal output opponent;
    signal output pcolor_match;
    signal output specific_match;

    component encoder = PieceEncoder();
    encoder.piece_type <== enc_type;
    encoder.piece_color <== enc_color;
    enc_packed <== encoder.packed;

    component decoder = PieceDecoder();
    decoder.packed <== dec_packed;
    dec_type <== decoder.piece_type;
    dec_color <== decoder.piece_color;
    dec_empty <== decoder.is_empty;

    component sliding_check = IsSlidingPiece();
    sliding_check.piece_type <== slide_type;
    sliding <== sliding_check.is_sliding;

    component opp_check = IsOpponentColor();
    opp_check.color_a <== color_a;
    opp_check.color_b <== color_b;
    opponent <== opp_check.is_opponent;

    component pcolor = IsPieceColor();
    pcolor.packed <== pc_packed;
    pcolor.target_color <== pc_target_color;
    pcolor_match <== pcolor.matches;

    component specific = IsSpecificPiece();
    specific.piece_type <== spec_type;
    specific.target_type <== spec_target;
    specific_match <== specific.is_match;
}

component main = TestPieceCodec();
