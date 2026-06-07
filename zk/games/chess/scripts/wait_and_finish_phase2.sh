#!/usr/bin/env bash
# Wait for chess_v1.zkey then run finish_phase2.sh (export vkey, prove e2e4, verify).
set -euo pipefail
OUT="$(cd "$(dirname "$0")/../output" && pwd)"
ZKEY="$OUT/chess_v1.zkey"
PID="${CHESS_SETUP_PID:-30259}"

echo "Waiting for $ZKEY (setup pid $PID)..."
while [ ! -f "$ZKEY" ]; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "ERROR: setup process $PID ended without zkey"
    exit 1
  fi
  sleep 60
done
echo "Zkey ready: $(ls -lh "$ZKEY")"
bash "$(dirname "$0")/finish_phase2.sh"