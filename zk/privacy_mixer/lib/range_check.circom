pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "commitment.circom";

// Optional hidden amount: prove amount in [min, max] and binds to public amount_commitment.
template MixerRangeCheck(bits) {
    signal input amount;
    signal input amount_commitment;
    signal input min_amount;
    signal input max_amount;
    signal output in_range;

    component amt = AmountCommitment();
    amt.amount <== amount;
    amount_commitment === amt.amount_commitment;

    component lower = GreaterEqThan(bits);
    component upper = LessEqThan(bits);
    lower.in[0] <== amount;
    lower.in[1] <== min_amount;
    upper.in[0] <== amount;
    upper.in[1] <== max_amount;
    in_range <== lower.out * upper.out;
}