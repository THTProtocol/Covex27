pragma circom 2.0.0;

include "mimc_hash.circom";

// nullifier = MiMC7(secret + nullifier_key) — revealed publicly at withdraw
template NullifierHash() {
    signal input secret;
    signal input nullifier_key;
    signal input nullifier;

    component h = MiMC7Hash();
    h.in <== secret + nullifier_key;
    nullifier === h.out;
}