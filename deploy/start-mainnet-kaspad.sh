#!/bin/bash
set -euo pipefail
KASPAD_BIN="${KASPAD_BIN:-/home/kasparov/.cargo/bin/kaspad}"
DATA_DIR="${KASPA_MAINNET_DATA_DIR:-/home/kasparov/kaspa-mainnet-data}"
LOG_FILE="/tmp/kaspad-mainnet.log"
echo "=== MAINNET Kaspad Node Starter (with strict space guard) ==="
FREE_KB=$(df / | tail -1 | awk "{print \$4}")
FREE_GB=$(( FREE_KB / 1024 / 1024 ))
echo "Free space on / : ${FREE_GB} GB"
# Mainnet with utxoindex is heavy — recommend 400GB+ free minimum
if [ "$FREE_GB" -lt 400 ]; then
  echo "ERROR: Not enough disk space for MAINNET node (utxoindex + full history typically requires 400GB–1TB+)."
  echo "Current free: ${FREE_GB} GB. Please provision a large enough Hetzner volume and retry."
  echo "You can check with: df -h /"
  exit 1
fi
echo "Disk space OK for mainnet (${FREE_GB} GB free). Starting..."
mkdir -p "$DATA_DIR"
# Stop previous if needed (manual or use unique pattern)
PIDS=$(pgrep -f "kaspad.*mainnet" || true)
if [ -n "$PIDS" ]; then
  echo "Stopping existing mainnet kaspad..."
  kill $PIDS 2>/dev/null || true
  sleep 2
fi
# Standard mainnet ports + utxoindex + dedicated data dir
nohup "$KASPAD_BIN"   --utxoindex   --listen=0.0.0.0:16111   --rpclisten=0.0.0.0:16110   --rpclisten-borsh=0.0.0.0:17110   --appdir="$DATA_DIR"   --nologfiles   > "$LOG_FILE" 2>&1 &
PID=$!
sleep 3
if ps -p $PID > /dev/null; then
  echo "MAINNET kaspad started PID $PID. Data: $DATA_DIR Log: $LOG_FILE"
  echo "Borsh/wRPC on 17110 locally. On the SAME machine: KASPA_WRPC_URL_MAINNET=ws://127.0.0.1:17110. On hightable.pro the node is reached through the reverse SSH tunnel: ws://127.0.0.1:17310"
  echo "Monitor: tail -f $LOG_FILE"
else
  echo "Failed. tail -20 $LOG_FILE"
  exit 1
fi
