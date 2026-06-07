pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "lib/board_hasher.circom";
include "lib/board_lookup.circom";
include "lib/win_witness.circom";

template Connect4V1() {
    signal input old_board_hash;
    signal input new_board_hash;
    signal input player_to_move;
    signal input move_column;
    signal input game_status;

    signal input old_board[42];
    signal input new_board[42];
    signal input landing_row;

    signal input win_witness_cells[4];
    signal input win_witness_active;

    component old_h = Connect4BoardHasher();
    for (var i = 0; i < 42; i++) {
        old_h.board[i] <== old_board[i];
    }
    old_h.player_to_move <== player_to_move;
    old_board_hash === old_h.board_hash;

    signal placing_player <== player_to_move;
    signal next_player_to_move <== 3 - player_to_move;

    signal landing_index <== move_column + landing_row * 7;

    component old_landing = BoardLookup42();
    old_landing.board <== old_board;
    old_landing.index <== landing_index;
    component landing_was_empty = IsZero();
    landing_was_empty.in <== old_landing.value;

    component new_landing = BoardLookup42();
    new_landing.board <== new_board;
    new_landing.index <== landing_index;
    component placed_ok = IsZero();
    placed_ok.in <== new_landing.value - placing_player;

    // Gravity: for each row r in column, if r > landing_row then old cell must be empty
    component above_lookup[6];
    component above_empty[6];
    component row_gt[6];
    signal above_ok[6];
    for (var r = 0; r < 6; r++) {
        above_lookup[r] = BoardLookup42();
        above_empty[r] = IsZero();
        row_gt[r] = GreaterThan(3);
        row_gt[r].in[0] <== r;
        row_gt[r].in[1] <== landing_row;
        above_lookup[r].board <== old_board;
        above_lookup[r].index <== move_column + r * 7;
        above_empty[r].in <== above_lookup[r].value;
        above_ok[r] <== (1 - row_gt[r].out) + row_gt[r].out * above_empty[r].out;
        above_ok[r] === 1;
    }

    component is_landing[42];
    signal diff[42];
    for (var i = 0; i < 42; i++) {
        is_landing[i] = IsZero();
        is_landing[i].in <== i - landing_index;
        diff[i] <== (1 - is_landing[i].out) * (new_board[i] - old_board[i]);
        diff[i] === 0;
    }

    component new_h = Connect4BoardHasher();
    for (var j = 0; j < 42; j++) {
        new_h.board[j] <== new_board[j];
    }
    new_h.player_to_move <== next_player_to_move;
    new_board_hash === new_h.board_hash;

    component win_w = WitnessedWinLine();
    win_w.board <== new_board;
    win_w.player <== placing_player;
    for (var w = 0; w < 4; w++) {
        win_w.witness_cells[w] <== win_witness_cells[w];
    }
    win_w.witness_active <== win_witness_active;

    component nz[42];
    signal occupied[42];
    for (var f = 0; f < 42; f++) {
        nz[f] = IsZero();
        nz[f].in <== new_board[f];
        occupied[f] <== 1 - nz[f].out;
    }
    signal full_count[42];
    full_count[0] <== occupied[0];
    for (var g = 1; g < 42; g++) {
        full_count[g] <== full_count[g - 1] + occupied[g];
    }
    component full = IsZero();
    full.in <== full_count[41] - 42;

    component st0 = IsZero();
    st0.in <== game_status;
    component st1 = IsZero();
    st1.in <== game_status - 1;
    component st2 = IsZero();
    st2.in <== game_status - 2;
    component st3 = IsZero();
    st3.in <== game_status - 3;

    component is_p1 = IsZero();
    is_p1.in <== placing_player - 1;
    component is_p2 = IsZero();
    is_p2.in <== placing_player - 2;

    signal p1_win <== win_w.valid_win * (1 - is_p1.out);
    signal p2_win <== win_w.valid_win * (1 - is_p2.out);

    signal no_win <== 1 - win_w.valid_win;
    signal no_full <== 1 - full.out;
    signal ongoing_a <== st0.out * no_win;
    signal ongoing_ok <== ongoing_a * no_full;
    signal p1win_ok <== st1.out * p1_win;
    signal p2win_ok <== st2.out * p2_win;
    signal draw_a <== st3.out * full.out;
    signal draw_ok <== draw_a * no_win;

    signal status_ok <== ongoing_ok + p1win_ok + p2win_ok + draw_ok;
    status_ok === 1;

    landing_was_empty.out === 1;
    placed_ok.out === 1;
}

component main { public [old_board_hash, new_board_hash, player_to_move, move_column, game_status] } = Connect4V1();