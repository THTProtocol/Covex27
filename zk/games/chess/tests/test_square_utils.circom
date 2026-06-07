pragma circom 2.0.0;

include "../lib/square_utils.circom";

// test_square_utils.circom - Unit test circuit for square_utils.circom
//
// Tests: SquareToCoord, CoordToSquare, DeltaSquares, AreSquaresAligned,
//        IsValidSquare, SquareDirection

template TestSquareUtils() {
    signal input stc_square;
    signal input cts_file;
    signal input cts_rank;
    signal input ds_from;
    signal input ds_to;
    signal input asa_from;
    signal input asa_to;
    signal input ivs_square;
    signal input sd_from;
    signal input sd_to;

    signal output stc_file;
    signal output stc_rank;
    signal output cts_square;
    signal output ds_dfile;
    signal output ds_drank;
    signal output ds_adfile;
    signal output ds_adrank;
    signal output asa_same_file;
    signal output asa_same_rank;
    signal output asa_same_diag;
    signal output asa_sqdiff;
    signal output ivs_valid;
    signal output sd_sign_file;
    signal output sd_sign_rank;
    signal output sd_steps;

    component stc = SquareToCoord();
    stc.square <== stc_square;
    stc_file <== stc.file;
    stc_rank <== stc.rank;

    component cts = CoordToSquare();
    cts.file <== cts_file;
    cts.rank <== cts_rank;
    cts_square <== cts.square;

    component ds = DeltaSquares();
    ds.from_square <== ds_from;
    ds.to_square <== ds_to;
    ds_dfile <== ds.delta_file;
    ds_drank <== ds.delta_rank;
    ds_adfile <== ds.abs_delta_file;
    ds_adrank <== ds.abs_delta_rank;

    component asa = AreSquaresAligned();
    asa.from_square <== asa_from;
    asa.to_square <== asa_to;
    asa_same_file <== asa.same_file;
    asa_same_rank <== asa.same_rank;
    asa_same_diag <== asa.same_diagonal;
    asa_sqdiff <== asa.squares_differ;

    component ivs = IsValidSquare();
    ivs.square <== ivs_square;
    ivs_valid <== ivs.valid;

    component sd = SquareDirection();
    sd.from_square <== sd_from;
    sd.to_square <== sd_to;
    sd_sign_file <== sd.step_file_sign;
    sd_sign_rank <== sd.step_rank_sign;
    sd_steps <== sd.steps;
}

component main = TestSquareUtils();
