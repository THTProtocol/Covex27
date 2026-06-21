pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// commit_reveal_timed.circom - prove knowledge of the opening of a public Poseidon commitment.
//   Public:  commitment = Poseidon(value, salt)   (the sealed commitment)
//            covenantId                            (H4 cross-covenant replay binding)
//   Private: value, salt                           (the opening; never revealed)
//   Output:  valid == 1  iff  commitment == Poseidon(value, salt), else 0
//
// The circuit RECOMPUTES Poseidon(value, salt) from the private opening and checks it equals
// the public commitment. Because Poseidon is preimage/collision-resistant, a satisfying witness
// with valid==1 can only be produced by someone who actually knows (value, salt) opening the
// commitment. This proves the true statement: "the prover knows the opening of `commitment`".
//
// MANDATORY PATTERN: `valid` is a CONSTRAINED OUTPUT derived from IsEqual (NOT a prover input,
// NOT `valid <== 1` with a dangling === ). The oracle reads valid at publicSignals[0]; a wrong
// opening forces valid==0, which the signing gate rejects.
//
// SOUNDNESS NOTE: IsEqual compares two canonical BN254 field elements (the public `commitment`
// and the Poseidon hash output). Both are genuine field elements in [0,p), so there is no
// product/field-wrap concern of the kind that affects LessEqThan over multiplied operands;
// therefore no Num2Bits range gadget is required here (there are no numeric comparators fed by
// arithmetic products). value and salt are unconstrained-magnitude field elements by design:
// the statement is purely "I know a preimage", not a range claim.
//
// COVERS (catalog use cases): randomness beacon (commit a seed, later reveal+prove opening so
// the beacon value is verifiably the pre-committed one), proof-of-authorship / first-to-commit
// (commit a hash of your work at time T, prove the opening later to claim priority), and
// sealed-bid open (commit a bid, prove the opening at reveal time to bind it to your sealed bid).
// The "timed" aspect is enforced OFF-CIRCUIT by the covenant's timelock + the oracle gate; this
// circuit supplies the binding cryptographic opening proof that the revealed value matches the
// earlier commitment.
//
// HONESTY: keys are a single-contributor Covex DEV ceremony (pot*_final.ptau), NOT a production
// multi-party MPC. Verified OFF-CHAIN by the disclosed oracle, never on-chain (Kaspa has no
// pairing verifier). A verifying proof implies the prover knows the opening; nothing more.

template CommitRevealTimed() {
    signal input commitment;                                    // public: C
    signal input covenantId;                                    // public: H4 binding
    signal cbindH4 <== covenantId * covenantId;                 // bind covenantId into the system
    signal input value;                                         // private witness
    signal input salt;                                          // private witness
    signal output valid;

    // Recompute the commitment from the private opening.
    component h = Poseidon(2);
    h.inputs[0] <== value;
    h.inputs[1] <== salt;

    // Genuine constrained output: valid == 1 iff recomputed hash equals the public commitment.
    component eq = IsEqual();
    eq.in[0] <== commitment;
    eq.in[1] <== h.out;
    valid <== eq.out;
}

component main { public [commitment, covenantId] } = CommitRevealTimed();
