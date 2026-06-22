pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// auction_clearing.circom - prove a second-price (Vickrey) auction clearing is correct
// WITHOUT revealing the actual bids.
//   Private: highestBid, secondBid
//   Public:  reserve, clearPrice, covenantId (H4 cross-covenant replay binding)
//   Output:  valid == 1  iff  highestBid >= secondBid  AND  secondBid >= reserve
//                             AND  clearPrice == secondBid   (Vickrey: winner pays 2nd price)
//            else 0
// `valid` is a CONSTRAINED OUTPUT computed by ANDing three real comparator/equality
// constraints - it is NOT a prover-supplied input. The old stub made `valid` a public
// INPUT with `valid === 1` and left the comparator output dangling, proving nothing.
// No field division is used (comparators do bit-decomposition internally).
//
// SOUNDNESS: GreaterEqThan(bits) (and the LessThan it wraps) is only sound when BOTH operands
// lie in [0, 2^bits). Here the comparator operands (highestBid, secondBid, reserve) are FREE
// prover-supplied field elements. Without range checks a prover can pick a field element near
// the BN254 prime p (a field-negative, e.g. secondBid = p - k) so the comparator's internal
// sum  in[1] + 2^bits - (in[0]+1)  wraps mod p, clears the 129th sign bit, and forges valid=1
// for a FALSE integer relation - e.g. set secondBid = p - k to make highestBid >= secondBid
// trivially "true" while the real integer relation is violated, or to fake secondBid >= reserve
// for an under-reserve clearing. IsEqual is sound for field equality, but clearPrice/secondBid
// are still free, so the whole statement is only meaningful once every operand is range-bound.
// We bit-constrain every comparator operand to 64 bits (auction amounts <= 2^64-1, far below
// 2^128), so each operand provably lies in [0, 2^64) and cannot wrap the field:
//   highestBid, secondBid, reserve, clearPrice  <=  2^64 - 1
// covenantId is NOT range-checked: it is a binding/replay value (squared into cbindH4 to wire it
// into the constraint system, supplied as a public input by the verifier), never an operand of a
// comparator, so a field-wrap cannot affect any inequality outcome.
template AuctionClearing(bits) {
    signal input highestBid;   // private
    signal input secondBid;    // private
    signal input reserve;      // public
    signal input clearPrice;   // public (claimed Vickrey clearing price)
    signal input covenantId;   // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every comparator operand so none can wrap the field and bypass the comparator.
    // 64 bits covers any realistic auction amount and is well under the 2^128 comparator width.
    component rcHighest = Num2Bits(64);
    rcHighest.in <== highestBid;
    component rcSecond = Num2Bits(64);
    rcSecond.in <== secondBid;
    component rcReserve = Num2Bits(64);
    rcReserve.in <== reserve;
    component rcClear = Num2Bits(64);
    rcClear.in <== clearPrice;

    // highestBid >= secondBid  (the top bid actually outranks the runner-up)
    component highGeSecond = GreaterEqThan(bits);
    highGeSecond.in[0] <== highestBid;
    highGeSecond.in[1] <== secondBid;

    // secondBid >= reserve  (runner-up meets the reserve, so the auction clears)
    component secondGeReserve = GreaterEqThan(bits);
    secondGeReserve.in[0] <== secondBid;
    secondGeReserve.in[1] <== reserve;

    // clearPrice == secondBid  (winner pays exactly the second price)
    component priceIsSecond = IsEqual();
    priceIsSecond.in[0] <== clearPrice;
    priceIsSecond.in[1] <== secondBid;

    // AND the three predicates (all are 0/1 booleans from the comparators)
    signal andA <== highGeSecond.out * secondGeReserve.out;
    valid <== andA * priceIsSecond.out;
}

component main { public [reserve, clearPrice, covenantId] } = AuctionClearing(128);
