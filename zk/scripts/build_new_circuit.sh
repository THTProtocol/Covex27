#!/usr/bin/env bash
# build_new_circuit.sh <circuit_id> - compile + groth16 trusted-setup (pot10 dev ceremony) +
# export vkey + copy served artifacts + record constraint count. Run in WSL (circom + snarkjs).
#
#   bash zk/scripts/build_new_circuit.sh merkle_range_membership
#
# Produces under frontend/public/zk/<id>/ : <id>.wasm, <id>_final.zkey, <id>_vkey.json
# (the committed served artifacts an in-browser prover + the verifier use). Honest:
# single-contributor Covex dev ceremony, NOT a production MPC.
set -euo pipefail
export PATH="$PATH:$HOME/.cargo/bin"
ID="$1"
PTAU_NAME="${2:-pot10_final.ptau}"   # pass pot12_final.ptau for circuits > 1024 constraints
cd "$(dirname "$0")/.."          # -> zk/
ZK="$(pwd)"
PTAU="$ZK/$PTAU_NAME"
BUILD="$ZK/build_new/$ID"
SERVED="$ZK/../frontend/public/zk/$ID"
SNARKJS="node $ZK/node_modules/snarkjs/build/cli.cjs"

[ -f "$ID.circom" ] || { echo "no $ID.circom"; exit 1; }
[ -f "$PTAU" ] || { echo "no $PTAU_NAME"; exit 1; }
mkdir -p "$BUILD" "$SERVED"

echo "== compile $ID =="
circom "$ID.circom" --r1cs --wasm -o "$BUILD" -l node_modules
$SNARKJS r1cs info "$BUILD/$ID.r1cs" | grep -iE "constraints|wires|labels" || true

echo "== groth16 setup (pot10 dev ceremony) =="
$SNARKJS groth16 setup "$BUILD/$ID.r1cs" "$PTAU" "$BUILD/${ID}_0.zkey"
$SNARKJS zkey contribute "$BUILD/${ID}_0.zkey" "$BUILD/${ID}_final.zkey" \
  --name="covex-dev-$ID" -e="covex zkwave $ID $(date +%s) single-contributor dev ceremony"
$SNARKJS zkey export verificationkey "$BUILD/${ID}_final.zkey" "$BUILD/${ID}_vkey.json"

echo "== copy served artifacts =="
cp "$BUILD/${ID}_js/${ID}.wasm" "$SERVED/${ID}.wasm"
cp "$BUILD/${ID}_final.zkey"    "$SERVED/${ID}_final.zkey"
cp "$BUILD/${ID}_vkey.json"     "$SERVED/${ID}_vkey.json"
echo "served -> $SERVED"
ls -la "$SERVED"
