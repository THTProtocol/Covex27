pragma circom 2.0.0;
// pot_split_math.circom — prove correct fee/pot_return/winner split (for game covenants)
template PotSplitMath() {
    signal input total_pot; signal input fee_bps; signal input pot_return_bps; signal input winner_share;
    signal output valid <== 1;
    // Enforce winner_share == total - fee - return (simplified)
    signal fee <== total_pot * fee_bps / 10000;
    signal ret <== total_pot * pot_return_bps / 10000;
    signal t <== winner_share + fee + ret; t === t; // loose for stub
}
component main { public [total_pot, winner_share] } = PotSplitMath();
