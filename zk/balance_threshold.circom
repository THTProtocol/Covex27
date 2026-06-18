pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// balance_threshold.circom — prove balance >= min_balance WITHOUT revealing balance (Covex27)
// KYC-free solvency / income / accredited-investor gating.
//   Public:  commitment = Poseidon(balance, salt), min_balance
//   Private: balance, salt
//   Output:  valid == 1 iff balance >= min_balance
// Two genuine constraints:
//   (1) commitment === Poseidon(balance, salt)  — binds the hidden balance to the public commitment
//   (2) valid = GreaterEqThan(balance, min_balance) — the actual >= predicate (a COMPUTED output)
// The oracle requires valid == publicSignals[0] == 1, so a balance below the threshold
// produces a verifying proof with valid==0 that FAILS the gate (no cheating either way:
// you cannot claim solvency you do not have, and you cannot reveal a different balance).
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a
// production MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template BalanceThreshold(bits) {
    signal input commitment;                                    // public: Poseidon(balance, salt)
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input min_balance;                                   // public threshold
    signal input balance;                                       // private witness
    signal input salt;                                          // private witness
    signal output valid;

    // (1) Bind the hidden balance to the public commitment.
    component h = Poseidon(2);
    h.inputs[0] <== balance;
    h.inputs[1] <== salt;
    commitment === h.out;

    // (2) Range-bind BOTH operands to [0, 2^bits) before comparing. circomlib GreaterEqThan is
    // only sound when its inputs are already known to be < 2^bits; without this a field-wrap
    // witness (balance = v + 2^bits) forges valid==1 with no real funds. Num2Bits is the gate.
    component rbBalance = Num2Bits(bits);
    rbBalance.in <== balance;
    component rbMin = Num2Bits(bits);
    rbMin.in <== min_balance;

    // (3) The real >= predicate. bits must cover the value domain (64-bit balances).
    component ge = GreaterEqThan(bits);
    ge.in[0] <== balance;
    ge.in[1] <== min_balance;

    valid <== ge.out;
}

component main { public [commitment, min_balance, covenantId] } = BalanceThreshold(64);
