pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// VRF dice: roll in [1, faces] derived from Poseidon(secret, seed).
// User/game chooses faces via template param (default 6).
//
// SOUNDNESS (two independent operands had to be bound):
//
// 1) roll: GreaterEqThan(16)/LessEqThan(16) are only sound when both operands lie in [0,2^16).
//    `roll` is a free prover input, so it is bit-bound by Num2Bits(16). Without it a prover sets
//    roll = p-65528 (a field "negative") and BOTH comparators accept garbage. (Verified blocked.)
//
// 2) q: the relation that ties the public `roll` to the hash is the Euclidean identity
//          q*faces + (roll-1) === computed   (computed = Poseidon(secret,seed)).
//    This is the ONLY link between `computed` and `roll`. If `q` is an UNCONSTRAINED field
//    element, this single equation in two field unknowns binds nothing: for ANY roll in [1,faces]
//    the prover solves q = (computed-roll+1)*faces^{-1} mod p and the equality holds in the field
//    even though faces does NOT divide (computed-roll+1) as integers. That let a player pick ANY
//    winning face independent of the VRF hash (forgery A3, observed: all six faces proved & verified
//    for one fixed secret/seed). The fix: a genuine Euclidean quotient satisfies 0 <= q <= floor((p-1)/faces);
//    every MALICIOUS (wrapping) q needs integer q*faces >= p, i.e. q >= ceil(p/faces) > floor((p-1)/faces).
//    So bit-bound q (Num2Bits(252), since K below is 252-bit) and assert q <= K. With remainder
//    roll-1 in [0,faces) (from the comparators) and q <= K, the integer q*faces+(roll-1) cannot
//    reach p, so the field equality forces the TRUE integer reduction roll-1 = computed mod faces.
//
// (secret stays private; seed, roll, covenantId are public. covenantId is squared as the H4 cross-
//  covenant replay binding so the proof cannot be replayed against a different covenant.)
template VrfDiceRoll(faces) {
    signal input secret;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input seed;
    signal input roll;
    signal input q;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== seed;
    signal computed <== hasher.out;

    // Range-bind roll so it cannot wrap the field and bypass the 16-bit comparators below.
    component rcRoll = Num2Bits(16);
    rcRoll.in <== roll;

    component gte1 = GreaterEqThan(16);
    gte1.in[0] <== roll;
    gte1.in[1] <== 1;
    gte1.out === 1;

    component lte = LessEqThan(16);
    lte.in[0] <== roll;
    lte.in[1] <== faces;
    lte.out === 1;

    // Bind the quotient so the Euclidean identity below is a TRUE integer reduction, not a
    // field-only equality with a wrapped quotient. K = floor((p-1)/faces) is the largest
    // possible honest quotient; any wrapping (malicious) q is strictly greater and is rejected.
    // p-1 = -1 in the field; (-1) \ faces is integer division of (p-1) by faces at compile time.
    var K = (-1) \ faces;                  // = floor((p-1)/faces), a 252-bit constant for faces=6
    component rcQ = Num2Bits(252);
    rcQ.in <== q;
    component qLeK = LessEqThan(252);
    qLeK.in[0] <== q;
    qLeK.in[1] <== K;
    qLeK.out === 1;

    q * faces + roll - 1 === computed;
}

component main { public [seed, roll, covenantId] } = VrfDiceRoll(6);
