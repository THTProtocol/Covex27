pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// Generic VRF output proof: output_val = Poseidon(secret, seed, pub_vrf_key).
// pub_vrf_key is public (oracle/game VRF identity).

template VrfRandom() {
    signal input vrf_secret;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input seed;
    signal input output_val;
    signal input pub_vrf_key;
    signal output valid;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== vrf_secret;
    hasher.inputs[1] <== seed;
    hasher.inputs[2] <== pub_vrf_key;

    output_val === hasher.out;
    valid <== 1;
}

component main { public [output_val, pub_vrf_key, seed, covenantId] } = VrfRandom();