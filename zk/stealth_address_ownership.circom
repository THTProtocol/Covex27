pragma circom 2.0.0;

include "node_modules/circomlib/circuits/escalarmulfix.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// stealth_address_ownership.circom - Schnorr-style knowledge-of-discrete-log
// proof on BabyJubjub.
//
// STATEMENT (what a verifying proof implies):
//   The prover knows a BabyJubjub scalar s, with 0 <= s < 2^253, such that
//       stealthPub == Base8 * s
//   where Base8 is the canonical BabyJubjub generator (subgroup of order
//   ~2^251) and stealthPub = (stealthPubX, stealthPubY) is the PUBLIC stealth
//   address point. This is exactly a proof of knowledge of the discrete log s
//   of stealthPub with respect to Base8 (a Schnorr-style KDL), proven in zero
//   knowledge: s is never revealed, only that some valid s exists and the
//   prover supplied it.
//
// CONSTRUCTION:
//   1. Range-bind s to 253 bits with Num2Bits(253). This is mandatory: it is
//      the only thing that keeps EscalarMulFix's window decomposition honest
//      and prevents a prover from feeding a non-canonical / over-large field
//      element. (Same Num2Bits(253) that circomlib's BabyPbk uses.)
//   2. Derive the point P = EscalarMulFix(253, BASE8)(s_bits). EscalarMulFix is
//      a fixed-base scalar multiplication: every constraint is enforced, so P
//      is uniquely and soundly determined by the 253 witnessed bits of s.
//   3. Hard-bind the public point: stealthPubX === P.x and stealthPubY === P.y.
//      No satisfying witness exists unless Base8 * s really equals stealthPub.
//   4. valid is a CONSTRAINED OUTPUT: valid <== isX.out * isY.out, the AND of
//      two IsEqual comparators on the coordinates. Because of step 3 the only
//      satisfiable assignment forces both equalities, so valid is provably 1
//      for an honest witness and the circuit is unsatisfiable otherwise. valid
//      is never a free prover input.
//   5. covenantId is bound into the public signals with the H4 replay guard
//      cbindH4 <== covenantId * covenantId so a proof cannot be replayed across
//      covenants.
//
// HONESTY NOTES (v1 simplifications, fully disclosed):
//   - This proves control of a BabyJubjub stealth key (the covenant-internal
//     notion of "owner"), NOT control of a Kaspa secp256k1 key. secp256k1
//     verification inside BN254 is infeasible at this scale, so BabyJubjub is
//     the in-circuit curve, matching basic_utxo_ownership.circom.
//   - This is a pure knowledge-of-discrete-log (Schnorr-style) proof. It binds
//     covenantId for replay protection but does NOT itself sign an external
//     message; if message binding is needed use basic_utxo_ownership (EdDSA)
//     instead. The statement deliberately stays minimal: "I know s with
//     stealthPub = Base8 * s".
//   - EscalarMulFix(253) compiles within pot14 (no scalar-bit reduction was
//     needed); s uses the full 253-bit width, identical to circomlib BabyPbk.

template StealthAddressOwnership() {
    // Private witness: the stealth scalar (discrete log).
    signal input s;

    // Public inputs: the claimed stealth address point and the covenant binding.
    signal input stealthPubX;
    signal input stealthPubY;
    signal input covenantId;

    signal output valid;

    // H4 cross-covenant replay binding (keeps covenantId live in the witness).
    signal cbindH4 <== covenantId * covenantId;

    // 1. Range-bind s to 253 bits (mandatory for EscalarMulFix soundness).
    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];
    component sBits = Num2Bits(253);
    sBits.in <== s;

    // 2. Derive P = Base8 * s via fixed-base scalar multiplication.
    component mulFix = EscalarMulFix(253, BASE8);
    var i;
    for (i = 0; i < 253; i++) {
        mulFix.e[i] <== sBits.out[i];
    }

    // 3. Hard-bind the derived point to the public stealth address. These
    //    equality constraints make the circuit unsatisfiable unless
    //    Base8 * s == stealthPub.
    stealthPubX === mulFix.out[0];
    stealthPubY === mulFix.out[1];

    // 4. valid is a derived output reflecting the coordinate match. Given the
    //    constraints in step 3 it can only ever be 1 for a satisfiable witness.
    component isX = IsEqual();
    isX.in[0] <== mulFix.out[0];
    isX.in[1] <== stealthPubX;
    component isY = IsEqual();
    isY.in[0] <== mulFix.out[1];
    isY.in[1] <== stealthPubY;
    valid <== isX.out * isY.out;
}

component main { public [stealthPubX, stealthPubY, covenantId] } = StealthAddressOwnership();
