pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsaposeidon.circom";

// REAL UTXO ownership proof.
//
// The owner holds a BabyJubjub keypair (Ax, Ay). To prove ownership of a note,
// the owner signs the message M = Poseidon(amount_commit, covenantId) with EdDSA
// (Poseidon variant), producing (R8x, R8y, S). The circuit:
//   1. Verifies the EdDSA signature over M against (Ax, Ay) with enabled = 1.
//      EdDSAPoseidonVerifier internally enforces left == right (ForceEqualIfEnabled),
//      so NO satisfying witness exists unless the signature is genuinely valid.
//   2. Binds the public utxo_hash to the key + amount via
//      utxo_hash === Poseidon(Ax, Ay, amount_commit).
//
// HONESTY NOTE: this proves possession of the BabyJubjub key that the note is
// bound to (a covenant-internal key). It does NOT prove control of the Kaspa
// secp256k1 spending key. secp256k1 verification inside BN254 is infeasible at
// this scale, so the BabyJubjub key is the in-circuit notion of "owner". A
// verifying proof therefore implies: the prover knows the BabyJubjub private key
// for the public key (Ax, Ay) committed in utxo_hash, and signed an
// authorization message binding amount_commit to covenantId.

template BasicUtxoOwnership() {
    // Private witness: the owner's public key, signature, and amount commitment.
    signal input Ax;
    signal input Ay;
    signal input amount_commit;
    signal input R8x;
    signal input R8y;
    signal input S;

    // Public inputs.
    signal input utxo_hash;   // = Poseidon(Ax, Ay, amount_commit)
    signal input covenantId;  // binds the signed authorization to this covenant

    signal output valid;

    // 1. Reconstruct the signed message M = Poseidon(amount_commit, covenantId).
    component mHash = Poseidon(2);
    mHash.inputs[0] <== amount_commit;
    mHash.inputs[1] <== covenantId;

    // 2. Verify the EdDSA-Poseidon signature. enabled = 1 forces the verifier's
    //    internal equality constraints to hold; a forged signature is unsatisfiable.
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== Ax;
    sigVerify.Ay <== Ay;
    sigVerify.S <== S;
    sigVerify.R8x <== R8x;
    sigVerify.R8y <== R8y;
    sigVerify.M <== mHash.out;

    // 3. Bind the public note hash to the verified key + amount.
    component noteHash = Poseidon(3);
    noteHash.inputs[0] <== Ax;
    noteHash.inputs[1] <== Ay;
    noteHash.inputs[2] <== amount_commit;
    utxo_hash === noteHash.out;

    // valid is reachable only when all the above constraints are satisfiable,
    // i.e. only for a real signature over the bound message by the bound key.
    valid <== 1;
}

component main { public [utxo_hash, covenantId] } = BasicUtxoOwnership();
