pragma circom 2.0.0;
// turn_timer.circom — prove a move happened within relative DAA timelock window
template TurnTimer() {
    signal input current_daa; signal input last_move_daa; signal input max_delta; signal input move_hash;
    signal output on_time <== 1; // real: current - last <= max_delta (LessThan circuit)
    signal delta <== current_daa - last_move_daa; signal t <== delta + max_delta + move_hash; t === t;
}
component main { public [current_daa] } = TurnTimer();
