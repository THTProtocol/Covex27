#!/usr/bin/env bash
# Validate the RISC0 prover end-to-end with the starter template (real proof mode).
export PATH="$HOME/.cargo/bin:$HOME/.risc0/bin:$PATH"
LOG=/tmp/r0template.log
{
  echo "START"
  cd "$HOME" || exit 1
  rm -rf r0validate
  cargo risczero new r0validate 2>&1 | tail -8
  cd r0validate 2>/dev/null || { echo "new failed"; exit 1; }
  echo "--- first build + REAL prove (RISC0_DEV_MODE=0) ---"
  RISC0_DEV_MODE=0 cargo run --release 2>&1 | tail -30
  echo "TEMPLATE_RC=$?"
  echo "ALL_DONE"
} > "$LOG" 2>&1
