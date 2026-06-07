#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/timelock/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
PTAU="$OUT/pot12_final.ptau"

mkdir -p "$OUT"
cd "$ROOT"
circom2 timelock/timelock_absolute.circom --r1cs --wasm -o timelock/output

if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 12 "$OUT/pot12_0000.ptau"
  "$SNARKJS" powersoftau contribute "$OUT/pot12_0000.ptau" "$OUT/pot12_0001.ptau" --name="covex" -e="covex_tl12"
  "$SNARKJS" powersoftau prepare phase2 "$OUT/pot12_0001.ptau" "$PTAU"
fi

"$SNARKJS" groth16 setup "$OUT/timelock_absolute.r1cs" "$PTAU" "$OUT/timelock_absolute.zkey"
"$SNARKJS" zkey export verificationkey "$OUT/timelock_absolute.zkey" "$ROOT/timelock_absolute_vkey.json"
echo "timelock_absolute artifacts ready"