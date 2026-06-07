#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/privacy_mixer/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
PTAU="$OUT/pot14_final.ptau"

mkdir -p "$OUT"
cd "$ROOT"
circom2 privacy_mixer/privacy_mixer_v1.circom --r1cs --wasm -o privacy_mixer/output

if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 14 "$OUT/pot14_0000.ptau"
  "$SNARKJS" powersoftau contribute "$OUT/pot14_0000.ptau" "$OUT/pot14_0001.ptau" --name="covex_mixer" -e="covex_mixer14"
  "$SNARKJS" powersoftau prepare phase2 "$OUT/pot14_0001.ptau" "$PTAU"
fi

"$SNARKJS" groth16 setup "$OUT/privacy_mixer_v1.r1cs" "$PTAU" "$OUT/privacy_mixer_v1.zkey"
"$SNARKJS" zkey export verificationkey "$OUT/privacy_mixer_v1.zkey" "$ROOT/privacy_mixer_v1_vkey.json"
echo "privacy_mixer_v1 artifacts ready"