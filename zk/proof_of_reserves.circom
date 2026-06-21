pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// proof_of_reserves.circom - exchange proof-of-reserves / solvency-with-users (Covex)
//
// STATEMENT (v1):
//   Prove BOTH of the following at once:
//     (A) the prover's own balance leaf  leaf = Poseidon(userId, balance)  is a member of a
//         PUBLISHED Merkle root (depth 4, 16-leaf user-liability tree), and
//     (B) the exchange's PUBLIC claimedTotal of reserves is >= its PUBLIC liabilities.
//   valid <== (in-tree) * (claimedTotal >= liabilities).
//
//   Public:  root, claimedTotal, liabilities, covenantId
//   Private: userId, balance, pathElements[4], pathIndices[4]
//   Output:  valid  (publicSignals[0])
//
// PUBLIC SIGNAL LAYOUT (snarkjs order = output first, then `public [...]` order):
//   [0] valid
//   [1] root
//   [2] claimedTotal
//   [3] liabilities
//   [4] covenantId
//
// V1 SIMPLIFICATION (documented honestly):
//   This v1 does NOT prove that claimedTotal/liabilities are the cryptographic SUM of the leaves
//   in `root`. It proves (A) one user's leaf is inside the published liabilities tree, so a user
//   can confirm their own balance was INCLUDED, AND (B) the exchange's two PUBLIC scalars satisfy
//   reserves >= liabilities. The link between the published `liabilities` scalar and the tree of
//   per-user balances is an off-chain attestation in v1, NOT enforced in-circuit. A user therefore
//   gets a real inclusion guarantee plus a real reserves>=liabilities inequality, but the
//   completeness of the tree (that the exchange did not omit users or understate the sum) is not
//   yet proven. The FULL upgrade is a Merkle sum-tree (each node carries a running subtotal and the
//   root's subtotal === liabilities), which makes (A) and (B) provably the same number. That is a
//   later upgrade and is called out so no one over-reads this proof.
//
// SOUNDNESS NOTES:
//   - `valid` is a CONSTRAINED OUTPUT (a product of two boolean sub-results), never a prover input
//     and never `=== 1`. A prover who is over-leveraged (claimedTotal < liabilities) or whose leaf
//     is not in the tree gets valid=0 and FAILS the oracle gate (oracle requires publicSignals[0]==1).
//   - claimedTotal and liabilities are Num2Bits range-bound to [0, 2^bits) so the GreaterEqThan
//     comparator cannot be bypassed by a field-wrap (an operand near the BN254 prime).
//   - covenantId is bound via cbindH4 = covenantId*covenantId and is public, for H4 replay binding.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template ProofOfReserves(depth, bits) {
    signal input root;                 // public: published per-user liability Merkle root
    signal input claimedTotal;         // public: exchange's claimed total reserves
    signal input liabilities;          // public: exchange's total liabilities
    signal input covenantId;           // public: H4 cross-covenant replay binding
    signal cbindH4 <== covenantId * covenantId;

    signal input userId;               // private: the user's identifier scalar
    signal input balance;              // private: the user's balance in the tree
    signal input pathElements[depth];  // private: Merkle siblings
    signal input pathIndices[depth];   // private: 0 = left, 1 = right

    signal output valid;

    // (A) Membership of the prover's leaf = Poseidon(userId, balance) under the published root.
    component leafH = Poseidon(2);
    leafH.inputs[0] <== userId;
    leafH.inputs[1] <== balance;

    signal cur[depth + 1];
    cur[0] <== leafH.out;
    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;                       // index is a bit
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    // inTree = 1 iff the recomputed root equals the public root, else 0 (constrained, not asserted,
    // so a non-member yields valid=0 rather than an unsatisfiable witness).
    component rootEq = IsEqual();
    rootEq.in[0] <== cur[depth];
    rootEq.in[1] <== root;
    signal inTree <== rootEq.out;

    // (B) Solvency: claimedTotal >= liabilities. Range-bind both operands so GreaterEqThan is sound.
    component rbTotal = Num2Bits(bits);
    rbTotal.in <== claimedTotal;
    component rbLiab = Num2Bits(bits);
    rbLiab.in <== liabilities;

    component solvent = GreaterEqThan(bits);
    solvent.in[0] <== claimedTotal;
    solvent.in[1] <== liabilities;

    // valid <== (in-tree) * (claimedTotal >= liabilities). Both must hold.
    valid <== inTree * solvent.out;
}

component main { public [root, claimedTotal, liabilities, covenantId] } = ProofOfReserves(4, 64);
