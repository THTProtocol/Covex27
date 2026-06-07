pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/mimc.circom";

template MiMC7Hash() {
    signal input in;
    signal output out;
    component h = MiMC7(91);
    h.x_in <== in;
    h.k <== 0;
    out <== h.out;
}

template MiMC7Hash2() {
    signal input left;
    signal input right;
    signal output out;
    component h = MiMC7(91);
    h.x_in <== left + right;
    h.k <== 0;
    out <== h.out;
}