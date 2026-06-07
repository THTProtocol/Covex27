pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";

template HistoryHashChain() {
    signal input current_hash;
    signal input history_hashes[100];
    signal input history_len;
    signal output repetition_count;

    component eq[100];
    component lt[100];
    signal matches[100];
    for (var i = 0; i < 100; i++) {
        eq[i] = IsZero();
        lt[i] = LessThan(7);
    }
    for (var i = 0; i < 100; i++) {
        eq[i].in <== current_hash - history_hashes[i];
        lt[i].in[0] <== i;
        lt[i].in[1] <== history_len;
        matches[i] <== eq[i].out * lt[i].out;
    }

    signal acc[100];
    acc[0] <== matches[0];
    for (var i = 1; i < 100; i++) {
        acc[i] <== acc[i - 1] + matches[i];
    }
    repetition_count <== acc[99];
}