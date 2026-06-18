pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// commitment_open.circom — prove knowledge of a Poseidon commitment opening (Covex27)
// Foundational privacy primitive.
//   Public:  C = Poseidon(value, blinding)   (the commitment)
//   Private: value, blinding                 (the opening; never revealed)
//   Output:  valid == 1 (a satisfying witness EXISTS only for a correct opening)
// The circuit RECOMPUTES the commitment from the private opening and === enforces it
// equals the public C, so the proof can only be generated when value+blinding really
// open C. This is NOT a `valid <== 1` stub: the === Poseidon constraint is the real
// statement; valid is the gating output the oracle reads at publicSignals[0].
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a
// production multi-party MPC. Verified OFF-CHAIN by the disclosed oracle, never on-chain.

template CommitmentOpen() {
    signal input commitment;                                    // public: C
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input value;                                         // private witness
    signal input blinding;                                      // private witness
    signal output valid;

    component h = Poseidon(2);
    h.inputs[0] <== value;
    h.inputs[1] <== blinding;

    // Genuine constraint: recomputed commitment must equal the public one.
    commitment === h.out;

    valid <== 1;
}

component main { public [commitment, covenantId] } = CommitmentOpen();
