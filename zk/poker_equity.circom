pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// poker_equity.circom — Poker hand equity / win prob stub (Covex)
// Proves equity calc in range for given board/hole (oracle or montecarlo hybrid).
template PokerEquity() {
    signal input hole1;
    signal input hole2;
    signal input boardHash;
    signal input equity; // public e.g. 0-1000 for 0-100%
    signal input valid;

    component range = LessThan(16);
    range.in[0] <== equity;
    range.in[1] <== 1001;
    range.out === 1;

    // Placeholder: boardHash constrains nothing deep (real equity circuit huge)
    signal ok <== range.out;
    valid === 1;
}

component main { public [boardHash, equity, valid] } = PokerEquity();
