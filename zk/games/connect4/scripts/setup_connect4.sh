#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/games/connect4/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
PTAU="$OUT/pot16_final.ptau"

mkdir -p "$OUT"
cd "$ROOT"
circom2 games/connect4/connect4_v1.circom --r1cs --wasm -o games/connect4/output

if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 16 "$OUT/pot16_0000.ptau"
  "$SNARKJS" powersoftau contribute "$OUT/pot16_0000.ptau" "$OUT/pot16_0001.ptau" --name="covex" -e="covex_c4_16"
  "$SNARKJS" powersoftau prepare phase2 "$OUT/pot16_0001.ptau" "$PTAU"
fi

"$SNARKJS" groth16 setup "$OUT/connect4_v1.r1cs" "$PTAU" "$OUT/connect4_v1.zkey"
"$SNARKJS" zkey export verificationkey "$OUT/connect4_v1.zkey" "$ROOT/connect4_v1_vkey.json"
echo "connect4_v1 artifacts ready"