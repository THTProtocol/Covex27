#!/bin/bash
#
# Robust helper to start the Covex backend on production (Hetzner).
# Always uses the correct TN12 (Toccata Testnet-12) settings.
#
# Usage (as the deploy user or root):
#   chmod +x deploy/start-covex-backend.sh
#   ./deploy/start-covex-backend.sh
#
# It will:
#   - Stop any running instance
#   - Export the correct TN12 environment variables
#   - Start the backend via nohup with logging
#   - Show the last 20 lines of the log

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_BIN="$APP_DIR/backend/target/release/covex27-backend"
LOG_FILE="/tmp/covex27.log"

# === TN12 (Toccata Testnet-12) Configuration ===
export KASPA_NETWORK="testnet-12"
export KASPA_WRPC_URL="${KASPA_WRPC_URL:-ws://127.0.0.1:17217}"   # Change if your node uses a different port
export BIND_ADDR="0.0.0.0:3006"
export DB_PATH="$APP_DIR/covex.db"
export COVENANT_TREASURY_ADDRESS="kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m"
export COVENANT_SEED_ADDRESSES="kaspatest:qp8q6ya2txnlzsd8c6qkz9q6ew4he2ny797nejyntzkn3gkdelu270f45cmxa,kaspatest:qqtk7zesmvvm8g35e8s6amjwq3mw6j564zxuehffedz6zp450pdv7splqvmmk,kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m"
# TESTNET dev-deployer private keys (use_dev_mode signing) are read from env, never
# from source. Set the keys that derive the DEV_WALLET_*_ADDRESS_* constants in
# backend/src/dev_wallets.rs. Keep these out of version control (real deploy sets
# them in a 0600 systemd drop-in, not here). Leave unset to disable dev-mode signing.
# export COVEX_DEV_WALLET_1_KEY_TN12="<64-hex>"
# export COVEX_DEV_WALLET_1_KEY_TN10="<64-hex>"   # same key as TN12 (same address)
# export COVEX_DEV_WALLET_2_KEY_TN12="<64-hex>"
# export COVEX_DEV_WALLET_2_KEY_TN10="<64-hex>"   # same key as TN12 (same address)
export CRAWL_START_DAA="1"
export RUST_LOG="${RUST_LOG:-covex27_backend=info,kaspa_wrpc=warn}"

echo "=== Starting Covex Backend (TN12) ==="
echo "App dir:          $APP_DIR"
echo "Binary:           $BACKEND_BIN"
echo "Network:          $KASPA_NETWORK"
echo "wRPC URL:         $KASPA_WRPC_URL"
echo "Log file:         $LOG_FILE"
echo

if [ ! -f "$BACKEND_BIN" ]; then
    echo "ERROR: Backend binary not found at $BACKEND_BIN"
    echo "Please build it first: cd $APP_DIR/backend && cargo build --release"
    exit 1
fi

# Stop any existing instance
echo "[1/3] Stopping any running backend..."
pkill -f covex27-backend 2>/dev/null || true
sleep 1

# Start fresh
echo "[2/3] Starting backend..."
nohup "$BACKEND_BIN" > "$LOG_FILE" 2>&1 &
NEW_PID=$!
sleep 2

if ps -p $NEW_PID > /dev/null 2>&1; then
    echo "Backend started successfully (PID: $NEW_PID)"
else
    echo "ERROR: Backend failed to stay running. Check logs:"
    tail -30 "$LOG_FILE"
    exit 1
fi

echo
echo "[3/3] Recent logs:"
echo "----------------------------------------"
tail -25 "$LOG_FILE"
echo "----------------------------------------"
echo
echo "To follow logs live: tail -f $LOG_FILE"
echo "To check status:     pgrep -a covex27-backend"
echo "Health check:        curl -s http://127.0.0.1:3006/health | jq"
