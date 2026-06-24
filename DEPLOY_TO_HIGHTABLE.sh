#!/bin/bash
# Covex27 Full Deploy to hightable.pro
#
# Syncs GitHub master → Hetzner server → https://hightable.pro
# Builds both frontend (Vite) and backend (Rust), restarts services.
#
# Prerequisites:
#   The operator MUST install the deploy PUBLIC key in root@hightable.pro's
#   ~/.ssh/authorized_keys (ssh-copy-id -i "${DEPLOY_SSH_KEY}.pub" root@hightable.pro).
#   Then run:
#     export DEPLOY_SSH_KEY="$HOME/.ssh/covex_deploy"   # path to the PRIVATE key
#     ./DEPLOY_TO_HIGHTABLE.sh
#
# After running, verify triple sync:
#   git rev-parse HEAD
#   git ls-remote origin HEAD | awk '{print $1}'
#   ssh root@hightable.pro (historical) 'cd /root/Covex27 && git rev-parse HEAD'

set -e

# Key-based SSH auth only. We no longer use sshpass/password auth, and we no
# longer disable host-key checking (StrictHostKeyChecking=no is MITM-able).
# accept-new pins the host key on first connect and refuses if it later changes.
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/covex_deploy}"
if [ ! -f "$DEPLOY_SSH_KEY" ]; then
  echo "ERROR: deploy SSH private key not found at: $DEPLOY_SSH_KEY"
  echo "Set DEPLOY_SSH_KEY to the private key whose PUBLIC half is installed in"
  echo "root@hightable.pro:~/.ssh/authorized_keys, then re-run."
  exit 1
fi

SERVER="hightable.pro"
HETZNER_SRC="/mnt/HC_Volume_105579109/Covex27"
SSH_CMD="ssh -i \"$DEPLOY_SSH_KEY\" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes root@$SERVER"

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
  chmod -R a+r /root/htp/public/ 2>/dev/null || true

  # ─── Prune ALL stale hashed assets, not just index-*.js ───
  # Vite content-hashes and code-splits every page into its own chunk
  # (index-<hash>.js, Terms-<hash>.js, …) plus a matching .js.map. Old chunks
  # from prior builds orphan in the nginx assets/ dir and stay publicly
  # downloadable (e.g. a superseded Terms-DPA5k2pv.js served after a rewrite).
  # The freshly built dist is the source of truth: delete any file in the live
  # assets/ dir whose basename is absent from the fresh dist/assets/. We never
  # touch a file the build just produced, so this is safe for every asset type
  # (.js, .js.map, .css, fonts, images).
  #
  # NOTE: the \$(...) and \$f below are escaped so they run on the SERVER. The
  # previous version left grep's \$(...) unescaped, so it executed on the local
  # (Windows) box where /root/htp/public/index.html does not exist — ACTIVE was
  # always empty, the cleanup guard failed, and NOTHING was ever pruned.
  FRESH_ASSETS="$HETZNER_SRC/frontend/dist/assets"
  LIVE_ASSETS="/root/htp/public/assets"
  PRUNED=0
  if [ -d "\$LIVE_ASSETS" ] && [ -d "\$FRESH_ASSETS" ]; then
    for f in "\$LIVE_ASSETS"/*; do
      [ -e "\$f" ] || continue
      base=\$(basename "\$f")
      if [ ! -e "\$FRESH_ASSETS/\$base" ]; then
        rm -vf "\$f" && PRUNED=\$((PRUNED + 1))
      fi
    done
  fi
  echo "  Pruned \$PRUNED stale asset(s) absent from fresh build"

  # Report the active entry bundle (from index.html) for log visibility.
  ACTIVE=\$(grep -oE 'index-[A-Za-z0-9_.-]+\.js' /root/htp/public/index.html 2>/dev/null | head -1 || true)
  if [ -z "\$ACTIVE" ]; then
    ACTIVE=\$(ls -1t /root/htp/public/assets/index-*.js 2>/dev/null | head -1 | xargs -r basename 2>/dev/null || true)
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
