pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// VRF winner selection: provably-fair lottery / raffle / random winner.
//
// STATEMENT (what a verifying proof guarantees):
//   computed = Poseidon(secret, seed)                       (the VRF output, a field element)
//   r        = computed mod 2^RBITS                          (the low RBITS bits of the VRF output)
//   winner   = r mod numEntrants     and   0 <= winner < numEntrants
//   valid    = 1  iff  winner is the TRUE reduction of the VRF randomness mod numEntrants.
//
// secret is private. seed, numEntrants, winner, covenantId are public, so anyone can later reveal
// `secret`, recompute Poseidon(secret, seed), take its low RBITS bits and reduce mod numEntrants to
// confirm the draw was honest and was not steered toward a chosen winner.
//
// WHY REDUCE TO THE LOW RBITS FIRST (this is the key design choice vs vrf_dice_roll.circom):
//   vrf_dice_roll has a COMPILE-TIME `faces`, so it can bound the quotient by the compile-time
//   constant K = floor((p-1)/faces). Here numEntrants is a runtime SIGNAL, so no such compile-time
//   constant exists, and the full-field quotient computed/numEntrants can be ~2^253 (when
//   numEntrants is tiny), which makes the Euclidean product q*numEntrants wrap the field and
//   destroys soundness. To keep every operand provably small we first split off a bounded
//   randomness word r = computed mod 2^RBITS, then reduce r mod numEntrants. r is uniformly random
//   for VRF purposes (low bits of a Poseidon output), so winner is unbiased for any numEntrants
//   that is small relative to 2^RBITS (any real lottery).
//
// SOUNDNESS (every free operand fed to a comparator/product is range-bound, same attack family as
// vrf_dice_roll A3 and collateral_ltv field-wrap):
//
//   Split:   computed === hi * 2^RBITS + r,   with  r bit-bound to RBITS and hi bit-bound to HIBITS.
//            r is forced < 2^RBITS by Num2Bits(RBITS); hi*2^RBITS + r reconstructs computed exactly
//            and (RBITS + HIBITS) covers the field width, so r really is computed mod 2^RBITS.
//
//   Reduce:  q2 * numEntrants + winner === r,  the ONLY link between the randomness and the public
//            winner. If q2 were unconstrained, this single field equation binds nothing (the
//            vrf_dice_roll A3 forgery: solve q2 = (r-winner)*numEntrants^{-1} for ANY chosen
//            winner). We force a TRUE integer reduction by bounding both factors so the product
//            cannot wrap:
//                r           < 2^RBITS  (= 2^64)
//                numEntrants < 2^EBITS  (= 2^32),  and numEntrants >= 1
//                q2          < 2^QBITS  (= 2^64)
//            => q2*numEntrants < 2^96, + winner (< numEntrants <= 2^32) stays < 2^97 << p. With no
//            wrap possible the field equality is a genuine INTEGER equation, and together with
//            0 <= winner < numEntrants that is exactly Euclidean division: winner = r mod numEntrants.
//
// V1 SIMPLIFICATIONS (documented honestly):
//   - numEntrants is capped at 2^32 entrants (EBITS) and MUST be >= 1 (numEntrants = 0 rejected).
//   - The draw uses the low 64 bits of Poseidon(secret, seed). The modulo bias is negligible while
//     numEntrants << 2^64 (true for every real raffle); it is NOT a perfectly uniform reduction of
//     the full field, by design, to keep the quotient bounded and non-wrapping.
//   - This circuit proves the draw is the honest reduction of the VRF randomness. It does NOT, on
//     its own, prove the entrant LIST is well-formed or that `secret` was committed BEFORE the seed
//     was known. Publish Poseidon(secret) earlier and bind an entrant-set commitment at the
//     application layer for end-to-end fairness.
//   - covenantId is squared as the H4 cross-covenant replay binding so the proof cannot be replayed
//     against a different covenant.
template VrfWinnerSelect() {
    signal input secret;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input seed;
    signal input numEntrants;
    signal input winner;
    signal input hi;   // high part of computed: computed = hi*2^RBITS + r
    signal input q2;   // quotient of r div numEntrants

    var RBITS = 64;    // randomness word r < 2^64
    var HIBITS = 191;  // hi covers the rest of the field width (RBITS + HIBITS >= field bit width)
    var EBITS = 32;    // numEntrants < 2^32
    var QBITS = 64;    // q2 < 2^64

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== seed;
    signal computed <== hasher.out;

    // ---- Split computed into low randomness word r and high part hi ----
    component rcHi = Num2Bits(HIBITS);
    rcHi.in <== hi;
    signal r;
    r <== computed - hi * (1 << RBITS);   // r = computed - hi*2^RBITS
    component rcR = Num2Bits(RBITS);        // forces 0 <= r < 2^RBITS, i.e. r = computed mod 2^RBITS
    rcR.in <== r;

    // ---- Range-bind the remaining free operands ----
    component rcE = Num2Bits(EBITS);
    rcE.in <== numEntrants;
    component rcQ = Num2Bits(QBITS);
    rcQ.in <== q2;
    // winner is < numEntrants < 2^EBITS; bit-bound it to EBITS so the comparator is sound.
    component rcW = Num2Bits(EBITS);
    rcW.in <== winner;

    // numEntrants must be at least 1 (a draw over zero entrants is undefined).
    component eGe1 = GreaterEqThan(EBITS);
    eGe1.in[0] <== numEntrants;
    eGe1.in[1] <== 1;

    // 0 <= winner < numEntrants (winner >= 0 from Num2Bits; check upper bound). Both operands are
    // bit-bound to EBITS = 32, so LessThan(33) is sound.
    component wLtE = LessThan(33);
    wLtE.in[0] <== winner;
    wLtE.in[1] <== numEntrants;

    // ---- Euclidean reduction r = q2*numEntrants + winner (non-wrapping, see header) ----
    signal prod <== q2 * numEntrants;
    component eucOk = IsEqual();
    eucOk.in[0] <== prod + winner;
    eucOk.in[1] <== r;

    // valid is a CONSTRAINED OUTPUT: 1 iff numEntrants>=1, winner<numEntrants, and the Euclidean
    // identity all hold. It is never a prover input and never `=== 1` on a dangling comparator.
    signal a <== eGe1.out * wLtE.out;
    signal valid <== a * eucOk.out;
    valid === 1;
}

component main { public [seed, numEntrants, winner, covenantId] } = VrfWinnerSelect();
