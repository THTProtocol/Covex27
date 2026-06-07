pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";

// timer_update.circom - Per-turn clock decrement + timeout (Covex27)

template TimerUpdater() {
    signal input old_timer_white;
    signal input old_timer_black;
    signal input elapsed_seconds;
    signal input player_to_move;

    signal output new_timer_white;
    signal output new_timer_black;
    signal output white_timeout;
    signal output black_timeout;

    signal tw_dec;
    tw_dec <== (1 - player_to_move) * elapsed_seconds;
    signal tb_dec;
    tb_dec <== player_to_move * elapsed_seconds;

    new_timer_white <== old_timer_white - tw_dec;
    new_timer_black <== old_timer_black - tb_dec;

    component gt_w = GreaterEqThan(32);
    gt_w.in[0] <== new_timer_white;
    gt_w.in[1] <== 1;
    white_timeout <== 1 - gt_w.out;

    component gt_b = GreaterEqThan(32);
    gt_b.in[0] <== new_timer_black;
    gt_b.in[1] <== 1;
    black_timeout <== 1 - gt_b.out;
}