pragma circom 2.0.0;

include "mimc_hash.circom";

// commitment = MiMC chain over secret, nullifier_key, amount_commitment
template MixerCommitment() {
    signal input secret;
    signal input nullifier_key;
    signal input amount_commitment;
    signal output commitment;

    component h0 = MiMC7Hash();
    component h1 = MiMC7Hash();
    component h2 = MiMC7Hash();

    h0.in <== secret;
    h1.in <== h0.out + nullifier_key;
    h2.in <== h1.out + amount_commitment;
    commitment <== h2.out;
}

template AmountCommitment() {
    signal input amount;
    signal output amount_commitment;
    component h = MiMC7Hash();
    h.in <== amount;
    amount_commitment <== h.out;
}