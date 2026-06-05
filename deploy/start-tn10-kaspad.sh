#!/bin/bash
set -euo pipefail
KASPAD_BIN="${KASPAD_BIN:-/home/kasparov/.cargo/bin/kaspad}"
DATA_DIR="${KASPA_TN10_DATA_DIR:-/home/kasparov/kaspa-tn10-data}"
LOG_FILE="/tmp/kaspad-tn10.log"
echo "=== TN10 Kaspad Node Starter ==="
FREE_KB=$(df / | tail -1 | awk "{print \$4}")
FREE_GB=$(( FREE_KB / 1024 / 1024 ))
echo "Free space on / : ${FREE_GB} GB"
if [ "$FREE_GB" -lt 80 ]; then
  echo "ERROR: Not enough disk space for TN10 node (~80GB+ free needed)."
  echo "Current: ${FREE_GB} GB. Free space and retry."
  exit 1
fi
echo "Disk OK. Starting TN10 node..."
mkdir -p "$DATA_DIR"
# Note: manually stop previous if needed: pkill -f kaspad-tn10 or kill by pid
nohup "$KASPAD_BIN" --testnet --utxoindex --listen=0.0.0.0:16610 --rpclisten=0.0.0.0:16210 --rpclisten-borsh=0.0.0.0:17210 --appdir="$DATA_DIR" --nologfiles > "$LOG_FILE" 2>&1 &
PID=$!
sleep 3
if ps -p $PID > /dev/null; then
  echo "TN10 kaspad started PID $PID. Borsh on 17210. Log: $LOG_FILE"
else
  echo "Start failed. tail -20 $LOG_FILE"
  exit 1
fi
