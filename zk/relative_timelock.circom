pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// Relative Timelock Proof (Phase 0/1 of full ZK+Oracle stack for Covex/Kaspa)
// Proves that current_daa - reference_daa >= lock_duration (without revealing exact values if desired).
// Maps to Kaspa DAA relative timelocks for covenants (dispute periods, cooldowns, vesting cliffs).
// See docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md
// Uses same style as timelock_absolute and range_proof for easy reuse of ptau/artifacts.
//
// SOUNDNESS: GreaterEqThan(n) is only sound when BOTH operands lie in [0, 2^n). Here the operands
// are free, prover-supplied field elements:
//   in[0] = current_daa
//   in[1] = reference_daa + lock_duration   (a SUM of two free inputs)
// Without range checks a prover can pick a field-negative (e.g. lock_duration = p - k) so that the
// sum reference_daa + lock_duration WRAPS mod the BN254 prime p into a tiny value, making the
// comparator accept current_daa >= (wrapped tiny value) and forge valid=1 for a timelock that is in
// fact NOT satisfied (true required duration is enormous). Symmetrically current_daa could be chosen
// near p. That defeats dispute periods / cooldowns / vesting cliffs. We bit-constrain every operand
// input so it provably stays in range and no operand can wrap the field:
//   current_daa, reference_daa, lock_duration <= 2^64-1  (Kaspa DAA scores / durations fit in 64 bits)
//   => in[0] = current_daa            < 2^64
//      in[1] = reference_daa+lock_dur < 2^64 + 2^64 = 2^65
//   Both operands are provably < 2^66, so we run the comparator at width 66 (both operands in range).
// covenantId is NOT a comparator operand; it is an H4 cross-covenant replay binding only
// (cbindH4 = covenantId*covenantId), so its value never feeds the inequality and needs no Num2Bits
// for comparator soundness.
template RelativeTimelock() {
    signal input current_daa;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;      // public or committed
    signal input reference_daa;    // usually public (covenant birth or UTXO DAA)
    signal input lock_duration;    // public (e.g. 1000 DAA)
    signal output valid;           // COMPUTED output: 1 iff current >= reference + duration

    // Range-bind every comparator operand input so neither in[0] nor the sum in[1] can wrap the
    // field and bypass the comparator. These Num2Bits also reject negative/huge field elements.
    component rcCurrent = Num2Bits(64);
    rcCurrent.in <== current_daa;
    component rcReference = Num2Bits(64);
    rcReference.in <== reference_daa;
    component rcLock = Num2Bits(64);
    rcLock.in <== lock_duration;

    // valid is DERIVED from the constraint, never chosen by the prover. As a free
    // input (the previous design) a prover could submit valid=1 with an unsatisfied
    // timelock; since valid was also not exposed in the public signals, the oracle
    // could not tell a satisfied lock from an unsatisfied one. Making valid a public
    // output that equals the comparator result closes that bypass: the oracle reads
    // valid from the public signals and requires valid == 1.
    // operands: in[0]=current_daa < 2^64, in[1]=reference_daa+lock_duration < 2^65, both << 2^66
    component gte = GreaterEqThan(66);
    gte.in[0] <== current_daa;
    gte.in[1] <== reference_daa + lock_duration;

    valid <== gte.out;

    // Public signals for oracle: [valid, current_daa, reference_daa, lock_duration]
    // (circom emits template outputs first, then declared public inputs.)
}

component main { public [current_daa, reference_daa, lock_duration, covenantId] } = RelativeTimelock();
