#!/usr/bin/env bash
# Install Rust + RISC0 zkVM toolchain in WSL for the Covex ZK chess prover.
set -e
echo "START"
if ! command -v rustc >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$PATH"
echo "RUST_OK $(rustc --version)"
echo "CARGO_OK $(cargo --version)"
if ! command -v rzup >/dev/null 2>&1; then
  curl -L https://risczero.com/install | bash
fi
export PATH="$HOME/.risc0/bin:$PATH"
rzup install || rzup install rust || true
echo "RZUP $(rzup --version 2>/dev/null || echo none)"
echo "R0VM $(command -v r0vm || echo none)"
echo "CARGO_RISCZERO $(cargo risczero --version 2>/dev/null || echo none)"
echo "ALL_DONE"
