#!/bin/bash
# Covex Hetzner Deployment Setup Script
# Run this on the Hetzner VPS as root (or a user with sudo) to install everything.
#
# Usage:  chmod +x deploy/deploy-hetzner.sh && sudo deploy/deploy-hetzner.sh
#
# This script:
#   1. Installs system dependencies (nginx, Rust, Node.js)
#   2. Creates a dedicated 'deploy' user
#   3. Clones the Covex27 repository
#   4. Builds the Rust backend (release) and React frontend
#   5. Installs nginx config for hightable.pro
#   6. Installs systemd service for the backend
#   7. Starts everything

set -euo pipefail

DOMAIN="hightable.pro"
DEPLOY_USER="deploy"
DEPLOY_HOME="/home/${DEPLOY_USER}"
REPO_URL="https://github.com/THTProtocol/Covex27.git"
APP_DIR="${DEPLOY_HOME}/Covex27"

echo "=== Covex Hetzner Deployment ==="
echo "Domain: ${DOMAIN}"
echo

# ─── 1. System dependencies ────────────────────────────────────────
echo "[1/8] Installing system dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    nginx \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    git \
    ca-certificates \
    2>&1 | tail -1

# ─── 2. Install Rust (if not present) ──────────────────────────────
echo "[2/8] Checking Rust toolchain..."
if ! command -v cargo &>/dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.80
    source "${HOME}/.cargo/env"
fi
rustup default 1.80 2>/dev/null || true
cargo --version

# ─── 3. Install Node.js 20 (if not present) ────────────────────────
echo "[3/8] Checking Node.js..."
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
node --version
npm --version

# ─── 4. Create deploy user ─────────────────────────────────────────
echo "[4/8] Setting up deploy user..."
if ! id "${DEPLOY_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${DEPLOY_USER}"
    usermod -aG www-data "${DEPLOY_USER}"
fi
mkdir -p "${DEPLOY_HOME}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}"

# ─── 5. Clone repository ───────────────────────────────────────────
echo "[5/8] Cloning Covex27 repository..."
if [ -d "${APP_DIR}" ]; then
    echo "  Directory exists, pulling latest..."
    cd "${APP_DIR}"
    sudo -u "${DEPLOY_USER}" git pull origin master
else
    sudo -u "${DEPLOY_USER}" git clone "${REPO_URL}" "${APP_DIR}"
fi

# ─── 6. Build backend (release) ────────────────────────────────────
echo "[6/8] Building Rust backend (release)..."
cd "${APP_DIR}/backend"

# Copy production env
if [ -f "${APP_DIR}/deploy/.env.production" ]; then
    cp "${APP_DIR}/deploy/.env.production" "${APP_DIR}/.env"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/.env"
fi

# Build release binary
if [ "$(whoami)" = "root" ]; then
    sudo -u "${DEPLOY_USER}" bash -c "source ${DEPLOY_HOME}/.cargo/env 2>/dev/null || true; cd ${APP_DIR}/backend && cargo build --release 2>&1" | tail -5
else
    cargo build --release 2>&1 | tail -5
fi

echo "  Binary: $(ls -lh ${APP_DIR}/backend/target/release/covex27-backend | awk '{print $5, $NF}')"

# ─── 7. Build frontend ─────────────────────────────────────────────
echo "[7/8] Building React frontend..."
cd "${APP_DIR}/frontend"
sudo -u "${DEPLOY_USER}" npm install --legacy-peer-deps 2>&1 | tail -2
sudo -u "${DEPLOY_USER}" npm run build 2>&1 | tail -3

echo "  Dist: $(du -sh ${APP_DIR}/frontend/dist | awk '{print $1}')"

# ─── 8. Install nginx config ──────────────────────────────────────
echo "[8/8] Installing nginx config..."
cp "${APP_DIR}/deploy/nginx-covex.conf" "/etc/nginx/sites-available/covex"
ln -sf "/etc/nginx/sites-available/covex" "/etc/nginx/sites-enabled/covex"

# Remove default site if present
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t 2>&1
systemctl reload nginx 2>/dev/null || systemctl start nginx
echo "  nginx: OK"

# ─── Install systemd service ──────────────────────────────────────
cp "${APP_DIR}/deploy/covex-backend.service" "/etc/systemd/system/covex-backend.service"
systemctl daemon-reload
systemctl enable covex-backend
systemctl start covex-backend 2>/dev/null || echo "  (start covex-backend manually after verifying env)"

# ─── Verify deployment ────────────────────────────────────────────
sleep 2
echo
echo "=== Deployment Complete ==="
echo
echo "Quick checks:"
echo "  curl -s http://localhost:3001/api/health"
curl -s http://localhost:3001/api/health 2>/dev/null || echo "  (backend not running yet - start it manually)"
echo
echo "  systemctl status covex-backend"
systemctl status covex-backend --no-pager -l 2>/dev/null || echo "  (check systemd service)"
echo
echo "  curl -sI http://localhost/"
curl -sI http://localhost/ 2>/dev/null | head -3 || echo "  (nginx not responding)"
echo
echo "Verify at: https://${DOMAIN}"
echo "Done."
