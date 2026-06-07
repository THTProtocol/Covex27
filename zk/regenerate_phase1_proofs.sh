#!/usr/bin/env bash
# Regenerate sample Groth16 proofs for Phase 1 stub circuits (dev zkeys).
set -euo pipefail
cd "$(dirname "$0")"
for s in prove_relative_timelock prove_vrf_dice_roll prove_vrf_random prove_nullifier_set \
         prove_turn_timer prove_pot_split_math prove_script_constraint prove_basic_utxo_ownership; do
  echo "==> $s"
  node "${s}.js"
done
node prove_verify.js
echo "All Phase 1 proofs + merkle regenerated."