pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

// solvency_ratio.circom - prove a balance sheet's solvency ratio
//   assets / liabilities >= minRatioBps / 10000
// WITHOUT revealing the assets or liabilities amounts. This generalizes proof_of_reserves
// (which proves reserves >= a public liability total) to an arbitrary minimum coverage ratio
// expressed in basis points (e.g. 12000 = 120.00% over-collateralization).
//
//   Private: assets, liabilities, assetsSalt, liabSalt
//   Public:  minRatioBps (basis points, e.g. 12000 = 120.00%), covenantId (H4 replay binding),
//            assetsCommit, liabCommit (Poseidon commitments to the two private amounts)
//   Output:  valid == 1  iff  assets * 10000 >= minRatioBps * liabilities, else 0
//
// `valid` is a CONSTRAINED OUTPUT derived from the inequality - it is NOT a prover-supplied
// input and is never forced with `=== 1`, so the proof genuinely attests the solvency relation.
// The ratio assets/liabilities >= minRatioBps/10000 is checked by cross-multiplication; NO field
// division is used on signals (which would be unsound).
//
// SOUNDNESS: GreaterEqThan(bits) is only sound when BOTH operands lie in [0, 2^bits). The operands
// here are products of prover-supplied field elements (assets*10000, minRatioBps*liabilities).
// Without range checks a prover could pick a field element near the BN254 prime p so the product
// wraps mod p into the comparator's accept region, forging valid=1 for an insolvent balance sheet
// (e.g. assets=0, liabilities huge). We bit-constrain every operand so each product provably stays
// well under 2^bits:
//   assets,liabilities <= 2^64-1  ->  assets*10000        < 2^64 * 2^14 = 2^78  < 2^128
//                                     minRatioBps*liab    < 2^32 * 2^64 = 2^96  < 2^128
//   minRatioBps        <= 2^32-1   (covers any realistic basis-point ratio, incl. > 100%)
//
// COMMITMENT BINDING (v1): assetsCommit = Poseidon(assets, assetsSalt) and
// liabCommit = Poseidon(liabilities, liabSalt) are public so the same hidden assets/liabilities
// values can be referenced by an on-chain or off-chain commitment without revealing them. The
// salts blind the commitments against amount-guessing. v1 does NOT bind these commitments to any
// particular accounting attestation oracle; that linkage (commitment == oracle-published figure)
// is enforced off-chain by the Covex oracle, not inside this circuit.
template SolvencyRatio(bits) {
    signal input assets;        // private
    signal input liabilities;   // private
    signal input assetsSalt;    // private (commitment blinding)
    signal input liabSalt;      // private (commitment blinding)
    signal input minRatioBps;   // public (basis points; 10000 = 100%)
    signal input covenantId;    // public (H4 cross-covenant replay binding)
    signal input assetsCommit;  // public (Poseidon(assets, assetsSalt))
    signal input liabCommit;    // public (Poseidon(liabilities, liabSalt))

    // H4 replay binding: force covenantId into the constraint system so a proof is bound to
    // exactly one covenant and cannot be replayed under a different covenantId.
    signal cbindH4 <== covenantId * covenantId;

    signal output valid;

    // Range-bind every operand so the cross-multiplied products cannot wrap the field and
    // bypass the comparator. These Num2Bits also reject negative/huge field elements outright.
    component rcAssets = Num2Bits(64);
    rcAssets.in <== assets;
    component rcLiab = Num2Bits(64);
    rcLiab.in <== liabilities;
    component rcRatio = Num2Bits(32);
    rcRatio.in <== minRatioBps;

    // Bind the public commitments to the hidden amounts.
    component cmA = Poseidon(2);
    cmA.inputs[0] <== assets;
    cmA.inputs[1] <== assetsSalt;
    assetsCommit === cmA.out;

    component cmL = Poseidon(2);
    cmL.inputs[0] <== liabilities;
    cmL.inputs[1] <== liabSalt;
    liabCommit === cmL.out;

    // solvent iff  assets * 10000 >= minRatioBps * liabilities
    // operands: assets*10000 < 2^78, minRatioBps*liabilities < 2^96, both << 2^bits
    component solvent = GreaterEqThan(bits);
    solvent.in[0] <== assets * 10000;
    solvent.in[1] <== minRatioBps * liabilities;
    valid <== solvent.out;
}

component main { public [minRatioBps, covenantId, assetsCommit, liabCommit] } = SolvencyRatio(128);
