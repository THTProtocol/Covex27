#!/bin/bash
# Ceremonies harness - dev PTAU ready; prod needs real MPC
echo "Dev PTAU (pot10_final etc.) present for small circuits."
echo "For production: follow RANGE_PROOF_CEREMONY.md + run full MPC for new circuits (utxo, vrf, script_constraint, etc.)."
echo "Flag circuits with real audited zkeys in registry."
ls -1 pot*final.ptau 2>/dev/null | wc -l
echo "PTAU count above. Run 'circom2 ... && snarkjs groth16 setup ... pot10_final.ptau ...zkey' for new small ones."
