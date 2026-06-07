pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// verifiable_poker_solver.circom — Verifiable poker solver / Nash stub (Covex)
// Proves AI-suggested action has positive EV vs range (hybrid; heavy compute -> RISC0 in full).
template VerifiablePokerSolver() {
    signal input potSize;
    signal input betSize;
    signal input equity; // vs opp range
    signal input ev;     // public expected value claim
    signal input valid;

    // EV positive-ish: (equity * pot - (1-equity)*bet ) >0 placeholder
    component positive = LessThan(64);
    positive.in[0] <== betSize * 50;
    positive.in[1] <== equity * (potSize + betSize);
    positive.out === 1;

    valid === 1;
}

component main { public [ev, valid] } = VerifiablePokerSolver();
