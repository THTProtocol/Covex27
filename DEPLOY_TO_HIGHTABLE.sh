#!/bin/bash
# Covex27 Full Deploy to hightable.pro
#
# Syncs GitHub master → Hetzner server → https://hightable.pro
# Builds both frontend (Vite) and backend (Rust), restarts services.
#
# Prerequisites:
#   export PASSWORD="your_rotated_server_password"
#   ./DEPLOY_TO_HIGHTABLE.sh
#
# After running, verify triple sync:
#   git rev-parse HEAD
#   git ls-remote origin HEAD | awk '{print $1}'
#   ssh root@178.105.76.81 'cd /root/Covex27 && git rev-parse HEAD'

set -e

if [ -z "${PASSWORD:-}" ]; then
  echo "ERROR: PASSWORD environment variable is required."
  echo "Usage: PASSWORD=your_rotated_password ./DEPLOY_TO_HIGHTABLE.sh"
  exit 1
fi

SERVER="178.105.76.81"
SSH_CMD="sshpass -p \"$PASSWORD\" ssh -o StrictHostKeyChecking=no root@$SERVER"

echo "=== Covex27 Full Deploy ==="
echo "Server: $SERVER"
echo ""

# ─── STEP 1: Push local to GitHub ───
echo "[1/6] Pushing to GitHub..."
git push origin master 2>/dev/null || echo "(already pushed or no changes)"

# ─── STEP 2: Pull on Hetzner ───
echo "[2/6] Pulling latest on Hetzner..."
$SSH_CMD << 'PULL_EOF'
  cd /root/Covex27
  git fetch origin
  git reset --hard origin/master
  echo "  Hetzner now at: $(git rev-parse --short HEAD) $(git log --oneline -1)"
PULL_EOF

# ─── STEP 3: Build frontend ───
echo "[3/6] Building frontend (Vite)..."
$SSH_CMD << 'FE_EOF'
  cd /root/Covex27/frontend
  npm install --legacy-peer-deps --prefer-offline --no-audit 2>&1 | tail -2
  npx vite build 2>&1 | tail -4
FE_EOF

# ─── STEP 4: Copy dist to nginx root + clean stale bundles ───
echo "[4/6] Deploying frontend to nginx..."
$SSH_CMD << 'CP_EOF'
  cp -r /root/Covex27/frontend/dist/* /root/htp/public/
  ACTIVE=$(grep -o 'index-[^.]*\.js' /root/htp/public/index.html)
  cd /root/htp/public/assets
  for f in index-*.js; do
    if [ "$f" != "$ACTIVE" ]; then
      rm -v "$f"
    fi
  done
  echo "  Active bundle: $ACTIVE"
CP_EOF

# ─── STEP 5: Build backend (Rust release) ───
echo "[5/6] Building backend (cargo --release)..."
$SSH_CMD << 'BE_EOF'
  source /root/.cargo/env
  cd /root/Covex27/backend
  cargo build --release 2>&1 | tail -3
BE_EOF

# ─── STEP 6: Restart backend ───
echo "[6/6] Restarting backend..."
$SSH_CMD << 'RESTART_EOF'
  # Kill old process(es) by explicit PIDs
  PIDS=$(pgrep covex27-backend)
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null
    sleep 2
  fi
  # Verify dead
  if pgrep covex27-backend > /dev/null; then
    echo "  WARNING: old backend still alive, force-killing..."
    pkill -9 covex27-backend
    sleep 2
  fi
  # Start new binary
  source /root/.cargo/env
  nohup /mnt/HC_Volume_105579109/Covex27/backend/target/release/covex27-backend \
    > /tmp/covex27.log 2>&1 &
  sleep 4
  HEALTH=$(curl -s http://127.0.0.1:3005/health)
  echo "  Backend health: $HEALTH"
  STATUS=$(curl -s http://127.0.0.1:3005/status)
  echo "  Status: $STATUS"
RESTART_EOF

# ─── VERIFY ───
echo ""
echo "=== DEPLOY COMPLETE ==="
echo ""
echo "Verify triple sync:"
echo "  LOCAL:   $(git rev-parse --short HEAD)"
echo "  GITHUB:  $(git ls-remote origin HEAD | awk '{print $1}' | cut -c1-8)"
echo "  HETZNER: $($SSH_CMD 'cd /root/Covex27 && git rev-parse --short HEAD')"
echo ""
echo "Check live site: https://hightable.pro"
echo "Check backend:   curl https://hightable.pro/api/status"
