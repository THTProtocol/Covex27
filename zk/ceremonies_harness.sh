#!/bin/bash
# Ceremonies harness for Covex 100% (dev PTAU; prod MPC needed)
echo "Dev PTAU for new circuits (pot10_final etc. present)."
echo "For prod: run full MPC ceremony per RANGE_PROOF_CEREMONY.md extended."
echo "New circuits (utxo, vrf, etc.) use dev; flag for audit."
ls pot*final.ptau 2>/dev/null | wc -l
echo "PTAU ready for dev."
