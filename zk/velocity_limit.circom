pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// velocity_limit.circom - prove that the SUM of N (=8) private amounts spent over a
// window does NOT exceed a PUBLIC limit, WITHOUT revealing any individual amount
// (anti-structuring / velocity / cumulative-spend compliance).
//   Private: amounts[N]
//   Public:  limit, windowId, covenantId (H4 cross-covenant replay binding)
//   Output:  valid == 1  iff  amounts[0] + ... + amounts[N-1] <= limit,  else 0
//
// `valid` is a CONSTRAINED OUTPUT derived from LessEqThan - it is NOT a prover-supplied
// input and there is NO `=== 1` assertion, so a proof that verifies genuinely attests the
// inequality. A prover whose amounts exceed `limit` can only ever produce valid == 0; the
// proof still verifies but its public signal truthfully reports the breach, so a relying
// verifier MUST require publicSignals[0] == "1". No field division is used.
//
// SOUNDNESS (why the sum cannot wrap mod p, and why the comparator is sound):
// LessEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). Here the operands are
// `sum` (a sum of prover-supplied field elements) and `limit` (a prover/public field element).
// Without range checks a prover could pick amounts whose true magnitudes exceed `limit` yet
// whose field sum wraps mod the BN254 prime p into the comparator's accept region, forging
// valid=1 for a structured/over-velocity spend. We Num2Bits(ABITS) every amount so each amount
// provably lies in [0, 2^ABITS). With ABITS=64 and N=8:
//   sum  <=  N * (2^64 - 1)  <  8 * 2^64  =  2^67  <<  p  (~2^254)
// so `sum` never wraps the BN254 field and is exact over the integers. `limit` is Num2Bits(LBITS)
// range-bound (LBITS=64) so a malicious wrapped/huge `limit` is rejected outright. The comparator
// width bits=72 strictly exceeds both operands' bounds (sum < 2^67, limit < 2^64 < 2^72), so the
// LessEqThan decision is exact.
//
// COVERS (catalog): compliance / anti-structuring - prove cumulative spend over a window stays
// at or below a disclosed limit without leaking the individual transaction amounts. windowId is a
// public domain separator so a proof for one window cannot be replayed for another; covenantId is
// the per-covenant H4 replay binding.
//
// V1 SIMPLIFICATIONS (documented, honesty-preserving):
//  - Fixed window arity N=8. The amounts vector is exactly 8 slots; spends shorter than 8 pad with
//    zero amounts (0 is a valid in-range amount and does not change the sum), spends longer than 8
//    are out of scope for this v1 and would need a larger N variant.
//  - windowId is carried as a public domain-separation tag and bound into the witness (cbindWin) so
//    the proof is anchored to a specific window, but this circuit does NOT itself prove that the 8
//    amounts actually belong to that window or to that covenant - that binding is enforced by the
//    oracle/caller supplying window-correct amounts. The ZK statement proved here is strictly
//    "8 non-negative <2^64 amounts sum to <= limit".
//  - Amounts are non-negative integers < 2^64 (Num2Bits rejects negatives and overflows).
template VelocityLimit(N, ABITS, LBITS, bits) {
    signal input amounts[N];    // private
    signal input limit;         // public
    signal input windowId;      // public (domain separator for the spend window)
    signal input covenantId;    // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal cbindWin <== windowId * windowId;
    signal output valid;

    // Range-bind every private amount so the running sum provably cannot wrap the field.
    // ABITS=64 -> each amount < 2^64, sum of N=8 < 2^67 << p.
    component rcAmt[N];
    var acc = 0;
    for (var i = 0; i < N; i++) {
        rcAmt[i] = Num2Bits(ABITS);
        rcAmt[i].in <== amounts[i];
        acc += amounts[i];
    }

    // Range-bind the public limit too (a wrapped/huge `limit` is rejected outright).
    component rcLimit = Num2Bits(LBITS);
    rcLimit.in <== limit;

    // valid == 1 iff the (non-wrapping) integer sum is <= limit.
    // operands: sum < 2^67, limit < 2^64, both << 2^bits (bits=72).
    component within = LessEqThan(bits);
    within.in[0] <== acc;
    within.in[1] <== limit;
    valid <== within.out;
}

component main { public [limit, windowId, covenantId] } = VelocityLimit(8, 64, 64, 72);
