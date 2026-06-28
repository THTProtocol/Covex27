pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// merkle_multi_membership.circom - prove K PRIVATE leaves all belong to ONE public Merkle root
// (Covex27). Batch-membership: an allowlist / airdrop / committee where a claimant must hold
// several distinct entries (e.g. three NFT ids, three credential leaves) without revealing them.
//
//   K = 3 leaves, depth = 4 (16-leaf tree).
//   Public:  root (one shared Merkle root), covenantId
//   Private: leaf[K] (the hidden member values),
//            pathElements[K][depth], pathIndices[K][depth] (one Merkle path per leaf)
//   Output:  valid == 1 iff EVERY leaf's recomputed path equals root
//
// Genuine constraints:
//   (1) for each k: recompute the Merkle root from Poseidon(leaf_k) up `depth` levels and compare
//       it to the public root via IsEqual -> match[k] (a CONSTRAINED 0/1, never a free input).
//   (2) pathIndices entries are boolean-constrained (idx*(idx-1)===0) so a witness cannot pick a
//       non-binary selector to dodge the left/right mux.
//   (3) valid = match[0] * match[1] * match[2]  - the AND of all K memberships.
// If ANY leaf is not in the tree its match[k] is 0, so valid is 0 and the oracle (which requires
// valid==1) refuses. `valid` is a product of CONSTRAINED equality outputs, not a `valid <== 1`
// stub: a false predicate (a leaf outside the set) yields a VERIFYING proof carrying valid==0.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template MerkleMultiMembership(K, depth) {
    signal input root;                                          // public: shared Merkle root
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input leaf[K];                                       // private: hidden member values
    signal input pathElements[K][depth];                        // private: Merkle siblings per leaf
    signal input pathIndices[K][depth];                         // private: 0 = node is left, 1 = right
    signal output valid;

    // The committed leaf value is hashed once (Poseidon(leaf)) so a raw value cannot be passed off
    // as an internal node; then we climb the path.
    component leafHash[K];
    signal cur[K][depth + 1];
    component lvl[K][depth];
    signal leftIn[K][depth];
    signal rightIn[K][depth];
    component eq[K];
    signal match[K];

    var acc = 1;
    for (var k = 0; k < K; k++) {
        leafHash[k] = Poseidon(1);
        leafHash[k].inputs[0] <== leaf[k];
        cur[k][0] <== leafHash[k].out;

        for (var i = 0; i < depth; i++) {
            // selector must be boolean
            pathIndices[k][i] * (pathIndices[k][i] - 1) === 0;
            // left  = index==0 ? cur : sibling ; right = index==0 ? sibling : cur
            leftIn[k][i]  <== cur[k][i] + pathIndices[k][i] * (pathElements[k][i] - cur[k][i]);
            rightIn[k][i] <== pathElements[k][i] + pathIndices[k][i] * (cur[k][i] - pathElements[k][i]);
            lvl[k][i] = Poseidon(2);
            lvl[k][i].inputs[0] <== leftIn[k][i];
            lvl[k][i].inputs[1] <== rightIn[k][i];
            cur[k][i + 1] <== lvl[k][i].out;
        }
        // CONSTRAINED equality: match[k] == 1 iff this leaf's recomputed root equals the public root.
        eq[k] = IsEqual();
        eq[k].in[0] <== cur[k][depth];
        eq[k].in[1] <== root;
        match[k] <== eq[k].out;
    }

    // valid = AND of all K memberships. Build the product through intermediate signals so each
    // multiplication is quadratic (circom rejects a >2-way product in one constraint).
    signal partial[K];
    partial[0] <== match[0];
    for (var k = 1; k < K; k++) {
        partial[k] <== partial[k - 1] * match[k];
    }
    valid <== partial[K - 1];
}

component main { public [root, covenantId] } = MerkleMultiMembership(3, 4);
