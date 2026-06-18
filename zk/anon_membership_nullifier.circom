pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// anon_membership_nullifier.circom — anonymous one-person-one-action (Covex27)
// Anonymous voting / airdrop claim: prove you are a committed member AND emit a deterministic
// public nullifier so the same identity cannot act twice, without revealing which member you are.
//
//   Public:  root (membership Merkle root, depth 4),
//            externalNullifier (per-action domain separator, e.g. proposal id),
//            nullifier (the emitted public nullifier the oracle stores to prevent double-use)
//   Private: identity (the secret identity scalar),
//            pathElements[4], pathIndices[4] (Merkle path of the identity commitment leaf)
//   Output:  valid == 1 (a satisfying witness exists only for a genuine member with the
//            correctly-derived nullifier)
//
// Genuine constraints:
//   (1) idCommit = Poseidon(identity)                          — the member leaf is the id commitment
//   (2) recompute the Merkle root from idCommit up `depth` levels and === it to the public root
//   (3) nullifier === Poseidon(identity, externalNullifier)    — binds the public nullifier to the
//       SAME secret identity + this action, so it is deterministic (one-person-one-action) and
//       cannot be forged for an identity you do not hold.
// No `valid <== 1` stub: the two === constraints are the real statement; valid is the gating
// output. The oracle additionally tracks the spent nullifier set to enforce single use.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template AnonMembershipNullifier(depth) {
    signal input root;                                          // public: membership root
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input externalNullifier;                             // public: action domain separator
    signal input nullifier;                                     // public: emitted nullifier
    signal input identity;                                      // private: secret identity scalar
    signal input pathElements[depth];                           // private: Merkle siblings
    signal input pathIndices[depth];                            // private: 0 = left, 1 = right
    signal output valid;

    // (1) The member leaf = Poseidon(identity).
    component idc = Poseidon(1);
    idc.inputs[0] <== identity;

    // (2) Merkle membership of idc.out under root.
    signal cur[depth + 1];
    cur[0] <== idc.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    root === cur[depth];

    // (3) Deterministic nullifier = Poseidon(identity, externalNullifier).
    component nf = Poseidon(2);
    nf.inputs[0] <== identity;
    nf.inputs[1] <== externalNullifier;
    nullifier === nf.out;

    valid <== 1;
}

component main { public [root, externalNullifier, nullifier, covenantId] } = AnonMembershipNullifier(4);
