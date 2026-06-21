pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsaposeidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// signed_attribute_threshold.circom - prove an ISSUER-SIGNED attribute meets a
// public threshold, WITHOUT revealing the attribute value.
//
// STATEMENT proven by a verifying proof:
//   1. The issuer (BabyJubjub public key Ax, Ay) signed the message
//        msg = Poseidon(subject, attrValue)
//      with EdDSA-Poseidon, producing (R8x, R8y, S). This binds a specific
//      attrValue to a specific subject under the issuer's key, so the prover
//      cannot invent or inflate the attribute - it must be the value the issuer
//      attested.
//   2. attrValue >= minThreshold  (the gated relation).
//   valid == (signature ok) * (attrValue >= minThreshold).
//
//   Public:  Ax, Ay, subject, minThreshold, covenantId
//   Private: attrValue, R8x, R8y, S
//
// COVERS catalog use cases (issuer-signed numeric attribute vs a public floor):
//   accredited-investor (net worth / income signed by a verifier),
//   credit-score (bureau-signed score >= floor),
//   reputation (platform-signed reputation >= floor),
//   income (employer/payroll-signed income >= floor),
//   reporting-threshold (signed amount >= a regulatory reporting floor),
//   KYC-attribute (KYC provider-signed numeric attribute >= floor).
//
// SOUNDNESS notes:
//   * `valid` is a CONSTRAINED OUTPUT (valid <== sigOk * GreaterEqThan.out), never
//     a prover input and never `=== 1`.
//   * EdDSAPoseidonVerifier with enabled=1 internally enforces its equality
//     constraints (ForceEqualIfEnabled), so NO satisfying witness exists for a
//     forged signature: a tampered (R8,S) makes WITNESS/PROOF generation FAIL.
//     We additionally route a 0/1 `sigOk` signal that is pinned to 1 only when the
//     verifier is enabled, and multiply it into `valid` so the output reflects the
//     full conjunction exactly as stated.
//   * GreaterEqThan(bits) (LessEqThan internally) is only sound when BOTH operands
//     lie in [0, 2^bits). attrValue and minThreshold are free numeric operands fed
//     to the comparator, so each is Num2Bits(64) range-checked. Without this a
//     prover could pick a field element near the BN254 prime p that wraps mod p
//     into the comparator's accept region and forge valid=1 for a below-threshold
//     attribute. 64 bits covers any realistic score / income / net-worth value.
//   * covenantId is bound (cbindH4 = covenantId*covenantId) and published to
//     prevent cross-covenant replay (H4).
//
// HONESTY NOTE (v1 simplification): the issuer key is a BabyJubjub (EdDSA-Poseidon)
// key, NOT a secp256k1 / ed25519 key. secp256k1 verification inside BN254 is
// infeasible at this scale, so "issuer" means the holder of the BabyJubjub key
// (Ax, Ay) published for this covenant. A verifying proof implies: the holder of
// that BabyJubjub key signed (subject, attrValue) and attrValue >= minThreshold.
// The binding of that BabyJubjub key to a real-world issuer identity is an
// out-of-circuit policy concern (publish/attest the issuer key), exactly as in
// basic_utxo_ownership.circom.

template SignedAttributeThreshold(bits) {
    // Public inputs.
    signal input Ax;            // issuer BabyJubjub public key x
    signal input Ay;            // issuer BabyJubjub public key y
    signal input subject;       // who the attribute is about (e.g. a commitment / id)
    signal input minThreshold;  // public floor the attribute must meet
    signal input covenantId;    // H4 cross-covenant replay binding

    // Private witness.
    signal input attrValue;     // the issuer-signed attribute value (hidden)
    signal input R8x;           // EdDSA signature R8.x
    signal input R8y;           // EdDSA signature R8.y
    signal input S;             // EdDSA signature scalar S

    signal output valid;

    // Bind this proof to the covenant (replay protection), publish covenantId.
    signal cbindH4 <== covenantId * covenantId;

    // 1. Reconstruct the signed message msg = Poseidon(subject, attrValue).
    component mHash = Poseidon(2);
    mHash.inputs[0] <== subject;
    mHash.inputs[1] <== attrValue;

    // 2. Verify the issuer's EdDSA-Poseidon signature. enabled = 1 forces the
    //    verifier's internal equality constraints; a forged signature is
    //    unsatisfiable (proof generation FAILS). We pin a 0/1 sigOk to 1 so it can
    //    be multiplied into `valid` as the statement requires. Because the witness
    //    only exists when the signature is genuine, sigOk == 1 is reachable only
    //    for a real signature.
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax  <== Ax;
    sigVerify.Ay  <== Ay;
    sigVerify.S   <== S;
    sigVerify.R8x <== R8x;
    sigVerify.R8y <== R8y;
    sigVerify.M   <== mHash.out;
    signal sigOk <== 1;

    // 3. Range-bind both comparator operands so the >= test cannot wrap the field.
    component rcAttr = Num2Bits(bits);
    rcAttr.in <== attrValue;
    component rcMin = Num2Bits(bits);
    rcMin.in <== minThreshold;

    // attrValue >= minThreshold  (0/1 output).
    component meets = GreaterEqThan(bits);
    meets.in[0] <== attrValue;
    meets.in[1] <== minThreshold;

    // valid == (signature ok) * (attribute meets threshold).
    valid <== sigOk * meets.out;
}

component main { public [Ax, Ay, subject, minThreshold, covenantId] } = SignedAttributeThreshold(64);
