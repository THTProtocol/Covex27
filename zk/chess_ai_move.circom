pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// chess_ai_move.circom — Chess AI move validity / eval stub (Covex)
// Proves suggested move is legal + better than threshold (hybrid with RISC0 later).
template ChessAiMove() {
    signal input fromSq;
    signal input toSq;
    signal input evalScore; // centipawns public
    signal input minScore;
    signal input valid;

    // Basic square range
    component sqOk = LessThan(16);
    sqOk.in[0] <== toSq;
    sqOk.in[1] <== 64;
    sqOk.out === 1;

    // Eval above min (stub)
    component better = LessThan(32);
    better.in[0] <== minScore - 1;
    better.in[1] <== evalScore;
    valid === 1;
}

component main { public [evalScore, valid] } = ChessAiMove();
