pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";

// square_utils.circom - Square coordinate math for zk chess (Covex27)
//
// Squares are indexed 0-63 (a1=0, b1=1, ..., h8=63).
//   file = square % 8   (0=a through 7=h)
//   rank = square / 8   (0=1st rank through 7=8th rank)
//
// Bit decomposition trick (avoids division):
//   Num2Bits(6) on square -> bits[5:0]
//   file = bits[2:0] (3 LSBs)
//   rank = bits[5:3] (3 MSBs)

// SquareToCoord - Converts square index (0-63) to (file, rank) coordinates
//
// Inputs:  square (0-63)
// Outputs: file (0-7), rank (0-7)
//
// Constraints:
//   - Num2Bits(6) enforces square in [0,63]
//   - file = Bits2Num(bits[2:0])
//   - rank = Bits2Num(bits[5:3])
//   - Reconstruct: square === file + 8*rank (redundancy check for soundness)
//
// Constraint count: ~30
template SquareToCoord() {
    signal input square;     // 0-63
    signal output file;      // 0-7
    signal output rank;      // 0-7

    // Step 1: Decompose square into 6 bits
    component n2b = Num2Bits(6);
    n2b.in <== square;

    // Step 2: Extract file from bits[2:0] (LSBs)
    component b2n_file = Bits2Num(3);
    b2n_file.in[0] <== n2b.out[0];
    b2n_file.in[1] <== n2b.out[1];
    b2n_file.in[2] <== n2b.out[2];
    file <== b2n_file.out;

    // Step 3: Extract rank from bits[5:3] (MSBs)
    component b2n_rank = Bits2Num(3);
    b2n_rank.in[0] <== n2b.out[3];
    b2n_rank.in[1] <== n2b.out[4];
    b2n_rank.in[2] <== n2b.out[5];
    rank <== b2n_rank.out;

    // Step 4: Soundness check - reconstruct square from file+rank
    // Prevents a malicious prover from passing a square value whose bit
    // decomposition and the file+8*rank reconstruction disagree.
    square === file + 8 * rank;
}


// CoordToSquare - Converts (file, rank) to square index (0-63)
//
// Inputs:  file (0-7), rank (0-7)
// Outputs: square (0-63)
//
// Constraints:
//   - Num2Bits(3) on both file and rank -> each in [0,7]
//   - square = file + 8*rank
//
// Constraint count: ~20
template CoordToSquare() {
    signal input file;       // 0-7
    signal input rank;       // 0-7
    signal output square;    // 0-63

    // Constrain file and rank to [0,7]
    component nb_file = Num2Bits(3);
    nb_file.in <== file;

    component nb_rank = Num2Bits(3);
    nb_rank.in <== rank;

    // Compute square
    square <== file + 8 * rank;
}


// DeltaSquares - Distance between two squares on the board
//
// Inputs:  from_square (0-63), to_square (0-63)
// Outputs: delta_file (signed, but circom uses field repr: from_file - to_file)
//          delta_rank (signed)
//          abs_delta_file (0-7)
//          abs_delta_rank (0-7)
//
// Approach for absolute values:
//   Since a,b in [0,7], compute both (a-b) and (b-a).
//   If a>=b: a-b in [0,7] (small), b-a is huge (p - small)
//   If a<b:  a-b is huge, b-a in [0,7] (small)
//   Use GreaterEqThan(3) to select the small one.
//
// Constraint count: ~80
template DeltaSquares() {
    signal input from_square;    // 0-63
    signal input to_square;      // 0-63
    signal output delta_file;    // from_file - to_file (field repr, can be >63)
    signal output delta_rank;    // from_rank - to_rank (field repr)
    signal output abs_delta_file; // 0-7
    signal output abs_delta_rank; // 0-7

    // Decompose both squares
    component coord_from = SquareToCoord();
    coord_from.square <== from_square;

    component coord_to = SquareToCoord();
    coord_to.square <== to_square;

    // Raw deltas (field repr, may be huge if negative in Z)
    delta_file <== coord_from.file - coord_to.file;
    delta_rank <== coord_from.rank - coord_to.rank;

    // Absolute delta file
    // Compute both directions
    signal diff_file_pos;  // from_file - to_file
    diff_file_pos <== coord_from.file - coord_to.file;

    signal diff_file_neg;  // to_file - from_file
    diff_file_neg <== coord_to.file - coord_from.file;

    // Comparator: from_file >= to_file ?
    component cmp_file = GreaterEqThan(3);
    cmp_file.in[0] <== coord_from.file;
    cmp_file.in[1] <== coord_to.file;

    // Mux: if from_file >= to_file, use diff_file_pos (which is small), else diff_file_neg
    // Both selectors are 0 or 1 and sum to 1, so the product with the "huge" value
    // becomes 0 (since it's multiplied by 0), and we get the small value.
    signal t1_file <== cmp_file.out * diff_file_pos;
    signal t2_file <== (1 - cmp_file.out) * diff_file_neg;
    abs_delta_file <== t1_file + t2_file;

    // Range-constrain abs_delta_file in [0,7]
    component range_abs_file = Num2Bits(3);
    range_abs_file.in <== abs_delta_file;

    // Absolute delta rank
    signal diff_rank_pos;
    diff_rank_pos <== coord_from.rank - coord_to.rank;

    signal diff_rank_neg;
    diff_rank_neg <== coord_to.rank - coord_from.rank;

    component cmp_rank = GreaterEqThan(3);
    cmp_rank.in[0] <== coord_from.rank;
    cmp_rank.in[1] <== coord_to.rank;

    signal t1_rank <== cmp_rank.out * diff_rank_pos;
    signal t2_rank <== (1 - cmp_rank.out) * diff_rank_neg;
    abs_delta_rank <== t1_rank + t2_rank;

    component range_abs_rank = Num2Bits(3);
    range_abs_rank.in <== abs_delta_rank;
}


// AreSquaresAligned - Tests geometric alignment between two squares
//
// Inputs:  from_square, to_square (0-63)
// Outputs: same_file     (1 if same file AND different rank)
//          same_rank     (1 if same rank AND different file)
//          same_diagonal (1 if |delta_file| == |delta_rank| AND delta != 0)
//          squares_differ (1 if squares are different)
//
// For chess:
//   - Rook moves: same_file XOR same_rank
//   - Bishop moves: same_diagonal
//   - Queen moves: same_file OR same_rank OR same_diagonal
//   - Knight moves: (|df|,|dr|) in {(1,2),(2,1)}
//
// Constraint count: ~50
template AreSquaresAligned() {
    signal input from_square;     // 0-63
    signal input to_square;       // 0-63
    signal output same_file;      // 0 or 1
    signal output same_rank;      // 0 or 1
    signal output same_diagonal;  // 0 or 1
    signal output squares_differ; // 0 or 1

    // Compute deltas with absolute values
    component delta = DeltaSquares();
    delta.from_square <== from_square;
    delta.to_square <== to_square;

    // squares_differ: abs sum > 0
    // abs_delta_file and abs_delta_rank are both in [0,7] and cannot both be zero
    // unless squares are the same, so squares_differ = 1 - IsZero(abs_delta_file + abs_delta_rank)
    component iz_sum = IsZero();
    iz_sum.in <== delta.abs_delta_file + delta.abs_delta_rank;
    squares_differ <== 1 - iz_sum.out;

    // same_file: abs_delta_file == 0 AND abs_delta_rank != 0
    // same_rank: abs_delta_rank == 0 AND abs_delta_file != 0
    component iz_file = IsZero();
    iz_file.in <== delta.abs_delta_file;

    component iz_rank = IsZero();
    iz_rank.in <== delta.abs_delta_rank;

    // same_file = (file equal) AND (rank differs)
    same_file <== iz_file.out * (1 - iz_rank.out);
    // same_rank = (rank equal) AND (file differs)
    same_rank <== (1 - iz_file.out) * iz_rank.out;

    // same_diagonal: |delta_file| == |delta_rank| AND at least one != 0
    // Equality: abs_delta_file - abs_delta_rank == 0
    component iz_eq = IsZero();
    iz_eq.in <== delta.abs_delta_file - delta.abs_delta_rank;

    component iz_af = IsZero();
    iz_af.in <== delta.abs_delta_file;

    // diagonal = equal AND not zero
    same_diagonal <== iz_eq.out * (1 - iz_af.out);
}


// IsValidSquare - Returns 1 if square in [0,63], 0 otherwise
//
// Inputs:  square
// Outputs: valid (0 or 1)
//
// Simple Num2Bits(6) constraint; if square is outside [0,63],
// Num2Bits(6) cannot decompose it and the constraint system is unsatisfiable.
// This is a gate template used to enforce validity at the consumer level.
//
// Constraint count: ~10
template IsValidSquare() {
    signal input square;     // field element
    signal output valid;     // always 1 (constraint enforced)

    component n2b = Num2Bits(6);
    n2b.in <== square;
    valid <== 1;
}


// SquareDirection - Compute the direction vector from from_square toward to_square
//
// Inputs:  from_square, to_square (0-63)
// Outputs: step_file_sign (-1, 0, or +1 as field element)
//          step_rank_sign (-1, 0, or +1)
//          steps (number of steps = max(|df|, |dr|), 0-7)
//
// Used by sliding piece validators to iterate path clearance.
// step values: 0x00 = 0, 0x01 = 1 (positive), (p-1) = -1 (negative)
//
// Constraint count: ~40
template SquareDirection() {
    signal input from_square;    // 0-63
    signal input to_square;      // 0-63
    signal output step_file_sign; // 0, 1, or field(-1) = p-1
    signal output step_rank_sign; // 0, 1, or field(-1)
    signal output steps;          // 0-7, the max linear distance

    component coord_from = SquareToCoord();
    coord_from.square <== from_square;

    component coord_to = SquareToCoord();
    coord_to.square <== to_square;

    component delta = DeltaSquares();
    delta.from_square <== from_square;
    delta.to_square <== to_square;

    // steps = max(abs_delta_file, abs_delta_rank)
    component cmp = GreaterEqThan(3);
    cmp.in[0] <== delta.abs_delta_file;
    cmp.in[1] <== delta.abs_delta_rank;
    signal t_steps1 <== cmp.out * delta.abs_delta_file;
    signal t_steps2 <== (1 - cmp.out) * delta.abs_delta_rank;
    steps <== t_steps1 + t_steps2;

    // Step file sign
    // Use GreaterEqThan(4) with the +1 approach - handles to_file=7 case cleanly.
    // Since both file values are 3-bit, to_file+1 is at most 8 (4-bit).

    // Check from_file > to_file strictly: from_file >= to_file+1
    component cmp_file_gt = GreaterEqThan(4);
    cmp_file_gt.in[0] <== coord_from.file;
    cmp_file_gt.in[1] <== coord_to.file + 1;

    // Check from_file < to_file strictly: to_file >= from_file+1
    component cmp_file_lt = GreaterEqThan(4);
    cmp_file_lt.in[0] <== coord_to.file;
    cmp_file_lt.in[1] <== coord_from.file + 1;

    // -1 in BN128 field = p - 1
    signal neg_one;
    neg_one <-- 21888242871839275222246405745257275088548364400416034343698204186575808495616;
    neg_one + 1 === 0;

    // sign = lt*1 + gt*(-1) = lt + gt*neg_one
    signal t_file_gt <== cmp_file_gt.out * neg_one;
    step_file_sign <== cmp_file_lt.out + t_file_gt;
    // gt and lt cannot both be 1 simultaneously
    cmp_file_gt.out * cmp_file_lt.out === 0;

    // Step rank sign (same approach with 4-bit comparators)
    component cmp_rank_gt = GreaterEqThan(4);
    cmp_rank_gt.in[0] <== coord_from.rank;
    cmp_rank_gt.in[1] <== coord_to.rank + 1;

    component cmp_rank_lt = GreaterEqThan(4);
    cmp_rank_lt.in[0] <== coord_to.rank;
    cmp_rank_lt.in[1] <== coord_from.rank + 1;

    signal t_rank_gt <== cmp_rank_gt.out * neg_one;
    step_rank_sign <== cmp_rank_lt.out + t_rank_gt;
    cmp_rank_gt.out * cmp_rank_lt.out === 0;
}
