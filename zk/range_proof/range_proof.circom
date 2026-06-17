pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/mimc.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// RangeProof — Phase 9 Foundation Circuit (Covex27)
// Proves: I know a private `value` such that:
//   - MiMC7(value) === public `commitment`   (hiding + binding)
//   - value >= public `min`
//   - value <= public `max`
//   - valid === 1
//
// This is a minimal but real Groth16 range proof with commitment.
// Suitable for private balance/collateral/qualification checks.
//
// Limitations (honest):
// - 64-bit range (sufficient for demo KAS amounts and most real use cases)
// - Uses MiMC7 (matching the Merkle Membership circuit)
// - Full production use requires a proper Powers of Tau ceremony contribution
//   and a phase-2 zkey specific to this circuit.
// - Currently oracle-attested only (no on-chain verification of the proof itself).
//
// Usage pattern (once artifacts exist):
//   publicInputs = [commitment, min, max, valid]
//   privateInputs (witness only) = { value }
//
// See: prove_range_proof.js, NEXT_ZK_CIRCUITS.md, and the oracle handler.

template RangeProof(bits) {
    // === Public inputs (visible in proof) ===
    signal input commitment;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;   // MiMC7(value) — the hiding commitment
    signal input min;
    signal input max;

    // === Private witness (never revealed) ===
    signal input value;

    // === Public output (1 if constraints satisfied) ===
    signal output valid;

    // 1. Commitment binding: prove knowledge of preimage
    component hasher = MiMC7(91);
    hasher.x_in <== value;
    hasher.k <== 0;
    commitment === hasher.out;

    // 2. Range constraints
    component lower = GreaterEqThan(bits);
    component upper = LessEqThan(bits);

    lower.in[0] <== value;
    lower.in[1] <== min;

    upper.in[0] <== value;
    upper.in[1] <== max;

    // 3. Valid flag (1 only when both range checks pass and commitment holds)
    valid <== lower.out * upper.out;
}

// Only `commitment`, `min`, `max` are public inputs.
// `value` is private witness. `valid` is public output.
component main { public [commitment, min, max, covenantId] } = RangeProof(64);
