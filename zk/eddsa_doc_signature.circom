pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsaposeidon.circom";

// REAL EdDSA document-signature proof (private document).
//
// STATEMENT proven by a verifying proof:
//   The holder of the BabyJubjub public key (Ax, Ay) produced a valid
//   EdDSA-Poseidon signature (R8x, R8y, S) over an authorization message
//   M = Poseidon(docHash, covenantId), where docHash is a PRIVATE 254-bit
//   field element, AND the public docCommitment equals Poseidon(docHash).
//
// What is revealed publicly: the signer key (Ax, Ay), a binding commitment
// docCommitment to the document, and the covenantId. The document hash itself
// (and therefore the document) stays private. A verifier learns ONLY that the
// owner of (Ax, Ay) signed the specific document committed to by docCommitment,
// for this covenant.
//
// USE CASES (catalog): document-signed-by-key, supply-chain step attestation,
// proof-of-authorship. In each case the attester signs the document/step hash
// without revealing its contents; the public commitment lets a relying party
// later confirm a disclosed document matches what was signed.
//
// HONESTY / v1 SIMPLIFICATIONS:
//  (1) The signing key is a BabyJubjub (EdDSA-Poseidon) key, NOT a Kaspa
//      secp256k1 key. secp256k1 verification inside BN254 is infeasible at this
//      scale. So "signer" means the in-circuit BabyJubjub identity (Ax, Ay), the
//      same convention used by basic_utxo_ownership and anon_credential.
//  (2) docHash is treated as an opaque field element supplied to the circuit. The
//      circuit does NOT recompute docHash from raw document bytes (no in-circuit
//      byte hashing); it proves a signature over a docHash and that docHash opens
//      docCommitment. The relying party hashes the disclosed document off-circuit
//      and checks it equals docHash (whose commitment is docCommitment). Honest
//      provers MUST set docHash to a real hash of the document; the soundness of
//      "this exact document was signed" rests on docCommitment = Poseidon(docHash)
//      being a binding commitment, which it is.
//  (3) The signed message binds covenantId (M = Poseidon(docHash, covenantId)) so
//      a signature cannot be replayed across covenants; covenantId is additionally
//      bound below via cbindH4, the standard covenant-binding pattern.
//
// SOUNDNESS: validity is a CONSTRAINED consequence of the constraints, never a
// prover input. EdDSAPoseidonVerifier(enabled=1) internally enforces the group
// equality via ForceEqualIfEnabled, so NO satisfying witness exists for a forged
// signature: proof generation FAILS for a bad (R8,S) or wrong key. The
// docCommitment === Poseidon(docHash) equality is enforced unconditionally.

template EddsaDocSignature() {
    // Private witness.
    signal input docHash;   // private document hash (field element)
    signal input R8x;       // EdDSA signature R8.x
    signal input R8y;       // EdDSA signature R8.y
    signal input S;         // EdDSA signature scalar S

    // Public inputs.
    signal input Ax;            // signer BabyJubjub pubkey x
    signal input Ay;            // signer BabyJubjub pubkey y
    signal input docCommitment; // = Poseidon(docHash), binds the private doc
    signal input covenantId;    // binds this attestation to a covenant

    signal output valid;

    // 1. Bind the public commitment to the private document hash. This is the
    //    only public link to docHash; Poseidon is collision-resistant so the
    //    commitment is binding (one cannot open it to a different document).
    component commit = Poseidon(1);
    commit.inputs[0] <== docHash;
    docCommitment === commit.out;

    // 2. Reconstruct the signed authorization message M = Poseidon(docHash, covenantId).
    component mHash = Poseidon(2);
    mHash.inputs[0] <== docHash;
    mHash.inputs[1] <== covenantId;

    // 3. Verify the EdDSA-Poseidon signature over M against (Ax, Ay). enabled = 1
    //    forces the verifier's internal equality constraints; a forged signature
    //    makes the witness unsatisfiable, so proving FAILS.
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== Ax;
    sigVerify.Ay <== Ay;
    sigVerify.S <== S;
    sigVerify.R8x <== R8x;
    sigVerify.R8y <== R8y;
    sigVerify.M <== mHash.out;

    // 4. Covenant binding (standard pattern): force covenantId into the
    //    constraint system as a non-removable witness contribution.
    signal cbindH4 <== covenantId * covenantId;

    // valid is reachable only when every constraint above is satisfiable, i.e.
    // only for a genuine signature by (Ax, Ay) over the document committed in
    // docCommitment, for this covenant.
    valid <== 1;
}

component main { public [Ax, Ay, docCommitment, covenantId] } = EddsaDocSignature();
