pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// turn_timer.circom — prove a move happened within a user-chosen DAA window.
// Public: current_daa, max_delta (covenant/user sets the limit at deploy or per-game), covenantId.
// Private: last_move_daa, move_hash (binds proof to a specific move).
// Output: on_time = 1 iff (current_daa - last_move_daa) <= max_delta
//
// SOUNDNESS (field-overflow forgery class): LessEqThan(64) is only sound when BOTH operands lie
// in [0, 2^64). Its operands here (delta = current_daa - last_move_daa, and max_delta) are sums/
// differences of prover-supplied field elements. Without range checks a prover could:
//   (1) pick last_move_daa > current_daa so delta = current_daa - last_move_daa wraps to a huge
//       field element near the BN254 prime p (a field-negative). LessEqThan(64) computes
//       X = 2^64 + in0 - in1 and decomposes X to 65 bits; a delta near p makes X itself wrap into
//       [0, 2^65) and forge on_time=1 for a move that is actually LATE (real integer delta huge).
//   (2) set max_delta = p - k (a field-negative huge value) so that ANY delta compares <= it,
//       forging on_time=1 unconditionally.
// FIX: bit-constrain every free comparator operand. Num2Bits(64) on current_daa, last_move_daa and
// on delta itself forces delta into [0, 2^64) AS AN INTEGER (so current_daa >= last_move_daa, no
// wrap), and Num2Bits(64) on max_delta rejects field-negative ceilings. DAA scores and windows are
// well under 2^64, so honest provers are unaffected.
//
// move_hash and covenantId are NOT comparator operands; they only bind the witness (move_hash) and
// give H4 cross-covenant replay binding (covenantId). They do not feed any comparator, so the
// field-overflow class does not apply to them and no range check is required for soundness.
template TurnTimer() {
    signal input current_daa;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input last_move_daa;
    signal input max_delta;
    signal input move_hash;
    signal output on_time;

    // Range-bind every free comparator operand so neither delta nor max_delta can wrap the field.
    component rcCurrent = Num2Bits(64);
    rcCurrent.in <== current_daa;
    component rcLastMove = Num2Bits(64);
    rcLastMove.in <== last_move_daa;
    component rcMaxDelta = Num2Bits(64);
    rcMaxDelta.in <== max_delta;

    signal delta <== current_daa - last_move_daa;
    // Force delta into [0, 2^64) as an integer: rejects last_move_daa > current_daa (which would
    // make delta a field-negative near p) and keeps the LessEqThan operand provably in range.
    component rcDelta = Num2Bits(64);
    rcDelta.in <== delta;

    component lte = LessEqThan(64);
    lte.in[0] <== delta;
    lte.in[1] <== max_delta;

    on_time <== lte.out;

    // Bind witness to move_hash (prevents replaying the same timer proof for another move)
    signal bind <== move_hash + 0;
    bind === move_hash;
}

component main { public [current_daa, max_delta, covenantId] } = TurnTimer();
