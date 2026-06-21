#!/usr/bin/env bash
# REAL proof run: RISC0_DEV_MODE=0 forces genuine STARK proving + verification (no dev shortcut).
# This is the host GATE. Each program must prove, the receipt must verify against the image id, and
# the decoded output must be correct; the wrong-output / wrong-hash / trap inputs must fail to prove
# and the tampered receipt must fail verification.
set -uo pipefail
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"
# THE REAL THING: no dev mode.
export RISC0_DEV_MODE=0
export RUST_LOG="${RUST_LOG:-info}"
cd /mnt/c/Users/User/Desktop/Covex/repo/zkvm/compute || exit 1
echo "=== REAL PROOF RUN (RISC0_DEV_MODE=0) ==="
echo "host: $(nproc) cores"
date +%s > /tmp/compute_prove_real.start
cargo run --release -p host 2>&1
RC=${PIPESTATUS[0]}
echo "REAL_RUN_RC=$RC"
echo "REAL_DONE"
