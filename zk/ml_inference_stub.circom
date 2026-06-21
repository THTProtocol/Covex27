pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// ml_inference_stub.circom - prove the output of a SINGLE-NEURON LINEAR model
// (honestly: a 1-layer linear model y = w*x + b, NOT general ML / not a deep net /
// no activations) on a PRIVATE input matches a publicly claimed output, WITHOUT
// revealing the private input.
//   Private: privateInput (x)
//   Public:  modelWeight (w), bias (b), claimedOutput (y_claimed), covenantId (H4 replay binding)
//   Output:  valid == 1  iff  claimedOutput == modelWeight*privateInput + bias, else 0
//
// `valid` is a CONSTRAINED OUTPUT derived from an IsEqual over the linear relation -
// it is NOT a prover-supplied input. The old stub did `valid === 1` with `valid` as a
// public INPUT and the comparator output dangling, so it proved NOTHING (a prover could
// claim any output). Now the proof genuinely attests y = w*x + b. No field division.
//
// SOUNDNESS: IsEqual checks FIELD equality (computed - claimedOutput == 0 mod p), but the
// statement asserts an INTEGER relation. computed = modelWeight*privateInput + bias is
// evaluated mod the BN254 prime p. Without range checks a prover can pick privateInput (or a
// field-negative bias/weight near p) so the product/sum WRAPS mod p and collides with a small
// claimedOutput, forging valid=1 for an integer relation that is FALSE (e.g. claim y=0 by
// choosing x so that w*x+b == p). We bit-constrain every free operand so the product and sum
// provably stay well below p (~2^254) and field-equality therefore coincides with integer
// equality:
//   modelWeight,privateInput,bias,claimedOutput <= 2^64-1
//     -> modelWeight*privateInput  < 2^64 * 2^64 = 2^128
//     -> + bias (< 2^64)           < 2^128 + 2^64 < 2^129  << 2^254 = p (no wrap)
// claimedOutput is range-bound too so it cannot itself be a field-negative aliasing computed.
// covenantId is NOT range-checked: it is a pure H4 replay tag (covenantId*covenantId) that does
// not enter the arithmetic relation, so its field value cannot affect the y = w*x + b statement.
template MlInferenceStub() {
    signal input privateInput;   // private (x)
    signal input modelWeight;    // public  (w)
    signal input bias;           // public  (b)
    signal input claimedOutput;  // public  (y_claimed)
    signal input covenantId;     // public  (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every operand of the linear relation so the product (w*x) and the sum (+b)
    // cannot wrap the field and make field-equality forge a false integer equality.
    component rcWeight = Num2Bits(64);
    rcWeight.in <== modelWeight;
    component rcInput = Num2Bits(64);
    rcInput.in <== privateInput;
    component rcBias = Num2Bits(64);
    rcBias.in <== bias;
    component rcClaimed = Num2Bits(64);
    rcClaimed.in <== claimedOutput;

    // Single-neuron linear forward pass: computed = w*x + b
    //   w*x < 2^128, + b < 2^129, all << p -> no modular wrap, integer-faithful.
    signal computed <== modelWeight * privateInput + bias;

    // valid = 1 iff the claimed output equals the constrained computation, else 0.
    component eq = IsEqual();
    eq.in[0] <== computed;
    eq.in[1] <== claimedOutput;
    valid <== eq.out;
}

component main { public [modelWeight, bias, claimedOutput, covenantId] } = MlInferenceStub();
