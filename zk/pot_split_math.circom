pragma circom 2.0.0;

// Prove winner_share + fee + return === total_pot with bps-configurable fee/return.
// fee_bps and pot_return_bps are public (covenant/user chooses limits).

template PotSplitMath() {
    signal input total_pot;
    signal input covenantId; signal cbindH4 <== covenantId * covenantId;
    signal input fee_bps;
    signal input pot_return_bps;
    signal input winner_share;
    signal input fee;
    signal input ret;
    signal output valid;

    fee * 10000 === total_pot * fee_bps;
    ret * 10000 === total_pot * pot_return_bps;
    winner_share + fee + ret === total_pot;
    valid <== 1;
}

component main { public [total_pot, fee_bps, pot_return_bps, winner_share, covenantId] } = PotSplitMath();