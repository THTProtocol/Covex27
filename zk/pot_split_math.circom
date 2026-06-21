pragma circom 2.0.0;

include "node_modules/circomlib/circuits/bitify.circom";

// Prove winner_share + fee + return === total_pot with bps-configurable fee/return.
// fee_bps and pot_return_bps are public (covenant/user chooses limits).
//
// SOUNDNESS: every constraint here is a FIELD equality (===), which only attests the INTEGER
// relation when every operand provably stays below the BN254 prime p. The operands are products
// and sums of prover-supplied field elements (fee*10000, total_pot*fee_bps, winner_share+fee+ret).
// Without range checks a prover can pick a public bps near p (a field-negative) so the products /
// sum wrap mod p: e.g. fee_bps=200 (honest-looking) with pot_return_bps=p-10200 forces a verifying
// proof whose winner_share is 2x the entire pot (attack verified: VERIFY=true, valid=1, a false
// split). To close this we bit-constrain every free operand so each product/sum stays well under p:
//   total_pot,winner_share,fee,ret <= 2^64-1  (KAS sompi max supply ~2.9e18 < 2^62)
//   fee_bps,pot_return_bps          <= 2^32-1  (covers any realistic basis-point ceiling)
//   => fee*10000           < 2^64 * 2^14 = 2^78
//      total_pot*fee_bps   < 2^64 * 2^32 = 2^96
//      winner_share+fee+ret < 3*2^64    < 2^66      (all << p, no wrap possible)
// covenantId is the H4 cross-covenant replay binding (squared into cbindH4); it is pinned by the
// covenant context the verifier supplies, so it needs no range check (same as the reference
// circuits collateral_ltv / loan_health).
template PotSplitMath() {
    signal input total_pot;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input fee_bps;
    signal input pot_return_bps;
    signal input winner_share;
    signal input fee;
    signal input ret;
    signal output valid;

    // Range-bind every free operand so the products / sum cannot wrap the field. These Num2Bits
    // also reject negative / huge field elements (e.g. a field-negative pot_return_bps) outright.
    component rcTotal  = Num2Bits(64);  rcTotal.in  <== total_pot;
    component rcWinner = Num2Bits(64);  rcWinner.in <== winner_share;
    component rcFee    = Num2Bits(64);  rcFee.in    <== fee;
    component rcRet    = Num2Bits(64);  rcRet.in    <== ret;
    component rcFeeBps = Num2Bits(32);  rcFeeBps.in <== fee_bps;
    component rcRetBps = Num2Bits(32);  rcRetBps.in <== pot_return_bps;

    fee * 10000 === total_pot * fee_bps;
    ret * 10000 === total_pot * pot_return_bps;
    winner_share + fee + ret === total_pot;
    valid <== 1;
}

component main { public [total_pot, fee_bps, pot_return_bps, winner_share, covenantId] } = PotSplitMath();
