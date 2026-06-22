pragma circom 2.0.0;

include "node_modules/circomlib/circuits/mimc.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// age_verification.circom — Prove age >= min_age without revealing birth year (Covex27)
// Private: birth_year
// Public: commitment = MiMC7(birth_year), current_year, min_age, valid
// Constraint: current_year - birth_year >= min_age  <=>  birth_year <= current_year - min_age
//
// SOUNDNESS: LessEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). The MiMC7
// commitment pins birth_year to a fixed FIELD element but does NOT range-bind it to [0, 2^bits):
// MiMC7 accepts any preimage in [0, p), so a prover who controls the published commitment (it is
// computed from their own private birth_year for their own age-gate covenant) can choose birth_year
// near the BN254 prime p. Then the comparator's internal X = birth_year + 2^bits - max_birth_year - 1
// wraps mod p into [0, 2^bits) (sign bit cleared) and forges valid=1 for an UNDERAGE person whose
// true integer relation birth_year <= current_year - min_age is FALSE. Likewise max_birth_year =
// current_year - min_age is a field subtraction that wraps negative if min_age > current_year.
// FIX: bit-constrain BOTH comparator operands so each provably stays in [0, 2^bits):
//   in[0] = birth_year      -> Num2Bits(bits) (still ALSO MiMC7-bound for privacy)
//   in[1] = max_birth_year  -> Num2Bits(bits) on current_year - min_age, which also forces that
//                              field subtraction to be a true non-negative integer (no wrap when
//                              min_age > current_year). This pins in[1] without needing separate
//                              Num2Bits on current_year/min_age.
// (No Num2Bits is needed on `commitment` itself: it is the hash output, never fed to a comparator.)
template AgeVerification(bits) {
    signal input commitment;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input current_year;
    signal input min_age;
    signal input birth_year; // private witness
    signal output valid;

    component hasher = MiMC7(91);
    hasher.x_in <== birth_year;
    hasher.k <== 0;
    commitment === hasher.out;

    // Range-bind every comparator operand so neither the subtraction nor the comparison can
    // wrap the field and forge valid=1. These Num2Bits also reject negative/huge field elements.
    // in[0]: birth_year must be a real integer in [0, 2^bits).
    component rcBirth = Num2Bits(bits);
    rcBirth.in <== birth_year;
    // in[1]: range-bind max_birth_year itself. current_year - min_age is a FIELD subtraction; if
    // min_age > current_year it wraps to a near-p field-negative that the comparator would mishandle.
    // Forcing it into [0, 2^bits) makes the subtraction a true non-negative integer AND pins in[1].
    signal max_birth_year <== current_year - min_age;
    component rcMaxBirth = Num2Bits(bits);
    rcMaxBirth.in <== max_birth_year;

    component youngEnough = LessEqThan(bits);
    youngEnough.in[0] <== birth_year;
    youngEnough.in[1] <== max_birth_year;

    valid <== youngEnough.out;
}

component main { public [commitment, current_year, min_age, covenantId] } = AgeVerification(32);