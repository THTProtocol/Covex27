pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// equality_of_commitments.circom - prove that TWO public Poseidon commitments hide the SAME
// secret value, WITHOUT revealing the value or either blinding salt (Covex27, self-contained).
//
// Use case: link a hidden quantity across two contexts without disclosing it - e.g. prove the
// balance you committed to in covenant A is the same balance committed in covenant B, or that a
// bid commitment matches an earlier escrow commitment, or that two parties committed to the same
// agreed amount. The two commitments use INDEPENDENT salts, so they are unlinkable on their own;
// this circuit proves they open to one common value.
//
//   Public:  commitmentA = Poseidon(value, saltA),
//            commitmentB = Poseidon(value, saltB),
//            covenantId  (H4 cross-covenant replay binding)
//   Private: value, saltA, saltB
//   Output:  valid == 1  iff  commitmentA == Poseidon(value, saltA)
//                       AND   commitmentB == Poseidon(value, saltB)
//
// HONESTY / SOUNDNESS:
//   (1) The two openings are enforced by IsEqual booleans whose product is the COMPUTED output
//       `valid` - NOT a prover input and NOT forced via `=== 1`. Because BOTH commitments are
//       recomputed from the SAME private `value` signal, a verifying proof with valid==1
//       genuinely attests that the two public commitments open to one common value. If the prover
//       supplies a `value`/`salt` that does not match a commitment, that IsEqual is 0 and valid
//       is 0 (a satisfiable proof of inequality), so there is no dangling/unconstrained check;
//       the oracle gates on valid == publicSignals[0] == 1.
//   (2) No range checks are needed: the statement is purely Poseidon-preimage equality, no
//       inequality comparator is applied to prover-controlled field elements.
//   (3) covenantId is bound via cbindH4 = covenantId*covenantId so a proof for covenant A cannot
//       be replayed against covenant B.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot10_final.ptau), NOT a production
// multi-party MPC. The Groth16 proof is verified OFF-CHAIN (fail-closed), never on-chain.

template EqualityOfCommitments() {
    // public
    signal input commitmentA;
    signal input commitmentB;
    signal input covenantId;
    signal cbindH4 <== covenantId * covenantId;   // H4 replay binding (real constraint)
    // private
    signal input value;
    signal input saltA;
    signal input saltB;
    signal output valid;

    // Recompute both commitments from the SAME private value (different salts).
    component hA = Poseidon(2);
    hA.inputs[0] <== value;
    hA.inputs[1] <== saltA;

    component hB = Poseidon(2);
    hB.inputs[0] <== value;
    hB.inputs[1] <== saltB;

    // Booleans: does each public commitment match its recomputation?
    component eqA = IsEqual();
    eqA.in[0] <== hA.out;
    eqA.in[1] <== commitmentA;

    component eqB = IsEqual();
    eqB.in[0] <== hB.out;
    eqB.in[1] <== commitmentB;

    // valid = (A opens to value) AND (B opens to the SAME value).
    valid <== eqA.out * eqB.out;
}

component main { public [commitmentA, commitmentB, covenantId] } = EqualityOfCommitments();
