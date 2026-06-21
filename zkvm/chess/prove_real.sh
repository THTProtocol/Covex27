#!/usr/bin/env bash
# REAL proof run: RISC0_DEV_MODE=0 forces genuine STARK proving + verification (no dev shortcut).
# This is the GATE. Each game must prove, the receipt must verify against the image id, and the
# decoded winner must be correct; the illegal chess move must fail to prove.
set -uo pipefail
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"
# THE REAL THING: no dev mode.
export RISC0_DEV_MODE=0
# Use all cores for proving; surface r0vm info logs (cycle counts / segments).
export RUST_LOG="${RUST_LOG:-info}"
cd /mnt/c/Users/User/Desktop/Covex/repo/zkvm/chess || exit 1
echo "=== REAL PROOF RUN (RISC0_DEV_MODE=0) ==="
echo "host: $(nproc) cores"
date +%s > /tmp/prove_real.start
cargo run --release -p host 2>&1
RC=${PIPESTATUS[0]}
echo "REAL_RUN_RC=$RC"
echo "REAL_DONE"
