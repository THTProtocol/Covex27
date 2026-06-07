#!/bin/bash
# Full dev ceremonies + build harness for 100% potential
set -e
echo "=== Covex 100% Dev Build & Ceremony Harness ==="
cd zk
echo "Compiling all custom Phase circuits with circom2..."
for f in *.circom; do
  base=${f%.circom}
  if [ ! -f "${base}.r1cs" ]; then
    echo "Compiling $f..."
    circom2 "$f" --r1cs --wasm -o . 2>/dev/null || true
  fi
done
echo "Generating dev zkeys for all with pot10_final.ptau (small circuits only)..."
for f in *.r1cs; do
  base=${f%.r1cs}
  if [ ! -f "${base}.zkey" ]; then
    echo "Setup for $base..."
    ./node_modules/.bin/snarkjs groth16 setup "$f" ./pot10_final.ptau "${base}.zkey" 2>/dev/null || true
    ./node_modules/.bin/snarkjs zkey export verificationkey "${base}.zkey" "${base}_vkey.json" 2>/dev/null || true
  fi
done
echo "Dev artifacts ready. For prod: full MPC per RANGE_PROOF_CEREMONY.md"
ls -1 *.zkey 2>/dev/null | wc -l
echo "zkeys generated above."
