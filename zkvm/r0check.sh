#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.risc0/bin:$PATH"
echo "RUSTC=$(rustc --version 2>&1)"
echo "DEFAULT_TOOLCHAIN=$(rustup default 2>&1)"
echo "RZUP_BIN=$(command -v rzup 2>&1)"
echo "RZUP=$(rzup --version 2>&1)"
echo "R0VM_BIN=$(command -v r0vm 2>&1)"
echo "R0VM=$(r0vm --version 2>&1)"
echo "CARGO_RISCZERO=$(cargo risczero --version 2>&1)"
echo "RUSTUP_TOOLCHAINS:"
ls "$HOME/.rustup/toolchains" 2>&1
echo "RISC0_DIR:"
ls -la "$HOME/.risc0/bin" 2>&1 | head
echo "RZUP_SHOW:"
rzup show 2>&1 | head -25
echo "CHECK_DONE"
