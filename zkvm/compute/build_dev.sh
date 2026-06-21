#!/usr/bin/env bash
# Dev-mode build + run: compiles the guest (covex-compute-core -> riscv32im-risc0-zkvm-elf) and the
# host, then runs in RISC0_DEV_MODE=1 (fast, no real STARK) to flush out COMPILE issues before the
# slow real proof. NOTE: dev mode is NOT a real proof; it only verifies the toolchain builds.
set -uo pipefail
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.risc0/bin:$PATH"
# WSL-native target dir (the /mnt/c mount is slow for cargo I/O).
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"
export RISC0_DEV_MODE=1
cd /mnt/c/Users/User/Desktop/Covex/repo/zkvm/compute || exit 1
echo "=== cargo test -p covex-compute-core (pure-Rust ISA unit tests, host target) ==="
cargo test -p covex-compute-core 2>&1 | tail -40
echo "CORE_TEST_RC=${PIPESTATUS[0]}"
echo "=== cargo build (host workspace; triggers guest build via risc0-build) ==="
cargo build --release 2>&1 | tail -60
echo "BUILD_RC=${PIPESTATUS[0]}"
echo "=== cargo run (dev mode) ==="
cargo run --release -p host 2>&1 | tail -80
echo "RUN_RC=${PIPESTATUS[0]}"
echo "DEV_DONE"
