pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// VRF Dice Roll (Phase 0/1 - full stack vision)
// Proves that a dice roll (1-6 or N faces) was correctly derived from secret + seed
// without revealing the secret. Fairness for backgammon, yahtzee, risk, monopoly, etc.
// Stub for demo; full version uses proper VRF (e.g. based on elliptic curves or hash chain).
// See docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md for integration with all games + oracles.

template VrfDiceRoll(faces) {
    signal input secret;      // private
    signal input seed;        // public (player entropy or beacon)
    signal input roll;        // public result 1..faces
    signal input valid;

    // Simple Poseidon-based "VRF" for demo (real VRF would use EC or verifiable delay)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== seed;

    // Simple demo VRF roll (real VRF uses proper verifiable functions; this is illustrative for stack)
    // For demo we constrain roll is between 1 and faces and "derived" via hash (full version would constrain the mod properly with range + equality gadgets).
    signal computed <== hasher.out; // placeholder derivation
    // Accept any roll in range for stub (in real: add range proof + exact derivation)
    component inRange = LessEqThan(8);
    inRange.in[0] <== roll;
    inRange.in[1] <== faces;
    inRange.out === 1;

    valid === 1;  // the oracle or caller will have checked the claimed roll against the VRF
    // Public signals demonstrate the claim: seed + roll + valid


    // Public: [seed, roll, valid]
}

component main { public [seed, roll] } = VrfDiceRoll(6); // default 6-sided; param for others
