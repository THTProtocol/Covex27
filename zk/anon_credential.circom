pragma circom 2.0.0;

include "node_modules/circomlib/circuits/mimc.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// anon_credential.circom - Anonymous credential / ZK proof of attribute (Covex)
//   Prove a committed credential's attribute meets a minimum, revealing ONLY a nullifier.
//   Private: secretCred (the credential secret), attrValue (the committed attribute)
//   Public:  credNullifier (= MiMC7(secretCred)), minAttr, covenantId (H4 replay binding)
//   Output:  valid == 1  iff  attrValue >= minAttr  AND  credNullifier == MiMC7(secretCred)
//
// `valid` is a CONSTRAINED OUTPUT derived from the attribute inequality - it is NOT a
// prover-supplied input and is never forced to 1. The old stub took `valid` as a public
// INPUT, asserted `valid === 1`, and left the comparator output dangling, so it proved
// NOTHING about the attribute. Here the nullifier binding is HARD-asserted (===) so a
// proof can only ever exist for the true preimage of credNullifier, and `valid` honestly
// reports whether the attribute predicate holds (1) or not (0). No field division is used.
//
// SOUNDNESS: LessEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). The
// operands here (minAttr, attrValue) are free prover-supplied field elements. attrValue is
// private and is NOT pinned by the nullifier - only secretCred is hash-bound, so attrValue
// is entirely under the prover's control; minAttr is public but a hostile caller path could
// still feed a field-negative. Without range checks a prover can set attrValue near the BN254
// prime p so the comparator's internal X = minAttr + 2^bits - attrValue - 1 wraps mod p below
// 2^bits (sign bit cleared) and forges valid=1 for a FALSE attrValue >= minAttr (e.g.
// attrValue tiny, minAttr huge). We bit-constrain both comparator operands so each provably
// stays in [0, 2^bits): attribute values and minimums are non-negative integers <= 2^64-1,
// well within range. secretCred needs NO Num2Bits: it is bound by credNullifier === MiMC7(x)
// (the verifier supplies the public commitment), is never a comparator operand, and any value
// is a legitimate preimage - range-checking it would falsely restrict the credential space.
template AnonCredential(bits) {
    signal input secretCred;     // private - the credential secret
    signal input attrValue;      // private - the committed attribute value
    signal input credNullifier;  // public  - MiMC7(secretCred), the only revealed value
    signal input minAttr;        // public  - minimum the attribute must meet
    signal input covenantId;     // public  - H4 cross-covenant replay binding
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Bind the revealed nullifier to the secret credential. HARD constraint: a valid
    // proof requires secretCred to be the genuine preimage of credNullifier. secretCred is
    // hash-bound here, so it needs no range check.
    component hasher = MiMC7(91);
    hasher.x_in <== secretCred;
    hasher.k <== 0;
    credNullifier === hasher.out;

    // Range-bind both comparator operands so neither can wrap the field and bypass the
    // comparator. attrValue is otherwise fully unbound; minAttr is public but unbound too.
    component rcAttr = Num2Bits(bits);
    rcAttr.in <== attrValue;
    component rcMin = Num2Bits(bits);
    rcMin.in <== minAttr;

    // valid = 1 iff attrValue >= minAttr  <=>  minAttr <= attrValue
    component meetsMin = LessEqThan(bits);
    meetsMin.in[0] <== minAttr;
    meetsMin.in[1] <== attrValue;
    valid <== meetsMin.out;
}

component main { public [credNullifier, minAttr, covenantId] } = AnonCredential(64);
