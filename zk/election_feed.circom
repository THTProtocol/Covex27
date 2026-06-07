pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// election_feed.circom — Election result / tally feed stub (Covex vision)
// Attests a public result matches private tally within bounds (oracle hybrid).
template ElectionFeed() {
    signal input tallyA;
    signal input tallyB;
    signal input winner; // public 0/1/2
    signal input threshold;
    signal input valid;

    // winner claim consistent with tallies (placeholder)
    component gt = LessThan(32);
    gt.in[0] <== tallyB;
    gt.in[1] <== tallyA;
    signal aWins <== gt.out;

    component ok = LessThan(8);
    ok.in[0] <== winner;
    ok.in[1] <== 3;
    ok.out === 1;

    valid === 1;
}

component main { public [winner, valid] } = ElectionFeed();
