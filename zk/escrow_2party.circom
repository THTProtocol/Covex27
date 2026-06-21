pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// escrow_2party.circom — 2-party escrow timeout refund (Covex27)
// outcome 0 = refund authorized (current_daa >= deposit_daa + timeout_daa)
// outcome 1 = claim path (not timed out yet — depositor still waiting or mutual claim off-chain)
// Public: deposit_daa, timeout_daa, current_daa, outcome, valid
//
// SOUNDNESS: GreaterEqThan(n) is only sound when BOTH operands lie in [0, 2^n) as INTEGERS.
// The operands here are prover-supplied field elements: current_daa, and the SUM
// unlock_daa = deposit_daa + timeout_daa. Without range checks a prover can pick deposit_daa or
// timeout_daa near the BN254 prime p so that the sum wraps mod p down into a small value, making
// current_daa >= unlock_daa pass and forging outcome=0 (refund authorized) BEFORE the real timeout
// height has elapsed (or the reverse). This is the field-overflow forgery class. We bit-constrain
// every free operand so the sum provably cannot wrap:
//   deposit_daa, timeout_daa, current_daa <= 2^64-1 (DAA scores are well under 2^64)
//     -> unlock_daa = deposit_daa + timeout_daa < 2^64 + 2^64 = 2^65, so the comparator is sized
//        at 65 bits to hold both unlock_daa and current_daa (< 2^64 < 2^65) with no wrap.
// covenantId is NOT fed to any comparator; it only forms the H4 replay binding cbindH4, so it needs
// no range check for the comparator's soundness.
template Escrow2Party(bits) {
    signal input deposit_daa;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input timeout_daa;
    signal input current_daa;
    signal input outcome;
    signal output valid;

    // Range-bind every free operand of the comparator so the sum cannot wrap the field and bypass it.
    component rcDeposit = Num2Bits(64);
    rcDeposit.in <== deposit_daa;
    component rcTimeout = Num2Bits(64);
    rcTimeout.in <== timeout_daa;
    component rcCurrent = Num2Bits(64);
    rcCurrent.in <== current_daa;

    signal unlock_daa <== deposit_daa + timeout_daa; // < 2^65, fits the 65-bit comparator

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

component main { public [deposit_daa, timeout_daa, current_daa, outcome, covenantId] } = Escrow2Party(65);
