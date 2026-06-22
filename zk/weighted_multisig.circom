pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// weighted_multisig.circom - prove that the SUM of the weights of the PRESENT signers
// meets a public threshold, WITHOUT revealing WHICH signers are present.
//
// STATEMENT proven by a verifying proof (valid == 1):
//   sum_{i=0..N-1} present[i] * weight[i]  >=  threshold
// where each present[i] is a 0/1 boolean (enforced) and the weight[i] are the public,
// published per-signer weights for this covenant. This is weighted M-of-N governance:
// each signer carries a voting weight, and an action is authorized only when the combined
// weight of the signers who approved (present) reaches the threshold.
//
//   Public:  threshold, covenantId, weight[0..N-1]   (the weight set is public in v1)
//   Private: present[0..N-1]                          (which signers approved, hidden)
//   Output:  valid == (weightedSum >= threshold)
//
// `valid` is a CONSTRAINED OUTPUT (valid <== GreaterEqThan.out), never a prover-supplied
// input and never `=== 1`. A verifying proof with valid==1 therefore genuinely attests that
// the present signers' combined weight reaches the threshold.
//
// COVERS: governance - weighted M-of-N approval threshold (board / DAO / multisig where
// signers carry unequal voting power; e.g. shareholders by stake, council seats by tier).
//
// SOUNDNESS notes:
//   * Each present[i] is constrained boolean: present[i]*(present[i]-1) === 0. A non-boolean
//     present[i] (e.g. a large field element) cannot satisfy the witness, so it cannot inflate
//     the weighted sum past the threshold.
//   * weightedSum and threshold are free numeric operands fed to GreaterEqThan(bits). LessEqThan
//     (used internally by GreaterEqThan) is only sound when BOTH operands lie in [0, 2^bits).
//     Without range checks a prover could choose weights / threshold near the BN254 prime p so a
//     product or sum wraps mod p into the comparator's accept (or reject) region, forging the
//     outcome. We Num2Bits range-check every operand:
//       - each weight[i] <= 2^32-1  (Num2Bits(32)); covers any realistic per-signer voting power.
//       - threshold       <= 2^64-1 (Num2Bits(64)).
//       - present[i] is 0/1, so present[i]*weight[i] < 2^32, and the sum of N <= 16 such terms is
//         < 16 * 2^32 = 2^36 < 2^64 <= 2^bits. weightedSum is therefore provably in-range for the
//         comparator (bits=64), so the >= test cannot be wrapped.
//   * covenantId is bound (cbindH4 = covenantId*covenantId) and published to prevent cross-covenant
//     replay (H4). It is range-checked too so it is a well-formed field element of bounded size.
//
// HONESTY NOTES:
//   * v1 simplification: the weight set weight[0..N-1] is PUBLIC. A future upgrade can publish only
//     a Poseidon commitment to the weight set (and pass the weights privately, opened against the
//     commitment) so the per-signer weights are hidden; that is a committed-weightset upgrade and is
//     NOT implemented here. With public weights, an observer who also learns the threshold can in
//     principle reason about which subsets reach it, but the specific present[] vector stays hidden.
//   * This circuit proves the WEIGHT MATH only. It does NOT verify any signatures: it does not prove
//     that the present signers actually authorized anything. Binding "present" to real approvals
//     (e.g. per-signer EdDSA signatures, ref signed_attribute_threshold.circom) is a future upgrade;
//     in v1 the prover asserts the present[] set and the circuit checks only that its weighted sum
//     reaches the threshold. The oracle that consumes this proof is the trusted component.
//   * Keys come from a single-contributor Covex DEV ceremony (pot*_final.ptau), NOT a production
//     multi-party MPC. The proof is verified OFF-CHAIN by the disclosed oracle (fail-closed), never
//     by an on-chain pairing verifier.

template WeightedMultisig(N, bits) {
    // Public.
    signal input threshold;        // combined weight required to authorize
    signal input covenantId;       // H4 cross-covenant replay binding
    signal input weight[N];        // per-signer public weights

    // Private.
    signal input present[N];       // 1 if signer i approved, else 0 (which signers is hidden)

    signal output valid;

    // H4 binding: force covenantId into the witness/constraints, publish it.
    signal cbindH4 <== covenantId * covenantId;
    component rcCovenant = Num2Bits(254);
    rcCovenant.in <== covenantId;

    // Range-bind threshold (comparator operand).
    component rcThreshold = Num2Bits(64);
    rcThreshold.in <== threshold;

    // Range-bind each weight and enforce each present[i] is a strict boolean, then accumulate
    // the weighted sum. weightedSum < N * 2^32 <= 2^36 < 2^64, so it is a sound comparator operand.
    component rcWeight[N];
    signal term[N];
    signal acc[N + 1];
    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        rcWeight[i] = Num2Bits(32);
        rcWeight[i].in <== weight[i];

        present[i] * (present[i] - 1) === 0;     // present[i] in {0,1}
        term[i] <== present[i] * weight[i];      // 0 or weight[i]
        acc[i + 1] <== acc[i] + term[i];
    }
    signal weightedSum <== acc[N];

    // valid == (weightedSum >= threshold). Constrained output, both operands range-bound above.
    component meets = GreaterEqThan(bits);
    meets.in[0] <== weightedSum;
    meets.in[1] <== threshold;
    valid <== meets.out;
}

// N = 7 signers, comparator width = 64 bits.
component main { public [threshold, covenantId, weight] } = WeightedMultisig(7, 64);
