#!/bin/bash
# Phase 2 Complete Sync Script for hightable.pro
#
# Run this from YOUR LOCAL MACHINE (the one that can reach the server).
# It will pull all Phase 2 changes (shadcn/ui + hybrid components,
# full light/dark cypherpunk theme with Kaspa green,
# massively improved Explorer with BUILDER tier + My Paid Covenants fix + Interactive Demos,
# polished PaidBuilder, improved Pricing & Kaspa pages, mobile responsiveness, etc.)
# then rebuild the frontend and reload nginx.
#
# Prerequisites:
# - You have the latest local copy of the repo (git pull origin master)
# - You have your current rotated server password ready
# - npm is available locally if you want to test build first (optional)

set -e

if [ -z "${PASSWORD:-}" ]; then
  echo "ERROR: PASSWORD environment variable is required."
  echo "Usage: PASSWORD=your_rotated_password ./DEPLOY_TO_HIGHTABLE.sh"
  exit 1
fi

SERVER="root@Hightable"

echo "=== Deploying Phase 2 Complete to hightable.pro ==="
echo "Server: $SERVER"

echo "Connecting and syncing latest code..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $SERVER << 'EOF'
  set -e
  cd /root/Covex27
  echo "Current commit before pull:"
  git log --oneline -1

  git fetch origin
  git reset --hard origin/master

  echo "Building frontend (Phase 2 UI overhaul)..."
  cd frontend
  npm install --prefer-offline --no-audit
  npm run build

  echo "Reloading nginx..."
  systemctl reload nginx || true

  echo ""
  echo "=== DEPLOY COMPLETE ==="
  echo "hightable.pro is now fully synced with GitHub master (Phase 2 complete)."
  echo "Visit https://hightable.pro to verify the new design system, theme toggle, Explorer improvements, etc."
EOF

echo ""
echo "Done. All three (GitHub, Hetzner server, live hightable.pro) should now be on the same Phase 2 version."