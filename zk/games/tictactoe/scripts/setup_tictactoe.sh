#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/games/tictactoe/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
PTAU="$OUT/pot14_final.ptau"

mkdir -p "$OUT"
cd "$ROOT"
circom2 games/tictactoe/tictactoe_v1.circom --r1cs --wasm -o games/tictactoe/output

if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 14 "$OUT/pot14_0000.ptau"
  "$SNARKJS" powersoftau contribute "$OUT/pot14_0000.ptau" "$OUT/pot14_0001.ptau" --name="covex" -e="covex_tt14"
  "$SNARKJS" powersoftau prepare phase2 "$OUT/pot14_0001.ptau" "$PTAU"
fi

"$SNARKJS" groth16 setup "$OUT/tictactoe_v1.r1cs" "$PTAU" "$OUT/tictactoe_v1.zkey"
"$SNARKJS" zkey export verificationkey "$OUT/tictactoe_v1.zkey" "$ROOT/tictactoe_v1_vkey.json"
echo "tictactoe_v1 artifacts ready"