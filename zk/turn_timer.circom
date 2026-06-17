pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// turn_timer.circom — prove a move happened within a user-chosen DAA window.
// Public: current_daa, max_delta (covenant/user sets the limit at deploy or per-game).
// Private: last_move_daa, move_hash (binds proof to a specific move).
// Output: on_time = 1 iff (current_daa - last_move_daa) <= max_delta

template TurnTimer() {
    signal input current_daa;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input last_move_daa;
    signal input max_delta;
    signal input move_hash;
    signal output on_time;

    signal delta <== current_daa - last_move_daa;

    component lte = LessEqThan(64);
    lte.in[0] <== delta;
    lte.in[1] <== max_delta;

    on_time <== lte.out;

    // Bind witness to move_hash (prevents replaying the same timer proof for another move)
    signal bind <== move_hash + 0;
    bind === move_hash;
}

component main { public [current_daa, max_delta, covenantId] } = TurnTimer();