#!/usr/bin/env bash
# Post-gate checks: the `hash` subcommand must equal the committed program_hash; an independent
# fresh-process verify of a saved real receipt must succeed; and verifying the tampered receipt
# must fail. These confirm receipts are portable and the program id is reproducible.
set -uo pipefail
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"
export RISC0_DEV_MODE=0
BIN="$CARGO_TARGET_DIR/release/covex-compute-prover"
EX=/mnt/c/Users/User/Desktop/Covex/repo/zkvm/compute/examples
G=/tmp/covex_compute_gate

echo "=== hash quadratic.json (expect fba72b1549be07e114e92fb1551bdfecfd8f2a9aa2fc031b710f167ae380fdb8) ==="
"$BIN" hash "$EX/quadratic.json"
echo

echo "=== independent fresh-process verify of saved dot.bin (expect VERIFIED, output 32) ==="
"$BIN" verify "$G/dot.bin" | grep -E "VERIFIED|output|program_hash"
echo "RC=$?"
echo

echo "=== verify the tampered quad receipt (expect FAILURE, non-zero) ==="
"$BIN" verify "$G/quad_tampered.bin"
echo "TAMPERED_VERIFY_RC=$?  (expected NON-zero)"
echo "POST_DONE"
