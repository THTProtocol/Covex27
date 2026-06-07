pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "lib/board_hasher.circom";
include "lib/board_lookup.circom";
include "lib/win_check.circom";

template TicTacToeV1() {
    signal input old_board_hash;
    signal input new_board_hash;
    signal input player_to_move;
    signal input move_cell;
    signal input game_status;

    signal input old_board[9];
    signal input new_board[9];

    component old_h = TicTacToeBoardHasher(9);
    for (var i = 0; i < 9; i++) {
        old_h.board[i] <== old_board[i];
    }
    old_h.player_to_move <== player_to_move;
    old_board_hash === old_h.board_hash;

    signal placing_player <== player_to_move;
    signal next_player_to_move <== 3 - player_to_move;

    component old_cell = BoardLookup(9);
    old_cell.board <== old_board;
    old_cell.index <== move_cell;
    component old_empty = IsZero();
    old_empty.in <== old_cell.value;

    component new_cell = BoardLookup(9);
    new_cell.board <== new_board;
    new_cell.index <== move_cell;
    component placed_ok = IsZero();
    placed_ok.in <== new_cell.value - placing_player;

    component is_move[9];
    signal unchanged[9];
    for (var i = 0; i < 9; i++) {
        is_move[i] = IsZero();
        is_move[i].in <== i - move_cell;
        unchanged[i] <== (1 - is_move[i].out) * (new_board[i] - old_board[i]);
        unchanged[i] === 0;
    }

    component new_h = TicTacToeBoardHasher(9);
    for (var j = 0; j < 9; j++) {
        new_h.board[j] <== new_board[j];
    }
    new_h.player_to_move <== next_player_to_move;
    new_board_hash === new_h.board_hash;

    component win_x = TicTacToeWinCheck();
    win_x.board <== new_board;
    win_x.player <== 1;

    component win_o = TicTacToeWinCheck();
    win_o.board <== new_board;
    win_o.player <== 2;

    component nz[9];
    signal full_board[9];
    for (var f = 0; f < 9; f++) {
        nz[f] = IsZero();
        nz[f].in <== new_board[f];
        full_board[f] <== 1 - nz[f].out;
    }
    signal filled_count[9];
    filled_count[0] <== full_board[0];
    for (var g = 1; g < 9; g++) {
        filled_count[g] <== filled_count[g - 1] + full_board[g];
    }
    component full = IsZero();
    full.in <== filled_count[8] - 9;

    component st0 = IsZero();
    st0.in <== game_status;
    component st1 = IsZero();
    st1.in <== game_status - 1;
    component st2 = IsZero();
    st2.in <== game_status - 2;
    component st3 = IsZero();
    st3.in <== game_status - 3;

    signal no_x <== 1 - win_x.has_win;
    signal no_o <== 1 - win_o.has_win;
    signal no_full <== 1 - full.out;
    signal ongoing_a <== st0.out * no_x;
    signal ongoing_b <== ongoing_a * no_o;
    signal ongoing_ok <== ongoing_b * no_full;
    signal xwin_ok <== st1.out * win_x.has_win;
    signal owin_ok <== st2.out * win_o.has_win;
    signal draw_a <== st3.out * full.out;
    signal draw_b <== draw_a * no_x;
    signal draw_ok <== draw_b * no_o;

    signal status_ok <== ongoing_ok + xwin_ok + owin_ok + draw_ok;
    status_ok === 1;

    old_empty.out === 1;
    placed_ok.out === 1;
}

component main { public [old_board_hash, new_board_hash, player_to_move, move_cell, game_status] } = TicTacToeV1();