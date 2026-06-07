pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "lib/commitment.circom";
include "lib/nullifier.circom";
include "lib/merkle_path.circom";
include "lib/range_check.circom";
include "lib/mimc_hash.circom";

// privacy_mixer_v1.circom — ZK withdraw proof for Covex Privacy Mixer
//
// Proves (without revealing which deposit):
//   1. Knowledge of (secret, nullifier_key) opening a commitment in the Merkle tree
//   2. Correct public nullifier derivation (double-spend prevention)
//   3. Optional: amount in [min_amount, max_amount] matching amount_commitment
//
// Public inputs: merkle_root, nullifier, recipient_hash, amount_commitment,
//                min_amount, max_amount
// Public output: mixer_valid
//
// Honest limitations:
// - Merkle depth 16 (65536 notes max per pool)
// - Nullifier freshness enforced off-chain by oracle DB (hybrid model)
// - recipient_hash is public binding; actual payout wired off-chain/covenant
// - MiMC7-based (not SHA256)

template PrivacyMixerV1(depth) {
    signal input merkle_root;
    signal input nullifier;
    signal input recipient_hash;
    signal input amount_commitment;
    signal input min_amount;
    signal input max_amount;
    signal output mixer_valid;

    signal input secret;
    signal input nullifier_key;
    signal input amount;
    signal input path_elements[depth];
    signal input path_indices[depth];

    // recipient_hash must be non-zero (prevents zero-address withdraw)
    component rz = IsZero();
    rz.in <== recipient_hash;
    rz.out === 0;

    component commit = MixerCommitment();
    commit.secret <== secret;
    commit.nullifier_key <== nullifier_key;
    commit.amount_commitment <== amount_commitment;

    component nullifier_check = NullifierHash();
    nullifier_check.secret <== secret;
    nullifier_check.nullifier_key <== nullifier_key;
    nullifier_check.nullifier <== nullifier;

    component leaf_hash = MiMC7Hash();
    leaf_hash.in <== commit.commitment;
    signal leaf <== leaf_hash.out;

    component path = MerklePathVerifier(depth);
    path.leaf <== leaf;
    path.root <== merkle_root;
    for (var i = 0; i < depth; i++) {
        path.path_elements[i] <== path_elements[i];
        path.path_indices[i] <== path_indices[i];
    }

    component range = MixerRangeCheck(64);
    range.amount <== amount;
    range.amount_commitment <== amount_commitment;
    range.min_amount <== min_amount;
    range.max_amount <== max_amount;

    mixer_valid <== range.in_range;
}

component main { public [merkle_root, nullifier, recipient_hash, amount_commitment, min_amount, max_amount] } = PrivacyMixerV1(16);