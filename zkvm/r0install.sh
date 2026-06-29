#!/usr/bin/env bash
# Robust RISC0 install: try rzup curl installer, fall back to cargo install. Logs to /tmp/r0i3.log.
export PATH="$HOME/.cargo/bin:$HOME/.risc0/bin:$PATH"
LOG=/tmp/r0i3.log
{
  echo "START"
  echo "--- method 1: rzup curl installer ---"
  if curl -fsSL https://risczero.com/install -o /tmp/rzup_installer.sh; then
    echo "installer head:"; head -5 /tmp/rzup_installer.sh
    bash /tmp/rzup_installer.sh || echo "rzup installer rc=$?"
  else
    echo "curl rzup installer FAILED rc=$?"
  fi
  export PATH="$HOME/.risc0/bin:$PATH"; hash -r
  if command -v rzup >/dev/null 2>&1; then echo "rzup found -> rzup install"; rzup install || echo "rzup install rc=$?"; fi
  echo "--- fallback: cargo install cargo-risczero ---"
  if ! command -v r0vm >/dev/null 2>&1; then
    cargo install cargo-risczero || echo "cargo install rc=$?"
    cargo risczero install || echo "cargo risczero install rc=$?"
  fi
  export PATH="$HOME/.risc0/bin:$PATH"; hash -r
  echo "FINAL rzup=$(command -v rzup||echo no) r0vm=$(command -v r0vm||echo no) cargo-risczero=$(cargo risczero --version 2>&1)"
  echo "ALL_DONE"
} > "$LOG" 2>&1
