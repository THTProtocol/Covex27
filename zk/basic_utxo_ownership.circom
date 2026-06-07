pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// Prove UTXO ownership via Poseidon commitment (pubkey + amount + sig binding).
// Public utxo_hash lets covenants reference a specific note without revealing privates.
// Full Schnorr verify is out of scope here; sig parts bind the spend authorization witness.

template BasicUtxoOwnership() {
    signal input pubkey_x;
    signal input pubkey_y;
    signal input amount_commit;
    signal input owner_sig_r;
    signal input owner_sig_s;
    signal input utxo_hash;
    signal output valid;

    component h = Poseidon(5);
    h.inputs[0] <== pubkey_x;
    h.inputs[1] <== pubkey_y;
    h.inputs[2] <== amount_commit;
    h.inputs[3] <== owner_sig_r;
    h.inputs[4] <== owner_sig_s;

    utxo_hash === h.out;
    valid <== 1;
}

component main { public [utxo_hash] } = BasicUtxoOwnership();