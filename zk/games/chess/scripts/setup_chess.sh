#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CHESS="$ROOT/games/chess"
OUT="$CHESS/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
PTAU="$OUT/pot17_final.ptau"

mkdir -p "$OUT/chess_v1_build"
cd "$ROOT"
circom2 games/chess/chess_v1.circom --r1cs --wasm -o games/chess/output/chess_v1_build

if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 17 "$OUT/pot17_0000.ptau"
  "$SNARKJS" powersoftau contribute "$OUT/pot17_0000.ptau" "$OUT/pot17_0001.ptau" --name="covex" -e="covex_chess17"
  "$SNARKJS" powersoftau prepare phase2 "$OUT/pot17_0001.ptau" "$PTAU"
fi

"$SNARKJS" groth16 setup "$OUT/chess_v1_build/chess_v1.r1cs" "$PTAU" "$OUT/chess_v1.zkey"
"$SNARKJS" zkey export verificationkey "$OUT/chess_v1.zkey" "$OUT/chess_v1_vkey.json"
echo "chess_v1 artifacts ready in $OUT"