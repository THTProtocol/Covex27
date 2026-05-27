#!/bin/bash
# Run this on YOUR LOCAL MACHINE (the one that can reach "Hightable")
# It will SSH into the server using the password you provided and deploy the latest paid-tier fixes.

set -e

PASSWORD="eiknxblt"
SERVER="root@Hightable"

echo "=== Deploying latest paid tier fixes to hightable.pro ==="
echo "Server: $SERVER"
echo ""

# We use sshpass if available, otherwise fall back to a note
if command -v sshpass >/dev/null 2>&1; then
  SSH_CMD="sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
  SCP_CMD="sshpass -p $PASSWORD scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
else
  echo "sshpass not found on your machine."
  echo "Please install it (brew install sshpass on mac, or apt install sshpass on linux)"
  echo "Then re-run this script."
  exit 1
fi

echo "Connecting and pulling latest code + rebuilding frontend..."
$SSH_CMD $SERVER << 'EOF'
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