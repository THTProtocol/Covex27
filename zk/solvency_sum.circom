pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// solvency_sum.circom — proof of reserves: sum(amount_i) >= threshold, amounts HIDDEN (Covex27)
//   N = 4 reserve buckets.
//   Public:  C[0..3] = Poseidon(amount_i, salt_i)  (one commitment per bucket), threshold
//   Private: amount_i, salt_i  (the actual reserve amounts; never revealed)
//   Output:  valid == 1 iff (amount_0 + amount_1 + amount_2 + amount_3) >= threshold
// Genuine constraints:
//   (1) C[i] === Poseidon(amount_i, salt_i) for each i — binds each hidden amount to its public commitment
//   (2) valid = GreaterEqThan(sum, threshold) — the actual proof-of-reserves predicate
// The oracle reads valid at publicSignals[0] and requires == 1, so a custodian who is short
// of the threshold produces valid==0 and FAILS the gate; the amounts stay private. This is a
// real solvency statement, not a `valid <== 1` stub.
// bits = 64 caps each amount at < 2^64; sum of 4 stays < 2^66 < BN254 field, no overflow.
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a
// production MPC. Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain.

template SolvencySum(N, bits) {
    signal input commitments[N];                                // public: per-bucket Poseidon commitments
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input threshold;                                     // public threshold
    signal input amounts[N];                                    // private witnesses
    signal input salts[N];                                      // private witnesses
    signal output valid;

    // (1) Bind each hidden amount to its public commitment + accumulate the sum. Each amount is
    // range-bound to [0, 2^bits) so the sum cannot field-wrap: without this a single amount of
    // v + 2^bits would forge a verifying valid==1 with no real reserves.
    component h[N];
    component rbAmt[N];
    var acc = 0;
    for (var i = 0; i < N; i++) {
        rbAmt[i] = Num2Bits(bits);
        rbAmt[i].in <== amounts[i];
        h[i] = Poseidon(2);
        h[i].inputs[0] <== amounts[i];
        h[i].inputs[1] <== salts[i];
        commitments[i] === h[i].out;
        acc += amounts[i];
    }
    signal total <== acc;

    // (2) The real proof-of-reserves predicate. With each amount < 2^bits and N<=4, the sum is
    // < 2^(bits+2); range-bind total and threshold to that domain so GreaterEqThan is sound.
    component rbTotal = Num2Bits(bits + 2);
    rbTotal.in <== total;
    component rbThreshold = Num2Bits(bits + 2);
    rbThreshold.in <== threshold;

    component ge = GreaterEqThan(bits + 2);
    ge.in[0] <== total;
    ge.in[1] <== threshold;

    valid <== ge.out;
}

component main { public [commitments, threshold, covenantId] } = SolvencySum(4, 64);
