#!/bin/bash
set -euo pipefail
KASPAD_BIN="${KASPAD_BIN:-/usr/local/bin/kaspad}"
DATA_DIR="${KASPA_TN10_DATA_DIR:-/root/kaspa-data/tn10}"
LOG_FILE="/var/log/kaspad-tn10.log"
echo "=== TN10 Kaspad Node Starter ==="

# Check free space on the volume (the mount point, not the data dir which doesn't exist yet)
VOLUME_MOUNT="/root"
FREE_KB=$(df "$VOLUME_MOUNT" | tail -1 | awk '{print $4}')
FREE_GB=$(( FREE_KB / 1024 / 1024 ))
echo "Free space on $VOLUME_MOUNT : ${FREE_GB} GB"
if [ "$FREE_GB" -lt 50 ]; then
  echo "ERROR: Not enough disk space for TN10 node (~50GB+ free needed, TN12 uses ~10GB)."
  echo "Current: ${FREE_GB} GB. Free space and retry."
  exit 1
fi
echo "Disk OK. Starting TN10 node..."
mkdir -p "$DATA_DIR"

# Kill any existing TN10 kaspad if running
pkill -f "kaspad.*tn10" 2>/dev/null || true
sleep 1

# TN10 uses DIFFERENT ports from TN12:
#   TN12: gRPC=16210, Borsh=17217
#   TN10: gRPC=16211, Borsh=17210  (distinct, no conflict)
nohup "$KASPAD_BIN" \
  --testnet \
  --utxoindex \
  --listen=0.0.0.0:16610 \
  --rpclisten=127.0.0.1:16211 \
  --rpclisten-borsh=0.0.0.0:17210 \
  --appdir="$DATA_DIR" \
  --nologfiles \
  > "$LOG_FILE" 2>&1 &
PID=$!
sleep 3
if ps -p $PID > /dev/null; then
  echo "TN10 kaspad started PID $PID. Borsh on 17210. Log: $LOG_FILE"
else
  echo "Start failed. tail -20 $LOG_FILE"
  exit 1
fi
