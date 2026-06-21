pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// anonymous_vote.circom - anonymous + quadratic voting / DAO token vote (Covex generic primitive)
//
// STATEMENT proven (zero-knowledge):
//   (1) ELIGIBILITY: the prover's voterCommitment is a leaf of the depth-4 membership tree whose
//       root is the public `root`. The membership is computed and compared to root with IsEqual,
//       producing a 0/1 `inTree` signal (NOT a hard ===), so it can be ANDed into `valid`.
//   (2) ONE VOTE: the public `nullifier` === Poseidon(voterSecret, electionId). Deterministic per
//       (identity, election), so the oracle stores it to reject a second vote by the same secret.
//   (3) BALLOT BINDING: the public `voteCommitment` === Poseidon(choice, salt) hides the choice
//       while binding the proof to exactly one committed ballot (revealed/tallied later off-chain).
//   (4) QUADRATIC BUDGET: weight*weight <= budget. In quadratic voting the cost of casting `weight`
//       votes is weight^2 credits; this proves the voter stays within their public `budget`.
//
//   valid <== inTree * (weight^2 <= budget).
//   valid is a CONSTRAINED OUTPUT (product of the two real 0/1 sub-results), never a prover input
//   and never `=== 1`. A verifying proof with valid==1 therefore implies ALL of (1)-(4) hold.
//
// Public:  root, electionId, nullifier, voteCommitment, budget, covenantId
// Private: voterSecret, choice, salt, weight, pathElements[4], pathIndices[4]
//
// Note: voterCommitment is the membership LEAF and equals Poseidon(voterSecret). Deriving the leaf
// from voterSecret (rather than taking it as a free input) binds eligibility (1), one-vote (2) and
// thus the whole ballot to the SAME secret the voter holds. This is a deliberate, documented choice:
// the leaf published in the eligibility set must be Poseidon(voterSecret).
//
// SOUNDNESS: weight and budget are free numeric operands fed to a comparator. LessEqThan(bits) is
// only sound when both operands are in [0, 2^bits); otherwise a prover could pick a field element
// near the BN254 prime so weight*weight wraps mod p into the accept region. We Num2Bits range-check
// both: weight <= 2^32-1 => weight*weight < 2^64 < 2^bits; budget <= 2^64-1 < 2^bits. bits=128.
//
// HONESTY: keys come from a single-contributor Covex DEV ceremony (pot*_final.ptau), NOT a
// production multi-party MPC. The proof is verified OFF-CHAIN by the disclosed oracle (fail-closed),
// never by an on-chain pairing verifier. The oracle additionally tracks the spent-nullifier set to
// enforce one-vote-per-identity and tallies the revealed voteCommitments.

template AnonymousVote(depth, bits) {
    // Public
    signal input root;            // membership Merkle root (depth-4)
    signal input electionId;      // election / proposal domain separator
    signal input nullifier;       // emitted one-vote nullifier
    signal input voteCommitment;  // committed ballot = Poseidon(choice, salt)
    signal input budget;          // quadratic-voting credit budget
    signal input covenantId;      // H4 cross-covenant replay binding

    // Private
    signal input voterSecret;     // secret identity scalar
    signal input choice;          // hidden vote choice
    signal input salt;            // ballot blinding salt
    signal input weight;          // number of votes cast (cost = weight^2)
    signal input pathElements[depth];
    signal input pathIndices[depth];

    signal output valid;

    // H4 binding: force covenantId into the witness/constraints.
    signal cbindH4 <== covenantId * covenantId;

    // (1) Eligibility leaf = Poseidon(voterSecret), recompute the Merkle root, compare with IsEqual.
    component leaf = Poseidon(1);
    leaf.inputs[0] <== voterSecret;

    signal cur[depth + 1];
    cur[0] <== leaf.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;           // index is a bit
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    component rootEq = IsEqual();
    rootEq.in[0] <== cur[depth];
    rootEq.in[1] <== root;
    signal inTree <== rootEq.out;                              // 1 iff member

    // (2) One-vote nullifier === Poseidon(voterSecret, electionId). Hard constraint: the proof is
    // only satisfiable when the public nullifier is the correct deterministic value.
    component nf = Poseidon(2);
    nf.inputs[0] <== voterSecret;
    nf.inputs[1] <== electionId;
    nullifier === nf.out;

    // (3) Ballot binding voteCommitment === Poseidon(choice, salt). Hard constraint.
    component vc = Poseidon(2);
    vc.inputs[0] <== choice;
    vc.inputs[1] <== salt;
    voteCommitment === vc.out;

    // (4) Quadratic budget: weight^2 <= budget. Range-bind both operands so the square cannot wrap.
    component rcWeight = Num2Bits(32);
    rcWeight.in <== weight;
    component rcBudget = Num2Bits(64);
    rcBudget.in <== budget;

    signal weightSq <== weight * weight;
    component withinBudget = LessEqThan(bits);
    withinBudget.in[0] <== weightSq;
    withinBudget.in[1] <== budget;

    // valid = eligible AND within quadratic budget.
    valid <== inTree * withinBudget.out;
}

component main { public [root, electionId, nullifier, voteCommitment, budget, covenantId] } = AnonymousVote(4, 128);
