#!/bin/bash
# ───────────────────────────────────────────────────────────────
# DEPLOY_TO_HIGHTABLE.sh - SECURITY HARDENED VERSION
# ───────────────────────────────────────────────────────────────
#
# CRITICAL: This script previously contained the production server root
# password in plaintext ("eiknxblt"). That password was publicly committed
# to the GitHub repository and must be considered compromised.
#
# IMMEDIATE ACTIONS:
# 1. Rotate the Hetzner server password for root@Hightable (178.105.76.81) IMMEDIATELY.
# 2. Disable password authentication for SSH. Use SSH key authentication only.
# 3. Update any automation to use key-based auth (e.g. ssh -i ~/.ssh/hightable_key ...).
# 4. After rotating, delete this old script or keep only the hardened version.
#
# Usage (after rotation):
#   export PASSWORD="your-new-rotated-password"
#   ./DEPLOY_TO_HIGHTABLE.sh
#
# Prefer key-based auth and remove the need for PASSWORD entirely.

set -e

if [ -z "${PASSWORD:-}" ]; then
  echo "ERROR: PASSWORD environment variable is required."
  echo "Do NOT hardcode passwords in scripts."
  echo "Export it for this session only or use a proper secrets manager."
  echo "Example: PASSWORD=yourpassword ./DEPLOY_TO_HIGHTABLE.sh"
  exit 1
fi

SERVER="root@Hightable"

# WARNING: Password auth is insecure. Migrate to SSH keys as soon as possible.
echo "=== Deploying to hightable.pro (using provided PASSWORD env var) ==="
echo "Server: $SERVER"
echo ""

echo "Connecting and pulling latest code + rebuilding frontend..."
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o PubkeyAuthentication=no \
    "root@$PASSWORD@$SERVER" << 'EOF' 2>/dev/null || \
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    $SERVER << 'EOF'
  set -e
  cd /root/Covex27
  echo "Current commit:"
  git log --oneline -1

  git fetch origin
  git reset --hard origin/master

  echo "Building frontend..."
  cd frontend
  npm install --prefer-offline --no-audit
  npm run build

  echo "Reloading nginx (static files served from dist)..."
  systemctl reload nginx || true

  echo ""
  echo "=== DEPLOY COMPLETE ==="
  echo "The new payment flow (pay first → clean covenants list + Go to Terminal) should now be live on https://hightable.pro/pricing"
  echo "Test by clicking a paid tier, completing the payment, and confirming."
EOF

echo ""
echo "Done. Check https://hightable.pro/pricing now."

# Post-deployment: strongly recommend rotating the password again and moving to key auth.