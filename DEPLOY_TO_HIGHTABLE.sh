#!/bin/bash
# Phase 1 sync script for hightable.pro
# Run this from YOUR LOCAL MACHINE after GitHub master is updated.
# It pulls the latest Phase 1 changes (BUILDER naming, no more C M R V C letters, Marketplace → Template Library, clearer tier copy, etc.)
# and rebuilds the frontend on the server.

set -e

if [ -z "${PASSWORD:-}" ]; then
  echo "ERROR: Set PASSWORD env var with your current (rotated) server password."
  echo "Example: PASSWORD=yournewpassword ./DEPLOY_TO_HIGHTABLE.sh"
  exit 1
fi

SERVER="root@Hightable"

echo "=== Syncing Phase 1 changes to hightable.pro ==="

echo "Connecting and pulling latest code + rebuilding frontend..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $SERVER << 'EOF'
  set -e
  cd /root/Covex27
  git fetch origin
  git reset --hard origin/master

  echo "Building frontend with latest Phase 1 changes..."
  cd frontend
  npm install --prefer-offline --no-audit
  npm run build

  echo "Reloading nginx..."
  systemctl reload nginx || true

  echo "=== hightable.pro is now on the same page as GitHub master ==="
EOF

echo "Done. Visit https://hightable.pro/pricing and the Terminal to see BUILDER / PRO / MAX and clean circuit selectors."