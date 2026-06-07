pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";

// piece_codec.circom - Piece encoding / decoding for zk chess (Covex27)
//
// ENCODING SCHEME (4 bits per square):
//   packed = piece_type | (piece_color << 3)
//   piece_type:  0=empty, 1=pawn, 2=knight, 3=bishop, 4=rook, 5=queen, 6=king
//   piece_color: 0=white, 1=black
//   Valid range: 0x0 (empty) to 0xE (black king = 6 | (1<<3) = 14)
//   Invalid value: 0xF (15) - rejected by all templates

// PieceEncoder - Encodes (piece_type, piece_color) into packed 4-bit field element
//
// Inputs:  piece_type (0..6), piece_color (0 or 1)
// Outputs: packed (0..14 = piece_type + 8*piece_color)
//
// Constraints:
//   - piece_color * (1 - piece_color) == 0  -> color is bit
//   - Num2Bits(3) on piece_type -> type in [0,7]
//   - NOT(all three bits == 1) -> type != 7 (invalid)
//     Decomposed: t = bit0 * bit1;  t * bit2 === 0
//   - packed = piece_type + 8*piece_color
//
// Constraint count: ~20
template PieceEncoder() {
    signal input piece_type;    // 0..6 (empty, pawn, knight, bishop, rook, queen, king)
    signal input piece_color;   // 0=white, 1=black
    signal output packed;       // 0..14

    // Constraint 1: piece_color must be 0 or 1
    piece_color * (1 - piece_color) === 0;

    // Constraint 2: piece_type in [0,6]
    // Num2Bits(3) constrains piece_type to [0,7] via 3-bit decomposition.
    // Additional constraint: piece_type != 7 (0b111).
    // Quadratic decomposition: t = out[0]*out[1]; t*out[2] === 0
    component n2b = Num2Bits(3);
    n2b.in <== piece_type;

    signal not_all_ones <== n2b.out[0] * n2b.out[1];
    not_all_ones * n2b.out[2] === 0;

    // Constraint 3: pack
    packed <== piece_type + 8 * piece_color;
}


// PieceDecoder - Decodes packed value into (piece_type, piece_color, is_empty)
//
// Inputs:  packed (0..14)
// Outputs: piece_type (0..6), piece_color (0/1), is_empty (0/1)
//
// Constraints:
//   - Num2Bits(4) on packed -> bits[3:0]
//   - Reject packed == 15 (all 4 bits = 1)
//     Decomposed: t1 = b0*b1; t2 = t1*b2; t2*b3 === 0
//   - piece_type = Bits2Num(bits[2:0])
//   - piece_color = bits[3]
//   - is_empty = IsZero(piece_type)
//
// Constraint count: ~40
template PieceDecoder() {
    signal input packed;           // 0..14 (0xF rejected)
    signal output piece_type;      // 0..6
    signal output piece_color;     // 0 (white) or 1 (black)
    signal output is_empty;        // 1 if square is empty, else 0

    // Step 1: bit-decompose packed
    component n2b = Num2Bits(4);
    n2b.in <== packed;

    // Step 2: reject invalid value 15 (0b1111)
    // Decomposed into quadratic constraints:
    //   t1 = out[0] * out[1]
    //   t2 = t1 * out[2]
    //   t2 * out[3] === 0
    signal t1 <== n2b.out[0] * n2b.out[1];
    signal t2 <== t1 * n2b.out[2];
    t2 * n2b.out[3] === 0;

    // Step 3: extract piece_type from bits [2:0]
    component b2n_type = Bits2Num(3);
    for (var i = 0; i < 3; i++) {
        b2n_type.in[i] <== n2b.out[i];
    }
    piece_type <== b2n_type.out;

    // Step 4: extract piece_color from bit [3]
    piece_color <== n2b.out[3];

    // Step 5: is_empty = (piece_type == 0)
    component iz = IsZero();
    iz.in <== piece_type;
    is_empty <== iz.out;
}


// IsSlidingPiece - Returns 1 if piece_type is a sliding piece (bishop/rook/queen)
//
// Inputs:  piece_type (0..6, pre-constrained)
// Outputs: is_sliding (1 for bishop(3), rook(4), queen(5); 0 otherwise)
//
// Uses bitwise matching on the 3-bit decomposition.
//   Bishop = 3 = 0b011: out[0]*out[1]*(1-out[2])
//   Rook   = 4 = 0b100: (1-out[0])*(1-out[1])*out[2]
//   Queen  = 5 = 0b101: out[0]*(1-out[1])*out[2]
//
// Three-way products decomposed into quadratic pairs.
//
// Constraint count: ~25
template IsSlidingPiece() {
    signal input piece_type;      // 0..6
    signal output is_sliding;     // 0 or 1

    component n2b = Num2Bits(3);
    n2b.in <== piece_type;

    // Bishop match: 0b011 -> out[0]*out[1]*(1-out[2])
    // temp_b = out[0]*out[1]; is_bishop = temp_b * (1-out[2])
    signal temp_b <== n2b.out[0] * n2b.out[1];
    signal is_bishop <== temp_b * (1 - n2b.out[2]);

    // Rook match: 0b100 -> (1-out[0])*(1-out[1])*out[2]
    signal temp_r <== (1 - n2b.out[0]) * (1 - n2b.out[1]);
    signal is_rook <== temp_r * n2b.out[2];

    // Queen match: 0b101 -> out[0]*(1-out[1])*out[2]
    signal temp_q <== n2b.out[0] * (1 - n2b.out[1]);
    signal is_queen <== temp_q * n2b.out[2];

    // At most one flag can be 1; sum is 0 or 1
    is_sliding <== is_bishop + is_rook + is_queen;
}


// IsOpponentColor - Returns 1 if color_a != color_b (one white, one black)
//
// Inputs:  color_a, color_b (both pre-constrained to {0,1})
// Outputs: is_opponent (1 if different colors, 0 if same)
//
// For bits: XOR = a + b - 2*a*b
//
// Constraint count: ~3
template IsOpponentColor() {
    signal input color_a;         // 0 or 1
    signal input color_b;         // 0 or 1
    signal output is_opponent;    // 1 iff color_a != color_b

    is_opponent <== color_a + color_b - 2 * color_a * color_b;
}


// IsPieceColor - Returns 1 if the square contains a piece of the given color
//
// Inputs:  packed (full piece encoding, 0..14)
//          target_color (0=white or 1=black)
// Outputs: matches (1 if square non-empty AND color matches)
//
// Constraint count: ~40
template IsPieceColor() {
    signal input packed;          // piece encoding
    signal input target_color;    // 0 or 1
    signal output matches;        // 1 if piece present and color matches

    // Decompose
    component n2b = Num2Bits(4);
    n2b.in <== packed;

    // piece_color from bit 3
    signal piece_color;
    piece_color <== n2b.out[3];

    // piece_type from bits [2:0]
    component b2n = Bits2Num(3);
    for (var i = 0; i < 3; i++) {
        b2n.in[i] <== n2b.out[i];
    }

    // is_non_empty = piece_type != 0
    component iz = IsZero();
    iz.in <== b2n.out;
    signal is_non_empty;
    is_non_empty <== 1 - iz.out;

    // color_match = (piece_color == target_color)
    // For bits: eq = 1 - a - b + 2ab
    signal color_match;
    color_match <== 1 - piece_color - target_color + 2 * piece_color * target_color;

    matches <== is_non_empty * color_match;
}


// IsSpecificPiece - Returns 1 if piece_type matches a specific target type
//
// Inputs:  piece_type (0..6, pre-constrained)
//          target_type (0..6, must be a compile-time constant)
// Outputs: is_match (1 if equal, 0 otherwise)
//
// Bitwise matching against the 3-bit decomposition.
//
// Constraint count: ~15
template IsSpecificPiece() {
    signal input piece_type;      // 0..6
    signal input target_type;     // 0..6
    signal output is_match;       // 1 iff piece_type == target_type

    component n2b_piece = Num2Bits(3);
    n2b_piece.in <== piece_type;

    component n2b_target = Num2Bits(3);
    n2b_target.in <== target_type;

    // Per-bit match: bit_eq[i] = 1 - a_i - b_i + 2*a_i*b_i
    // Each is quadratic and 0 or 1.
    signal bit_eq_0;
    bit_eq_0 <== 1 - n2b_piece.out[0] - n2b_target.out[0] + 2 * n2b_piece.out[0] * n2b_target.out[0];

    signal bit_eq_1;
    bit_eq_1 <== 1 - n2b_piece.out[1] - n2b_target.out[1] + 2 * n2b_piece.out[1] * n2b_target.out[1];

    signal bit_eq_2;
    bit_eq_2 <== 1 - n2b_piece.out[2] - n2b_target.out[2] + 2 * n2b_piece.out[2] * n2b_target.out[2];

    // All three must match: product decomposed into quadratic pairs
    signal temp <== bit_eq_0 * bit_eq_1;
    is_match <== temp * bit_eq_2;
}
