#!/usr/bin/env bash
# RISC0 zkVM toolchain install (Rust already present). Idempotent.
export PATH="$HOME/.cargo/bin:$HOME/.risc0/bin:$PATH"
echo "RUST $(rustc --version 2>/dev/null)"
if ! command -v rzup >/dev/null 2>&1; then
  curl -L https://risczero.com/install | bash
fi
export PATH="$HOME/.risc0/bin:$PATH"
rzup install 2>&1 | tail -40
echo "RZUP $(rzup --version 2>/dev/null || echo none)"
echo "R0VM $(command -v r0vm || echo none)"
echo "CARGO_RISCZERO $(cargo risczero --version 2>/dev/null || echo none)"
echo "ALL_DONE"
