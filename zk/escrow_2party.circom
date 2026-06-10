pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// escrow_2party.circom — 2-party escrow timeout refund (Covex27)
// outcome 0 = refund authorized (current_daa >= deposit_daa + timeout_daa)
// outcome 1 = claim path (not timed out yet — depositor still waiting or mutual claim off-chain)
// Public: deposit_daa, timeout_daa, current_daa, outcome, valid

template Escrow2Party(bits) {
    signal input deposit_daa;
    signal input timeout_daa;
    signal input current_daa;
    signal input outcome;
    signal output valid;

    signal unlock_daa <== deposit_daa + timeout_daa;

    component timedOut = GreaterEqThan(bits);
    timedOut.in[0] <== current_daa;
    timedOut.in[1] <== unlock_daa;

    // outcome 0 requires timeout elapsed; outcome 1 requires still locked
    component isRefund = IsZero();
    isRefund.in <== outcome;

    signal notRefund <== 1 - isRefund.out;
    signal notTimedOut <== 1 - timedOut.out;
    signal refundOk <== isRefund.out * timedOut.out;
    signal claimOk <== notRefund * notTimedOut;
    valid <== refundOk + claimOk;
}

component main { public [deposit_daa, timeout_daa, current_daa, outcome] } = Escrow2Party(64);