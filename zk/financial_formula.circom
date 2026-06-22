pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// financial_formula.circom - prove a simple-interest result is correct WITHOUT
// revealing the principal.
//   Private: principal
//   Public:  rate (basis points), periods, computed (claimed result), covenantId (H4 replay binding)
//   Output:  valid == 1  iff  computed * 10000 == principal * (10000 + rate * periods)
//            (simple interest: computed == principal * (1 + rate*periods/10000), scaled by 10000
//             so no field division is ever used), else 0.
// `valid` is a CONSTRAINED OUTPUT derived from the equality via IsEqual - it is NOT a
// prover-supplied input. The old stub did `valid === 1` with the comparator output left
// dangling, which proved nothing; this genuinely attests the simple-interest relation.
// No field division is used (circom `/` on signals is a field inverse, which is wrong here).
//
// SOUNDNESS: IsEqual(in[0], in[1]) tests in[0]-in[1] == 0 over the BN254 field, i.e. it
// proves lhs == rhs (mod p), NOT integer equality. Both operands here are sums/products of
// prover-supplied field elements (computed*10000, principal*(10000+rate*periods)). With no
// range checks a prover can choose near-modulus inputs (or a public param = p-k, a field
// negative) so that lhs and rhs land in the SAME residue class mod p while the underlying
// INTEGER relation is false - the intermediate products rate*periods and principal*factor
// can also wrap mod p before the equality is even reached - forging valid=1 for a wrong
// computed (e.g. understating interest owed). To close this we bit-constrain every free
// operand so each product/sum provably stays far below p (~2^254), which makes mod-p equality
// equivalent to integer equality:
//   principal,computed <= 2^64-1   (amount-scale values)
//   rate,periods       <= 2^32-1   (covers any realistic bps rate / period count)
//   ->  interest = rate*periods            < 2^64
//       factor   = interest + 10000        < 2^65
//       lhs      = computed*10000          < 2^78  < p
//       rhs      = principal*factor        < 2^129 < p
// Since both lhs and rhs are < p, lhs == rhs (mod p)  <=>  lhs == rhs as integers.
// covenantId is bound separately (cbindH4 = covenantId^2) and never feeds the comparator,
// so it needs no range check for soundness of the equality.
template FinancialFormula() {
    signal input principal;    // private
    signal input rate;         // public (basis points)
    signal input periods;      // public
    signal input computed;     // public (claimed simple-interest result)
    signal input covenantId;   // public (H4 cross-covenant replay binding)
    signal cbindH4 <== covenantId * covenantId;
    signal output valid;

    // Range-bind every operand so the products/sums cannot wrap the field and forge equality.
    // These Num2Bits also reject negative/huge field elements (e.g. p-k) outright.
    component rcPrincipal = Num2Bits(64);
    rcPrincipal.in <== principal;
    component rcComputed = Num2Bits(64);
    rcComputed.in <== computed;
    component rcRate = Num2Bits(32);
    rcRate.in <== rate;
    component rcPeriods = Num2Bits(32);
    rcPeriods.in <== periods;

    // lhs = computed * 10000                     (< 2^78 < p)
    signal lhs <== computed * 10000;
    // factor = 10000 + rate * periods   (split to keep each constraint quadratic)
    signal interest <== rate * periods;         // < 2^64
    signal factor <== interest + 10000;         // < 2^65
    // rhs = principal * factor                   (< 2^129 < p)
    signal rhs <== principal * factor;

    component eq = IsEqual();
    eq.in[0] <== lhs;
    eq.in[1] <== rhs;
    valid <== eq.out;
}

component main { public [rate, periods, computed, covenantId] } = FinancialFormula();
