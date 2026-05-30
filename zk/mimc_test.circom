pragma circom 2.0.0;
include "../node_modules/circomlib/circuits/mimc.circom";
template MiMCTest() {
    signal input secret;
    signal output hash;
    component hasher = MiMC7(91);
    hasher.x_in <== secret;
    hasher.k <== 0;
    hash <== hasher.out;
}
component main = MiMCTest();
