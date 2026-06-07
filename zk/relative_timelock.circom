pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// Relative Timelock Proof (Phase 0/1 of full ZK+Oracle stack for Covex/Kaspa)
// Proves that current_daa - reference_daa >= lock_duration (without revealing exact values if desired).
// Maps to Kaspa DAA relative timelocks for covenants (dispute periods, cooldowns, vesting cliffs).
// See docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md
// Uses same style as timelock_absolute and range_proof for easy reuse of ptau/artifacts.

template RelativeTimelock() {
    signal input current_daa;      // public or committed
    signal input reference_daa;    // usually public (covenant birth or UTXO DAA)
    signal input lock_duration;    // public (e.g. 1000 DAA)
    signal input valid;            // 1 if satisfied

    // Enforce current >= reference + duration
    component gte = GreaterEqThan(64);
    gte.in[0] <== current_daa;
    gte.in[1] <== reference_daa + lock_duration;

    valid === gte.out;

    // Public signals for oracle: [valid, current_daa, reference_daa, lock_duration]
}

component main { public [current_daa, reference_daa, lock_duration] } = RelativeTimelock();
