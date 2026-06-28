pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// threshold_sig_knowledge.circom - prove knowledge of a K-of-N set of secret SHARES that
// reconstruct a committed group secret, WITHOUT revealing the shares (Covex27).
// A k-of-n threshold-knowledge gate: a claimant proves they hold a valid quorum of Shamir shares
// (and therefore could co-sign / unlock) without disclosing which shares or their values.
//
//   K = 2 (threshold), over a fixed quorum at public x-coordinates x = 1, 2.
//   Public:  shareCommit[K] = Poseidon(share_i, salt_i)  (one per held share, published so the
//              dealer's committed shares can be checked off-line),
//            groupCommit = Poseidon(secret)  (commitment to the reconstructed group secret),
//            covenantId
//   Private: share[K] (the held share y-values at x = 1..K), salt[K] (commitment salts),
//            secret (the reconstructed group secret S = f(0) of the degree-(K-1) polynomial)
//   Output:  valid == 1 iff every shareCommit_i opens to share_i AND the Lagrange interpolation of
//            the K shares at x = 0 equals secret AND groupCommit opens to secret.
//
// Lagrange at x = 0 for the two fixed points (1, share_0), (2, share_1):
//   f(0) = share_0 * (2 / (2 - 1)) + share_1 * (1 / (1 - 2))
//        = 2 * share_0  -  1 * share_1               (constants, no field inverse needed)
// so secret === 2*share_0 - share_1 is a single quadratic-free linear constraint.
//
// Genuine constraints:
//   (1) shareCommit[i] === Poseidon(share_i, salt_i)         - binds each hidden share to its public commitment
//   (2) recon === 2*share_0 - share_1 ; eqRecon = IsEqual(recon, secret)   - Lagrange reconstruction
//   (3) groupCommit === Poseidon(secret)                     - binds the secret to the public group commitment
//   (4) valid = eqRecon.out                                  - CONSTRAINED, never a free input
// Holding shares that do NOT reconstruct the committed secret yields recon != secret -> valid==0,
// so the oracle (which requires valid==1) refuses. A false predicate (wrong shares) produces a
// VERIFYING proof carrying valid==0. No `valid <== 1` stub.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. This proves SHARE KNOWLEDGE, not a BIP340/secp256k1 signature; it is Verified OFF-CHAIN by
// the disclosed oracle (fail-closed), never on-chain.

template ThresholdSigKnowledge(K) {
    signal input shareCommit[K];                                // public: per-share Poseidon commitments
    signal input groupCommit;                                   // public: Poseidon(secret)
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input share[K];                                      // private: held share y-values (x = 1..K)
    signal input salt[K];                                       // private: commitment salts
    signal input secret;                                        // private: reconstructed group secret f(0)
    signal output valid;

    // (1) Bind each hidden share to its public commitment.
    component sc[K];
    for (var i = 0; i < K; i++) {
        sc[i] = Poseidon(2);
        sc[i].inputs[0] <== share[i];
        sc[i].inputs[1] <== salt[i];
        shareCommit[i] === sc[i].out;
    }

    // (2) Lagrange reconstruction at x = 0 for the fixed points (1, share_0), (2, share_1):
    //     f(0) = 2*share_0 - share_1.
    signal recon <== 2 * share[0] - share[1];
    component eqRecon = IsEqual();
    eqRecon.in[0] <== recon;
    eqRecon.in[1] <== secret;

    // (3) Bind the reconstructed secret to the public group commitment.
    component gc = Poseidon(1);
    gc.inputs[0] <== secret;
    groupCommit === gc.out;

    // (4) valid = the reconstruction matched (the two === already enforce share + group binding).
    valid <== eqRecon.out;
}

component main { public [shareCommit, groupCommit, covenantId] } = ThresholdSigKnowledge(2);
