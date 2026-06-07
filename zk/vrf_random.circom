pragma circom 2.0.0;
// vrf_random.circom — VRF output proof stub (for dice/cards/shuffles in games)
template VrfRandom() {
    signal input seed; signal input proof; signal input output_val; signal input pub_vrf_key;
    signal output valid <== 1; // stub (real = VRF verify on altbn128 or RISC0 guest)
    signal t <== seed + proof + output_val + pub_vrf_key; t === t;
}
component main { public [output_val, pub_vrf_key] } = VrfRandom();
