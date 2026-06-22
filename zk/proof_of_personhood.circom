pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// proof_of_personhood.circom - self-committed personhood, one action per epoch (Covex)
//
// STATEMENT proven (a verifying proof IMPLIES all of this):
//   1. The prover holds an `identitySecret` whose commitment
//      identityCommitment = Poseidon(identitySecret) is a leaf in a PUBLIC registry
//      Merkle tree (depth 4) with the public `registryRoot`. That is: this person
//      self-registered (no issuer) and is a member of the public personhood registry.
//   2. The emitted public `nullifier === Poseidon(identitySecret, epoch)` deterministically
//      ties this action to the SAME secret identity for THIS epoch. The oracle stores
//      spent nullifiers, so each registered person can act at most ONCE per epoch, and
//      the nullifier cannot be forged for an identity the prover does not hold.
//
// Public:  registryRoot, epoch, nullifier, covenantId.
// Private: identitySecret, pathElements[4], pathIndices[4].
// Output:  valid (gating output; reachable only when every constraint below holds).
//
// DISTINCT from credential_nullifier:
//   credential_nullifier requires an ISSUER EdDSA signature over the commitment (attested
//   credential). proof_of_personhood has NO issuer: identity is SELF-COMMITTED and its
//   membership is proven against a PUBLIC registry root. Anti-sybil here = "one action per
//   registered person per epoch", where personhood = self-registration in the public set,
//   not an issuer's attestation.
//
// SOUNDNESS / HONESTY:
//   - `valid` is NOT a prover input and is never compared with `=== 1`. The two `===`
//     constraints (Merkle root match and nullifier derivation) ARE the statement; they
//     have no satisfying witness for a non-member or a forged nullifier. valid <== 1 only
//     marks the gating output once those hard constraints are jointly satisfiable.
//   - No comparators (< / <=) are used, so no field-wrap surface exists: every private
//     signal is consumed only by Poseidon and the Merkle path arithmetic. identitySecret
//     is hash-bound (it is the Poseidon preimage of the registered leaf) and ANY field
//     value is a legitimate self-committed secret, so range-binding it would wrongly
//     restrict the identity space. pathIndices[i] are bit-constrained
//     (pathIndices[i] * (pathIndices[i] - 1) === 0) so each is exactly 0 or 1.
//   - covenantId is bound via the standard H4 witness `cbindH4 <== covenantId*covenantId`
//     and is a public input, so a proof for covenant A cannot be replayed against B.
//
// v1 SIMPLIFICATION (disclosed):
//   - Personhood = self-registration of a Poseidon(identitySecret) leaf in the public
//     registry. v1 does NOT prove the registration was uniqueness-gated upstream (e.g. a
//     proof-of-uniqueness or social-graph dedupe before a leaf was admitted to the
//     registry); it proves "this secret's commitment IS in the published registry root
//     AND emits a per-epoch nullifier". The registry admission policy (who may add a leaf)
//     is enforced off-circuit by whoever publishes the root. Per-epoch single-use is the
//     in-circuit anti-sybil guarantee.
//   - Fixed registry depth 4 (16-leaf capacity in the demo). Larger registries widen DEPTH
//     in a future v2; the proven statement is unchanged.
//   - epoch is a public domain separator (e.g. a day/round id); rotating it lets the same
//     registered person act again in a NEW epoch, by design. Within one epoch, the
//     nullifier is deterministic so a second action is detectable and rejected by the oracle.
//   - Keys come from a single-contributor Covex DEV ceremony (pot*_final.ptau), NOT a
//     production MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never
//     on-chain (Kaspa has no pairing verifier).

template ProofOfPersonhood(depth) {
    // Public inputs (declaration order = public-signal order after the `valid` output).
    signal input registryRoot;   // public: root of the public personhood registry
    signal input epoch;          // public: per-epoch domain separator
    signal input nullifier;      // public: emitted one-action-per-epoch nullifier
    signal input covenantId;     // public: H4 cross-covenant replay binding

    // Private witness.
    signal input identitySecret;        // the held self-committed identity secret
    signal input pathElements[depth];   // Merkle siblings of the identity-commitment leaf
    signal input pathIndices[depth];    // 0 = leaf on left, 1 = leaf on right

    signal output valid;

    // H4 binding: forces covenantId into the constraint system as a public anchor.
    signal cbindH4 <== covenantId * covenantId;

    // (1) identityCommitment = Poseidon(identitySecret) is the registered leaf.
    component idc = Poseidon(1);
    idc.inputs[0] <== identitySecret;

    // (2) Merkle membership of idc.out under registryRoot.
    signal cur[depth + 1];
    cur[0] <== idc.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;                       // each index is a bit
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    registryRoot === cur[depth];

    // (3) Deterministic per-epoch nullifier = Poseidon(identitySecret, epoch).
    component nf = Poseidon(2);
    nf.inputs[0] <== identitySecret;
    nf.inputs[1] <== epoch;
    nullifier === nf.out;

    // valid is reachable only when (2) and (3) are jointly satisfiable, i.e. only for a
    // genuinely registered person emitting the correct per-epoch nullifier.
    valid <== 1;
}

component main { public [registryRoot, epoch, nullifier, covenantId] } = ProofOfPersonhood(4);
