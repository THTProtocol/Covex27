pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsaposeidon.circom";

// credential_nullifier.circom - issued-credential one-action nullifier (Covex)
//
// STATEMENT proven (a verifying proof IMPLIES all of this):
//   1. The prover holds a credential secret `credentialSecret`.
//   2. The issuer, holding BabyJubjub key (Ax, Ay), EdDSA-Poseidon SIGNED the
//      credential commitment  credentialCommitment = Poseidon(credentialSecret).
//      That is: the issuer attested "this exact secret is a valid credential".
//   3. The emitted public `nullifier === Poseidon(credentialSecret, externalNullifier)`
//      deterministically ties this action to that credential for THIS action domain,
//      so the same credential cannot act twice (the oracle stores spent nullifiers)
//      and the nullifier cannot be forged for a credential the prover does not hold.
//
// Public:  Ax, Ay (issuer pubkey), externalNullifier (per-action domain separator),
//          nullifier (emitted), covenantId (H4 cross-covenant replay binding).
// Private: credentialSecret, R8x, R8y, S (the issuer's signature over the commitment).
//
// SOUNDNESS / HONESTY:
//   - `valid` is reached only when EVERY constraint below is satisfiable. There is no
//     `valid` prover INPUT and it is never compared with `=== 1`. The EdDSA verifier
//     (enabled = 1) internally ForceEqualIfEnabled-asserts signature validity, so NO
//     satisfying witness exists for a forged signature; the `nullifier ===` line is a
//     HARD constraint. valid <== 1 only marks the gating output.
//   - No comparators are used, so no Num2Bits range-binding is needed: every signal is
//     consumed only by Poseidon / the EdDSA verifier, none feeds a < / <= operator, so
//     there is no field-wrap attack surface here. credentialSecret is hash-bound (it is
//     the Poseidon preimage the issuer signed) and ANY field value is a legitimate
//     credential preimage, so range-checking it would wrongly restrict the space.
//   - covenantId is bound via the standard H4 witness `cbindH4 <== covenantId*covenantId`
//     and is a public input, so a proof for covenant A cannot be replayed against B.
//
// v1 SIMPLIFICATION (disclosed):
//   - The issuer signs the COMMITMENT Poseidon(credentialSecret), not extra attribute
//     fields. A single issued credential = one (secret, commitment) pair the issuer
//     attested. Richer attribute predicates (degree class, license tier, KYC level) are
//     layered by binding those attributes into the commitment preimage in a future v2;
//     v1 proves "issuer-attested credential + one-time nullifier", which is exactly the
//     anti-sybil / membership-credential / KYC-held / degree-license HELD primitive.
//   - "EdDSA-verify(issuerPubkey over credentialCommitment)" means the issuer signs the
//     MESSAGE M = credentialCommitment directly (M is itself a Poseidon hash, the proper
//     EdDSA-Poseidon message form), binding the issuer's attestation to that exact
//     credential. (No extra Poseidon wrap is applied to the commitment before signing.)
//   - Keys come from a single-contributor Covex DEV ceremony (pot*_final.ptau), NOT a
//     production MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never
//     on-chain (Kaspa has no pairing verifier).

template CredentialNullifier() {
    // Public inputs.
    signal input Ax;                 // issuer BabyJubjub pubkey x
    signal input Ay;                 // issuer BabyJubjub pubkey y
    signal input externalNullifier;  // per-action domain separator (proposal/airdrop/action id)
    signal input nullifier;          // emitted one-time nullifier
    signal input covenantId;         // H4 cross-covenant replay binding

    // Private witness.
    signal input credentialSecret;   // the held credential secret
    signal input R8x;                // issuer signature R8.x
    signal input R8y;                // issuer signature R8.y
    signal input S;                  // issuer signature scalar

    signal output valid;

    // H4 binding: forces covenantId into the constraint system as a public anchor.
    signal cbindH4 <== covenantId * covenantId;

    // (1) credentialCommitment = Poseidon(credentialSecret).
    component commit = Poseidon(1);
    commit.inputs[0] <== credentialSecret;

    // (2) The issuer EdDSA-Poseidon-signed the commitment. enabled = 1 makes a forged
    //     signature unsatisfiable: the message M is exactly credentialCommitment.
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== Ax;
    sigVerify.Ay <== Ay;
    sigVerify.S <== S;
    sigVerify.R8x <== R8x;
    sigVerify.R8y <== R8y;
    sigVerify.M <== commit.out;

    // (3) Deterministic one-time nullifier bound to the SAME secret + this action.
    component nf = Poseidon(2);
    nf.inputs[0] <== credentialSecret;
    nf.inputs[1] <== externalNullifier;
    nullifier === nf.out;

    // valid is reachable only when (2) and (3) are jointly satisfiable, i.e. only for a
    // genuinely issuer-signed credential with its correctly-derived nullifier.
    valid <== 1;
}

component main { public [Ax, Ay, externalNullifier, nullifier, covenantId] } = CredentialNullifier();
