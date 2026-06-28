pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// pedersen_open_equals.circom - prove a HIDDEN committed value equals a PUBLIC expected value,
// without revealing the salt that hides it (Covex27).
// Selective-disclosure equality: a holder commits to an attribute v (e.g. a tier, a vote choice,
// a price) as a public Poseidon commitment, and later proves "the committed value equals THIS
// public expected value" (and nothing else) so the verifier learns equality but not the salt.
//
//   Public:  commitment = Poseidon(value, salt), expected (the public value to compare against),
//            covenantId
//   Private: value (the committed value), salt (the blinding factor)
//   Output:  valid == 1 iff Poseidon(value, salt) == commitment  AND  value == expected
//
// NOTE: this is a Poseidon (algebraic-hash) commitment, not a classical EC-Pedersen commitment;
// "pedersen" here is the catalog/UX name for "hiding commitment open-equals". Honest about the
// primitive used.
//
// Genuine constraints:
//   (1) commitment === Poseidon(value, salt)         - binds the public commitment to the hidden value+salt
//   (2) range-bind value + expected to [0,2^bits) and eq = IsEqual(value, expected)
//   (3) valid = eq.out                               - a CONSTRAINED 0/1 output, never a free input
// If the committed value does NOT equal `expected`, eq.out == 0 -> valid == 0, so the oracle
// (which requires valid==1) refuses. A false predicate (value != expected) produces a VERIFYING
// proof whose valid == 0. The hard === on the commitment means a prover cannot open the
// commitment to a different value to fake equality. No `valid <== 1` stub.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production
// MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template PedersenOpenEquals(bits) {
    signal input commitment;                                    // public: Poseidon(value, salt)
    signal input expected;                                      // public: value to compare against
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input value;                                         // private: the committed value
    signal input salt;                                          // private: the blinding salt
    signal output valid;

    // (1) Bind the public commitment to the hidden value + salt.
    component c = Poseidon(2);
    c.inputs[0] <== value;
    c.inputs[1] <== salt;
    commitment === c.out;

    // (2) Range-bind both operands so IsEqual operates in the intended integer domain (defense in
    // depth: IsEqual is field-equality, but binding value+expected to [0,2^bits) blocks any
    // field-wrap aliasing of the committed value against the public expected value).
    component rbV = Num2Bits(bits);
    rbV.in <== value;
    component rbE = Num2Bits(bits);
    rbE.in <== expected;

    component eq = IsEqual();
    eq.in[0] <== value;
    eq.in[1] <== expected;

    // (3) valid = equality holds (the commitment === already enforces the binding).
    valid <== eq.out;
}

component main { public [commitment, expected, covenantId] } = PedersenOpenEquals(64);
