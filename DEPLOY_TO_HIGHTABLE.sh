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
#   ssh root@hightable.pro (historical) 'cd /root/Covex27 && git rev-parse HEAD'

set -e

if [ -z "${PASSWORD:-}" ]; then
  echo "ERROR: PASSWORD environment variable is required."
  echo "Usage: PASSWORD=your_rotated_password ./DEPLOY_TO_HIGHTABLE.sh"
  exit 1
fi

SERVER="hightable.pro"
HETZNER_SRC="/mnt/HC_Volume_105579109/Covex27"
SSH_CMD="sshpass -p \"$PASSWORD\" ssh -o StrictHostKeyChecking=no root@$SERVER"

echo "=== Covex27 Full Deploy ==="
echo "Server: $SERVER"
echo ""
echo "Includes: Pro full-screen chess.com-smooth games (chess after equal stakes), poker etc."
echo "Working ZK (merkle + range) + Oracle flows for resolution in the arenas."
echo ""

# ─── STEP 1: Push local to GitHub ───
echo "[1/6] Pushing to GitHub..."
git push origin master 2>/dev/null || echo "(already pushed or no changes)"

# ─── STEP 2: Pull on Hetzner ───
echo "[2/6] Pulling latest on Hetzner..."
$SSH_CMD << PULL_EOF
  cd $HETZNER_SRC
  git fetch origin
  git reset --hard origin/master
  echo "  Hetzner now at: $(git rev-parse --short HEAD) $(git log --oneline -1)"
PULL_EOF

# ─── STEP 3: Build frontend ───
echo "[3/6] Building frontend (Vite)..."
$SSH_CMD << FE_EOF
  cd $HETZNER_SRC/frontend
  npm install --legacy-peer-deps --prefer-offline --no-audit 2>&1 | tail -2
  npx vite build 2>&1 | tail -4
FE_EOF

# ─── STEP 4: Copy dist to nginx root + clean stale bundles ───
echo "[4/6] Deploying frontend to nginx..."
$SSH_CMD << CP_EOF
  cp -r $HETZNER_SRC/frontend/dist/* /root/htp/public/
  # Robust active bundle detection + perms (prevents "Permission denied" and blank "Active bundle:" in logs)
  chmod -R a+r /root/htp/public/ 2>/dev/null || true
  # Try html first (script src="/assets/index-xxx.js" or similar), then latest in assets/
  ACTIVE=$(grep -oE 'index-[A-Za-z0-9_.-]+\.js' /root/htp/public/index.html 2>/dev/null | head -1 || true)
  if [ -z "\$ACTIVE" ]; then
    ACTIVE=$(ls -1t /root/htp/public/assets/index-*.js 2>/dev/null | head -1 | xargs -r basename 2>/dev/null || true)
  fi
  if [ -d /root/htp/public/assets ] && [ -n "\$ACTIVE" ]; then
    cd /root/htp/public/assets 2>/dev/null || true
    for f in index-*.js; do
      if [ "\$f" != "\$ACTIVE" ]; then
        rm -v "\$f" 2>/dev/null || true
      fi
    done
  fi
  echo "  Active bundle: \${ACTIVE:-unknown}"
CP_EOF

# ─── STEP 5: Build backend (Rust release) ───
echo "[5/6] Building backend (cargo --release)..."
$SSH_CMD << BE_EOF
  source /root/.cargo/env
  cd $HETZNER_SRC/backend
  cargo build --release 2>&1 | tail -3
BE_EOF

# ─── STEP 6: Restart backend ───
echo "[6/6] Restarting backend..."
$SSH_CMD << RESTART_EOF
  # Kill old process(es) by explicit PIDs
  PIDS=\$(pgrep covex27-backend)
  if [ -n "\$PIDS" ]; then
    kill \$PIDS 2>/dev/null
    sleep 2
  fi
  # Verify dead
  if pgrep covex27-backend > /dev/null; then
    echo "  WARNING: old backend still alive, force-killing..."
    pkill -9 covex27-backend
    sleep 2
  fi
  # Start new binary (inject GIT_COMMIT for /health and /status to report exact commit-ish)
  source /root/.cargo/env
  cd $HETZNER_SRC
  GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  nohup env GIT_COMMIT="$GIT_COMMIT" $HETZNER_SRC/backend/target/release/covex27-backend \
    > /tmp/covex27.log 2>&1 &
  sleep 4
  # Use the live backend port (3006 from current Hetzner setup, fallback 3005)
  HEALTH=\$(curl -s http://127.0.0.1:3006/health 2>/dev/null || curl -s http://127.0.0.1:3005/health 2>/dev/null || echo "health check failed")
  echo "  Backend health: \$HEALTH"
  STATUS=\$(curl -s http://127.0.0.1:3006/status 2>/dev/null || curl -s http://127.0.0.1:3005/status 2>/dev/null || echo "status check failed")
  echo "  Status: \$STATUS"
RESTART_EOF

# ─── VERIFY ───
echo ""
echo "=== DEPLOY COMPLETE ==="
echo ""
echo "Verify triple sync:"
LOCAL=$(git rev-parse HEAD)
GITHUB=$(git ls-remote origin HEAD | awk '{print $1}')
HETZNER=$($SSH_CMD "cd $HETZNER_SRC && git rev-parse HEAD")
echo "  LOCAL:   ${LOCAL:0:8}"
echo "  GITHUB:  ${GITHUB:0:8}"
echo "  HETZNER: ${HETZNER:0:8}"
if [ "$LOCAL" = "$GITHUB" ] && [ "$GITHUB" = "$HETZNER" ]; then
  echo "  ✅ TRIPLE SYNC VERIFIED (GitHub / Hetzner / source all at ${LOCAL:0:8})"
else
  echo "  ⚠️  SYNC MISMATCH - investigate!"
fi
echo ""
echo "Live site check:"
curl -sI https://hightable.pro/ | head -3
echo ""
echo "Backend health:"
$SSH_CMD 'curl -s http://127.0.0.1:3006/health || curl -s http://127.0.0.1:3005/health || echo "backend health check failed (may need port adjust)"'
echo ""
echo "Check live: https://hightable.pro"
echo "API example: curl https://hightable.pro/api/v1/covenants?network=testnet-12&limit=3"
