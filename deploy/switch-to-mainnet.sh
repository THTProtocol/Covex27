#!/bin/bash
#
# Phase 4: Automatic Post-Toccata Hard Fork Mainnet Switch Script
#
# This script safely switches the Covex backend from TN12 (testnet) to mainnet
# after the Toccata hard fork has activated on mainnet.
#
# Usage (run as root or the deploy user on the production server):
#   chmod +x deploy/switch-to-mainnet.sh
#   ./deploy/switch-to-mainnet.sh
#
# What it does:
#   1. Stops the current backend
#   2. Updates environment for mainnet (network + treasury)
#   3. (Optional) Updates wRPC URL if provided
#   4. Restarts the backend
#   5. Verifies the new configuration
#
# SAFETY: Always test this flow on a staging machine first.

set -euo pipefail

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   COVEX PHASE 4 — POST-TOCCATA MAINNET MIGRATION SCRIPT    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_BIN="$APP_DIR/backend/target/release/covex27-backend"
LOG_FILE="/tmp/covex27.log"

# === MAINNET CONFIGURATION (EDIT THESE BEFORE RUNNING) ===
MAINNET_TREASURY="${MAINNET_TREASURY:-kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2}"
MAINNET_WRPC_URL="${MAINNET_WRPC_URL:-ws://127.0.0.1:17310}"   # On hightable.pro this is the reverse SSH tunnel to the operator PC node; a local node would be ws://127.0.0.1:17110
MAINNET_BIND_ADDR="0.0.0.0:3006"

echo "Current network detected from running process (if any):"
if pgrep -f covex27-backend >/dev/null 2>&1; then
    echo "  Backend is currently running."
else
    echo "  No backend process detected."
fi

echo
read -p "This will SWITCH to MAINNET. Are you sure? (type YES to continue): " confirm
if [ "$confirm" != "YES" ]; then
    echo "Aborted."
    exit 1
fi

echo
echo "[1/5] Stopping current backend..."
pkill -f covex27-backend 2>/dev/null || true
sleep 2

echo "[2/5] Updating environment for mainnet..."

# Create or update a simple env file that the startup script / systemd can source
ENV_FILE="$APP_DIR/.env.production"
cat > "$ENV_FILE" <<EOF
KASPA_NETWORK=mainnet
KASPA_WRPC_URL=$MAINNET_WRPC_URL
BIND_ADDR=$MAINNET_BIND_ADDR
DB_PATH=$APP_DIR/covex.db
COVENANT_TREASURY_ADDRESS=$MAINNET_TREASURY
COVENANT_SEED_ADDRESSES=
CRAWL_START_DAA=1
RUST_LOG=covex27_backend=info,kaspa_wrpc=warn
# Oracle signing key: override for mainnet (REQUIRED before mainnet launch)
COVEX_ORACLE_KEY=${COVEX_ORACLE_KEY:-}
EOF

echo "  Wrote $ENV_FILE"

echo "[3/5] Starting backend with mainnet configuration..."

# Use the robust helper if it exists, otherwise fall back to direct nohup
if [ -x "$APP_DIR/deploy/start-covex-backend.sh" ]; then
    echo "  Using deploy/start-covex-backend.sh (recommended)"
    # Temporarily override for mainnet
    export KASPA_NETWORK=mainnet
    export KASPA_WRPC_URL="$MAINNET_WRPC_URL"
    export COVENANT_TREASURY_ADDRESS="$MAINNET_TREASURY"
    "$APP_DIR/deploy/start-covex-backend.sh"
else
    nohup env \
        KASPA_NETWORK=mainnet \
        KASPA_WRPC_URL="$MAINNET_WRPC_URL" \
        COVENANT_TREASURY_ADDRESS="$MAINNET_TREASURY" \
        BIND_ADDR="$MAINNET_BIND_ADDR" \
        "$BACKEND_BIN" > "$LOG_FILE" 2>&1 &
    sleep 3
fi

echo "[4/5] Verifying new configuration..."
sleep 2

if curl -s --max-time 5 http://127.0.0.1:3006/health >/dev/null 2>&1; then
    echo "  ✓ Backend is responding on port 3006"
else
    echo "  ⚠ Backend may not be healthy yet. Check logs."
fi

echo
echo "[5/5] Current status:"
echo "----------------------------------------"
tail -15 "$LOG_FILE" 2>/dev/null || echo "(no log yet)"
echo "----------------------------------------"

echo
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    MIGRATION COMPLETE                      ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Network:          mainnet                                 ║"
echo "║  Treasury:         $MAINNET_TREASURY          ║"
echo "║  wRPC:             $MAINNET_WRPC_URL                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo
echo "Next steps after HF:"
echo "  1. Verify the treasury address above is correct for mainnet"
echo "  2. Point KASPA_WRPC_URL at a healthy mainnet node"
echo "  3. Monitor logs for successful covenant indexing"
echo "  4. Update any public documentation / explorer links"
echo
echo "To revert to testnet: edit .env.production or re-run with testnet values"
