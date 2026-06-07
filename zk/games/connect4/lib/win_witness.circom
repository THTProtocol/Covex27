pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "board_lookup.circom";

template WitnessedWinLine() {
    signal input board[42];
    signal input player;
    signal input witness_cells[4];
    signal input witness_active;

    signal dx <== witness_cells[1] - witness_cells[0];
    signal dy <== witness_cells[2] - witness_cells[0];

    component d1x = IsZero();
    d1x.in <== witness_cells[3] - witness_cells[0] - 3 * dx;
    component d1y = IsZero();
    d1y.in <== witness_cells[3] - witness_cells[0] - 3 * dy;

    component lookup[4];
    component eq[4];
    signal owned[4];
    for (var i = 0; i < 4; i++) {
        lookup[i] = BoardLookup42();
        eq[i] = IsZero();
        lookup[i].board <== board;
        lookup[i].index <== witness_cells[i];
        eq[i].in <== lookup[i].value - player;
        owned[i] <== 1 - eq[i].out;
    }

    signal own01 <== owned[0] * owned[1];
    signal own012 <== own01 * owned[2];
    signal all_owned <== own012 * owned[3];
    signal align_ok <== d1x.out * d1y.out;
    signal own_align <== align_ok * all_owned;
    signal line_ok <== own_align * witness_active;
    signal output valid_win;
    valid_win <== line_ok;
}