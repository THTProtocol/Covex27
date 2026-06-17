pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/mimc.circom";

template MerkleMembership() {
    // Public input: the expected commitment root
    signal input rootHash;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;

    // Private witness: the secret leaf preimage
    signal input secretLeaf;

    // Public output: 1 if constraints are satisfied
    signal output valid;

    // Compute MiMC7(secretLeaf)
    component hasher = MiMC7(91);
    hasher.x_in <== secretLeaf;
    hasher.k <== 0;

    // Constraint: computed hash must equal expected rootHash
    rootHash === hasher.out;

    // Valid flag
    valid <== 1;
}

component main {public [rootHash, covenantId]} = MerkleMembership();
