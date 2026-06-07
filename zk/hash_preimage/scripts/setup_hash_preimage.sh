#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/hash_preimage/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
PTAU="$OUT/pot12_final.ptau"

mkdir -p "$OUT"
cd "$ROOT"
circom2 hash_preimage/hash_preimage.circom --r1cs --wasm -o hash_preimage/output

if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 12 "$OUT/pot12_0000.ptau"
  "$SNARKJS" powersoftau contribute "$OUT/pot12_0000.ptau" "$OUT/pot12_0001.ptau" --name="covex" -e="covex_hp12"
  "$SNARKJS" powersoftau prepare phase2 "$OUT/pot12_0001.ptau" "$PTAU"
fi

"$SNARKJS" groth16 setup "$OUT/hash_preimage.r1cs" "$PTAU" "$OUT/hash_preimage.zkey"
"$SNARKJS" zkey export verificationkey "$OUT/hash_preimage.zkey" "$ROOT/hash_preimage_vkey.json"
echo "hash_preimage artifacts ready"