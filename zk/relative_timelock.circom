pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// Relative Timelock Proof (Phase 0/1 of full ZK+Oracle stack for Covex/Kaspa)
// Proves that current_daa - reference_daa >= lock_duration (without revealing exact values if desired).
// Maps to Kaspa DAA relative timelocks for covenants (dispute periods, cooldowns, vesting cliffs).
// See docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md
// Uses same style as timelock_absolute and range_proof for easy reuse of ptau/artifacts.

template RelativeTimelock() {
    signal input current_daa;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;      // public or committed
    signal input reference_daa;    // usually public (covenant birth or UTXO DAA)
    signal input lock_duration;    // public (e.g. 1000 DAA)
    signal output valid;           // COMPUTED output: 1 iff current >= reference + duration

    // valid is DERIVED from the constraint, never chosen by the prover. As a free
    // input (the previous design) a prover could submit valid=1 with an unsatisfied
    // timelock; since valid was also not exposed in the public signals, the oracle
    // could not tell a satisfied lock from an unsatisfied one. Making valid a public
    // output that equals the comparator result closes that bypass: the oracle reads
    // valid from the public signals and requires valid == 1.
    component gte = GreaterEqThan(64);
    gte.in[0] <== current_daa;
    gte.in[1] <== reference_daa + lock_duration;

    valid <== gte.out;

    // Public signals for oracle: [valid, current_daa, reference_daa, lock_duration]
    // (circom emits template outputs first, then declared public inputs.)
}

component main { public [current_daa, reference_daa, lock_duration, covenantId] } = RelativeTimelock();
