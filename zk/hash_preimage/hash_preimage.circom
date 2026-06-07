pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/mimc.circom";

// hash_preimage.circom — MiMC7 preimage knowledge proof (Covex27)
//
// Public: commitment_hash
// Private witness: preimage
//
// Honest limitation: uses MiMC7 (Groth16-friendly), not SHA256/Blake2b.
// For Kaspa script-hash HTLCs requiring SHA256, use oracle attestation or
// a future SHA256 circuit variant (much higher constraint count).

template HashPreimage() {
    signal input commitment_hash;
    signal input preimage;
    signal output valid;

    component hasher = MiMC7(91);
    hasher.x_in <== preimage;
    hasher.k <== 0;
    commitment_hash === hasher.out;
    valid <== 1;
}

component main { public [commitment_hash] } = HashPreimage();