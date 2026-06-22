pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsaposeidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// twap_bound.circom - prove a PUBLIC price lies within an oracle-signed TWAP band,
// WITHOUT revealing the signed TWAP value itself.
//
// STATEMENT proven by a verifying proof:
//   1. The oracle (BabyJubjub public key Ax, Ay) signed the message
//        msg = Poseidon(twap, windowId)
//      with EdDSA-Poseidon, producing (R8x, R8y, S). This binds a specific twap to
//      a specific time window under the oracle's key, so the prover cannot invent or
//      shift the reference TWAP - it must be the value the oracle attested for that
//      window.
//   2. The public price is inside the proportional band around the signed twap:
//        price * 10000 >= twap * (10000 - bps)   (price not below the band floor)
//        price * 10000 <= twap * (10000 + bps)   (price not above the band ceiling)
//      i.e. |price - twap| / twap <= bps/10000, expressed by cross-multiplication so
//      there is NO field division on signals.
//   valid == (signature ok) * (price >= floor) * (price <= ceiling).
//
//   Public:  Ax, Ay, price, bps, windowId, covenantId
//   Private: twap, R8x, R8y, S
//
// COVERS: DeFi price-within-a-signed-TWAP-band checks driven by an oracle input, e.g.
//   slippage / oracle-deviation guards (only act when the live price is within bps of
//   the oracle TWAP for the window), liquidation price sanity bands, and AMM-vs-oracle
//   deviation gating - all WITHOUT revealing the exact TWAP the oracle published.
//
// SOUNDNESS notes:
//   * `valid` is a CONSTRAINED OUTPUT (product of three 0/1 signals), never a prover
//     input and never `=== 1`.
//   * EdDSAPoseidonVerifier with enabled=1 internally enforces its equality
//     constraints (ForceEqualIfEnabled). A tampered (R8, S) leaves the witness
//     unsatisfiable, so WITNESS/PROOF generation FAILS for a forged signature. We
//     route a 0/1 `sigOk` pinned to 1 (reachable only when the verifier is enabled and
//     the signature is genuine) and multiply it into `valid`.
//   * LessEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). The
//     comparator operands here are products of free field elements, so we Num2Bits
//     range-check every operand:
//        price, twap <= 2^64 - 1
//        bps         <  2^14      (and we additionally HARD-CONSTRAIN bps <= 10000 so
//                                  the lower factor 10000 - bps cannot underflow the
//                                  field and wrap into the accept region)
//     With these bounds:
//        price * 10000           < 2^64 * 2^14 = 2^78  < 2^128
//        twap  * (10000 + bps)   < 2^64 * 2^15 = 2^79  < 2^128
//        twap  * (10000 - bps)   < 2^64 * 2^14 = 2^78  < 2^128
//     so no product can wrap the BN254 field, and the comparators are sound.
//   * covenantId is bound (cbindH4 = covenantId * covenantId) and published to prevent
//     cross-covenant replay (H4).
//
// HONESTY NOTE (v1 simplifications):
//   * The oracle key is a BabyJubjub (EdDSA-Poseidon) key, NOT a secp256k1 / ed25519
//     key. secp256k1 verification inside BN254 is infeasible at this scale, so "oracle"
//     means the holder of the BabyJubjub key (Ax, Ay) published for this covenant. A
//     verifying proof implies: the holder of that BabyJubjub key signed (twap, windowId)
//     and the public price is within bps of that twap. Binding that BabyJubjub key to a
//     real-world price oracle is an out-of-circuit policy concern (publish/attest the
//     oracle key), exactly as in basic_utxo_ownership.circom and
//     signed_attribute_threshold.circom.
//   * The band is a proportional band on the signed twap (bps of twap), computed by
//     cross-multiplication. price, twap are treated as non-negative integers (e.g.
//     fixed-point price scaled to integer units) bounded by 2^64; bps is in basis
//     points and constrained to [0, 10000] (0% to 100%).
//   * windowId is the oracle's own opaque window identifier (signed alongside twap);
//     the circuit binds price to "the twap the oracle signed for THIS windowId" but
//     does not itself interpret the window as a wall-clock time. Freshness / which
//     window is current is an out-of-circuit policy concern (the verifier chooses the
//     windowId it trusts).

template TwapBound(bits) {
    // Public inputs.
    signal input Ax;          // oracle BabyJubjub public key x
    signal input Ay;          // oracle BabyJubjub public key y
    signal input price;       // public price being checked against the band
    signal input bps;         // public band half-width in basis points (0..10000)
    signal input windowId;    // public time-window id the twap was signed for
    signal input covenantId;  // H4 cross-covenant replay binding

    // Private witness.
    signal input twap;        // oracle-signed time-weighted average price (hidden)
    signal input R8x;         // EdDSA signature R8.x
    signal input R8y;         // EdDSA signature R8.y
    signal input S;           // EdDSA signature scalar S

    signal output valid;

    // Bind this proof to the covenant (replay protection); covenantId is public.
    signal cbindH4 <== covenantId * covenantId;

    // 1. Reconstruct the signed message msg = Poseidon(twap, windowId).
    component mHash = Poseidon(2);
    mHash.inputs[0] <== twap;
    mHash.inputs[1] <== windowId;

    // 2. Verify the oracle's EdDSA-Poseidon signature. enabled = 1 forces the
    //    verifier's internal equality constraints; a forged signature is
    //    unsatisfiable (witness/proof generation FAILS). sigOk == 1 is reachable
    //    only for a genuine signature, so multiplying it into `valid` is honest.
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax  <== Ax;
    sigVerify.Ay  <== Ay;
    sigVerify.S   <== S;
    sigVerify.R8x <== R8x;
    sigVerify.R8y <== R8y;
    sigVerify.M   <== mHash.out;
    signal sigOk <== 1;

    // 3. Range-bind every comparator operand source so no product can wrap the field.
    component rcPrice = Num2Bits(64);
    rcPrice.in <== price;
    component rcTwap = Num2Bits(64);
    rcTwap.in <== twap;
    component rcBps = Num2Bits(14);   // bps < 2^14 = 16384
    rcBps.in <== bps;

    // HARD-CONSTRAIN bps <= 10000 so the lower factor (10000 - bps) is a genuine
    // non-negative integer and cannot underflow / wrap the field. This is enforced
    // as a constraint (not folded into `valid`): a witness with bps > 10000 is
    // rejected outright, which is correct because a band wider than 100% is invalid.
    component bpsLe = LessEqThan(14);
    bpsLe.in[0] <== bps;
    bpsLe.in[1] <== 10000;
    bpsLe.out === 1;

    // Proportional band factors. With bps in [0,10000]:
    //   lowFactor  = 10000 - bps  in [0, 10000]
    //   highFactor = 10000 + bps  in [10000, 20000] (< 2^15)
    signal lowFactor  <== 10000 - bps;
    signal highFactor <== 10000 + bps;

    // priceScaled = price * 10000  (< 2^78)
    signal priceScaled <== price * 10000;
    // bandFloor   = twap * lowFactor  (< 2^78)
    signal bandFloor   <== twap * lowFactor;
    // bandCeil    = twap * highFactor (< 2^79)
    signal bandCeil    <== twap * highFactor;

    // price * 10000 >= twap * (10000 - bps)   ->  not below band floor.
    component aboveFloor = GreaterEqThan(bits);
    aboveFloor.in[0] <== priceScaled;
    aboveFloor.in[1] <== bandFloor;

    // price * 10000 <= twap * (10000 + bps)   ->  not above band ceiling.
    component belowCeil = LessEqThan(bits);
    belowCeil.in[0] <== priceScaled;
    belowCeil.in[1] <== bandCeil;

    // valid == (signature ok) * (price >= floor) * (price <= ceiling).
    signal inBand <== aboveFloor.out * belowCeil.out;
    valid <== sigOk * inBand;
}

component main { public [Ax, Ay, price, bps, windowId, covenantId] } = TwapBound(128);
