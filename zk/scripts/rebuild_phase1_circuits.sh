#!/usr/bin/env bash
# Recompile Phase 1 Kaspa circuits, dev zkeys, and real proofs.
set -euo pipefail
cd "$(dirname "$0")/.."
SNARKJS=./node_modules/.bin/snarkjs
PTAU=pot10_final.ptau

CIRCUITS=(
  basic_utxo_ownership
  script_constraint
  pot_split_math
  vrf_dice_roll
  vrf_random
  nullifier_set
)

echo "=== Phase 1 circuit rebuild ==="
for c in "${CIRCUITS[@]}"; do
  echo "[compile] $c"
  circom2 "${c}.circom" --r1cs --wasm -o . >/dev/null
  echo "[zkey] $c"
  "$SNARKJS" groth16 setup "${c}.r1cs" "$PTAU" "${c}.zkey" >/dev/null
  "$SNARKJS" zkey export verificationkey "${c}.zkey" "${c}_vkey.json" >/dev/null
done

echo "[prove] generating real proofs"
node prove_basic_utxo_ownership.js
node prove_script_constraint.js
node prove_pot_split_math.js
node prove_vrf_dice_roll.js
node prove_vrf_random.js
node prove_nullifier_set.js
cp -f pot_split/pot_split_math_proof.json pot_split_math_proof.json 2>/dev/null || true

echo "=== Phase 1 rebuild complete ==="