pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// ring_membership.circom - ring-signature-style anonymity-set membership (Covex, Wave 4)
//
// STATEMENT proven (a verifying proof with valid==1 IMPLIES all of this):
//   The prover knows a secret whose commitment commit = Poseidon(secret) is a leaf of the
//   public depth-`depth` Poseidon Merkle tree under `root` (the ring / anonymity set), AND the
//   emitted public `nullifier === Poseidon(secret, ringId)`. The proof reveals ONLY the nullifier
//   (and the public root/ringId/covenantId): it leaks NOTHING about WHICH ring member the prover is
//   (no index, no commitment, no identity). This is the "prove you are one of N without revealing
//   which" ring-membership primitive (anonymous one-of-N attestation, ring-signature-style).
//
//   Public:  root       (Poseidon Merkle root of the ring / anonymity set, depth param),
//            ringId      (ring / action domain separator the nullifier is scoped to),
//            nullifier   (the ONLY thing emitted about the prover; oracle stores it for single-use),
//            covenantId  (H4 cross-covenant replay binding)
//   Private: secret              (the member secret; commitment Poseidon(secret) is the ring leaf),
//            pathElements[depth]  (Poseidon Merkle siblings of the commitment leaf),
//            pathIndices[depth]   (0 = current node is left, 1 = current node is right)
//   Output:  valid == inTree      (1 iff Poseidon(secret) is a member of the ring; the nullifier
//                                   relation is enforced as a HARD constraint, see SOUNDNESS (3))
//
// SOUNDNESS / HONESTY:
//   (1) `valid` is a CONSTRAINED OUTPUT (valid <== inTree, a product/boolean of recomputed-root
//       equality), NOT a prover input and NOT forced via `=== 1`. inTree is IsEqual(recomputed
//       root, public root), so a non-member yields a SATISFIABLE proof with valid==0 instead of an
//       unsatisfiable system; the oracle gates on valid==1. A verifying proof with valid==1
//       therefore genuinely implies Poseidon(secret) is in the ring.
//   (2) NO comparators are applied to user values and there is NO field division on signals, so
//       there is no field-wrap / range-check hazard. pathIndices are each constrained boolean
//       (idx*(idx-1)===0). secret is a Poseidon preimage (any field element is a legitimate
//       secret), so range-binding it would wrongly restrict the secret space; commit/leaf/root are
//       full-field Poseidon outputs that never feed a < / <= operator. IsEqual internally uses
//       IsZero (no range assumption on its inputs), so it is safe on full-field elements.
//   (3) The nullifier is a HARD constraint: `nullifier === Poseidon(secret, ringId)`. Because this
//       === is unconditional (not gated by valid), NO satisfying witness exists unless the emitted
//       public nullifier was derived from the SAME secret the membership uses and this ringId. So a
//       verifying proof (valid==1) implies BOTH membership AND a correctly-bound, deterministic
//       nullifier that cannot be forged for a secret the prover does not hold, and is identical
//       across proofs by the same member in the same ring (enabling oracle double-spend / double-
//       action prevention) while still hiding which member produced it.
//   (4) covenantId is bound via the standard H4 witness `cbindH4 <== covenantId*covenantId` and is a
//       public input, so a proof for covenant A cannot be replayed against covenant B.
//
// ANONYMITY: the public signals are {valid, root, ringId, nullifier, covenantId}. The index
//   (pathIndices), the siblings (pathElements), the commitment Poseidon(secret), and the secret are
//   ALL private. The nullifier = Poseidon(secret, ringId) is a one-way hash, so it reveals nothing
//   about the secret or which leaf it sits at. Two proofs by the same member in the same ring share
//   a nullifier (linkable within the ring, by design, for single-use) but stay anonymous in the set.
//
// v1 SIMPLIFICATIONS (disclosed):
//   - depth is fixed at 4 in `component main` (a 16-leaf ring). Larger anonymity sets just raise
//     depth (and re-run trusted setup); the template is depth-parametric. The ring membership is a
//     plain Poseidon Merkle inclusion; it does not additionally prove the ring set was honestly
//     constructed (the public `root` is taken as the agreed ring commitment, as in every Covex
//     membership circuit).
//   - The ring leaf is commit = Poseidon(secret) (a single-element commitment). Binding extra
//     attributes into the commitment preimage is a future v2; v1 is exactly the one-of-N anonymity
//     primitive.
//   - Keys come from a single-contributor Covex DEV ceremony (pot*_final.ptau), NOT a production
//     MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain (Kaspa has no
//     pairing verifier).

template RingMembership(depth) {
    signal input root;                 // public: Poseidon Merkle root of the ring
    signal input ringId;               // public: ring / action domain separator
    signal input nullifier;            // public: emitted one-time nullifier (only leak about prover)
    signal input covenantId;           // public: H4 cross-covenant replay binding
    signal input secret;               // private: member secret (commitment is the ring leaf)
    signal input pathElements[depth];  // private: Merkle siblings
    signal input pathIndices[depth];   // private: 0 = current is left, 1 = current is right
    signal output valid;

    // H4 binding: forces covenantId into the constraint system as a public anchor.
    signal cbindH4 <== covenantId * covenantId;

    // (1) Ring leaf commitment = Poseidon(secret).
    component commit = Poseidon(1);
    commit.inputs[0] <== secret;

    // (2) Recompute the Merkle root from the commitment leaf up `depth` levels.
    signal cur[depth + 1];
    cur[0] <== commit.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;            // boolean constraint
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }

    // inTree = 1 iff the recomputed root equals the public root (boolean membership).
    component rootEq = IsEqual();
    rootEq.in[0] <== cur[depth];
    rootEq.in[1] <== root;
    signal inTree <== rootEq.out;

    // (3) Deterministic ring nullifier, HARD-constrained to the SAME secret + this ring.
    component nf = Poseidon(2);
    nf.inputs[0] <== secret;
    nf.inputs[1] <== ringId;
    nullifier === nf.out;

    // valid = membership boolean. The nullifier relation above is enforced unconditionally, so a
    // verifying proof with valid==1 implies both membership and a correctly-bound nullifier.
    valid <== inTree;
}

component main { public [root, ringId, nullifier, covenantId] } = RingMembership(4);
