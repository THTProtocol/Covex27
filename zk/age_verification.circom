pragma circom 2.0.0;

include "node_modules/circomlib/circuits/mimc.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// age_verification.circom — Prove age >= min_age without revealing birth year (Covex27)
// Private: birth_year
// Public: commitment = MiMC7(birth_year), current_year, min_age, valid
// Constraint: current_year - birth_year >= min_age  <=>  birth_year <= current_year - min_age

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

    signal max_birth_year <== current_year - min_age;

    component youngEnough = LessEqThan(bits);
    youngEnough.in[0] <== birth_year;
    youngEnough.in[1] <== max_birth_year;

    valid <== youngEnough.out;
}

component main { public [commitment, current_year, min_age, covenantId] } = AgeVerification(32);