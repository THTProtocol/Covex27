pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// nft_trait_reveal.circom - selectively reveal ONE trait of a committed NFT metadata set.
//
// An NFT's full metadata is committed as a Poseidon Merkle tree (depth `depth`) whose leaves are
// the per-trait commitments leaf_i = Poseidon(traitIndex_i, traitValue_i). The single public
// metadataRoot binds the entire trait set. This circuit proves that the disclosed pair
// (traitIndex, traitValue) is a genuine leaf of that committed tree WITHOUT revealing any of the
// other traits (their values stay inside the private Merkle path siblings).
//
//   Public:  metadataRoot  - Poseidon Merkle root committing the whole trait set
//            traitIndex     - which trait slot is being revealed (e.g. 3 = "Background")
//            traitValue     - the revealed value of that trait (e.g. hash/enum of "Gold")
//            covenantId     - H4 cross-covenant replay binding
//   Private: pathElements[depth] - Merkle sibling hashes along the path to the trait leaf
//            pathIndices[depth]   - 0 = current node is left child, 1 = right child
//   Output:  valid  - CONSTRAINED OUTPUT, == 1 iff the recomputed root equals metadataRoot
//            (i.e. Poseidon(traitIndex, traitValue) is genuinely in the committed set), else 0.
//
// HONESTY / soundness notes:
//   - `valid` is derived from an IsEqual on the recomputed root, never a prover input and never a
//     hard `valid <== 1` stub. A verifying proof with valid==1 therefore IMPLIES the trait is in
//     the committed metadata set under the public root.
//   - pathIndices are each booleanity-constrained (b*(b-1)===0) so the left/right selection mux is
//     sound; a prover cannot use a fractional index to fabricate a path.
//   - traitIndex and traitValue are fed ONLY into Poseidon (a permutation over the full field), not
//     into any range comparator, so no Num2Bits range check is required here: there is no integer
//     comparison that a field-wrap could bypass. The only "comparison" is the IsEqual of two
//     Poseidon outputs, which is exact field equality and cannot be wrapped.
//   - The committer is responsible for choosing distinct (traitIndex, traitValue) leaves; the
//     circuit attests membership, not uniqueness of slots within the set.
//
// HONESTY: keys come from a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a
// production multi-party MPC. Proofs are verified OFF-CHAIN by the disclosed Covex oracle
// (fail-closed), never by an on-chain pairing verifier.
//
// v1 simplification: tree depth is fixed at 4 (16 trait slots). NFTs with more than 16 trait
// commitments need a deeper instantiation; this is a parameter, not a soundness gap.

template NftTraitReveal(depth) {
    signal input metadataRoot;            // public: Poseidon Merkle root over all trait leaves
    signal input traitIndex;              // public: which trait slot is revealed
    signal input traitValue;              // public: the revealed trait value
    signal input covenantId;              // public: H4 replay binding
    signal cbindH4 <== covenantId * covenantId;

    signal input pathElements[depth];     // private: Merkle siblings
    signal input pathIndices[depth];      // private: 0 = left, 1 = right
    signal output valid;

    // Leaf = Poseidon(traitIndex, traitValue) - the per-trait commitment.
    component leafH = Poseidon(2);
    leafH.inputs[0] <== traitIndex;
    leafH.inputs[1] <== traitValue;

    // Recompute the Merkle root from the leaf up `depth` levels.
    signal cur[depth + 1];
    cur[0] <== leafH.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        // booleanity of the path index keeps the selection mux sound.
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        // if index==0: (left,right)=(cur, sibling); if index==1: (left,right)=(sibling, cur).
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }

    // valid == 1 iff the recomputed root matches the committed public root (exact field equality).
    component rootEq = IsEqual();
    rootEq.in[0] <== cur[depth];
    rootEq.in[1] <== metadataRoot;
    valid <== rootEq.out;
}

component main { public [metadataRoot, traitIndex, traitValue, covenantId] } = NftTraitReveal(4);
