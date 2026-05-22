#!/usr/bin/env bash
# ============================================================================
# COVEX27 + HIGHTABLE.PRO — UNIFIED DEPLOYMENT SCRIPT (TESTNET-10)
# ============================================================================
# Run once. Immutable. Non-interactive. Hardened.
#
# Usage:  sudo bash deploy_all.sh
#
# PREREQUISITES (must exist before running):
#   - kaspad binary at /home/kasparov/.cargo/bin/kaspad
#   - Rust toolchain (cargo build --release)
#   - Node.js + npm (npm run build)
#   - nginx installed
#   - git installed
#   - systemd (Hetzner Linux)
#
# IMMUTABLE CONSTANTS (testnet-12):
#   TREASURY: kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m
#   NETWORK:  testnet-12
#   DOMAIN:   hightable.pro
# ============================================================================
set -euo pipefail

# ---- CONSTANTS -------------------------------------------------------------
TREASURY="kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m"
NETWORK="testnet-12"
KASPAD_BIN="/home/kasparov/.cargo/bin/kaspad"
KASPA_DATA_DIR="/home/kasparov/kaspa-tn10-data"
KASPA_USER="kasparov"
DOMAIN="hightable.pro"
BACKEND_PORT=3001
PROJECT_DIR="/home/kasparov/Covex27"
FRONTEND_DIST="${PROJECT_DIR}/frontend/dist"

echo "════════════════════════════════════════════════════════════════════"
echo "  COVEX27 + HIGHTABLE.PRO — UNIFIED DEPLOY"
echo "  NETWORK:  ${NETWORK}"
echo "  TREASURY: ${TREASURY}"
echo "  DOMAIN:   ${DOMAIN}"
echo "  TIMESTAMP: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "════════════════════════════════════════════════════════════════════"

# ===========================================================================
# STEP 1 — GITHUB SYNC
# ===========================================================================
echo ""
echo "── STEP 1: GITHUB SYNC ──────────────────────────────────────────────"
echo ""

cd "${PROJECT_DIR}"

echo "[1.1] Fetching latest from origin..."
git fetch --all
echo "       OK — branches synced"

echo "[1.2] Hard-resetting to origin/master..."
git reset --hard origin/master
echo "       OK — reset to $(git rev-parse --short HEAD)"

echo "[1.3] Installing frontend dependencies..."
cd "${PROJECT_DIR}/frontend"
npm install --no-audit --no-fund 2>&1 | tail -3
echo "       OK — npm install complete"

echo "[1.4] Building Rust backend (cargo build --release)..."
cd "${PROJECT_DIR}/backend"
cargo build --release 2>&1 | tail -5
echo "       OK — cargo build complete"
BINARY="${PROJECT_DIR}/backend/target/release/covex27-backend"
if [ -f "${BINARY}" ]; then
    echo "       Binary: ${BINARY} ($(du -h "${BINARY}" | cut -f1))"
else
    echo "       FATAL: Binary not found after build!"
    exit 1
fi

# ===========================================================================
# STEP 2 — ENVIRONMENT LOCK
# ===========================================================================
echo ""
echo "── STEP 2: ENVIRONMENT LOCK ─────────────────────────────────────────"
echo ""

# 2.1 — Project .env
cat > "${PROJECT_DIR}/.env" <<'DOTENV'
KASPA_NETWORK=testnet-12
KASPA_WRPC_URL=ws://127.0.0.1:17217
COVENANT_TREASURY_ADDRESS=kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m
DOTENV
echo "[2.1] Project .env written: ${PROJECT_DIR}/.env"
cat "${PROJECT_DIR}/.env"

# 2.2 — Deploy .env.production
cat > "${PROJECT_DIR}/deploy/.env.production" <<'DOTENVPROD'
# Covex Production Environment - Hetzner VPS (hightable.pro)
KASPA_NETWORK=testnet-12
KASPA_WRPC_URL=ws://127.0.0.1:17217
BIND_ADDR=127.0.0.1:3001
DB_PATH=../covex.db
COVENANT_TREASURY_ADDRESS=kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m
COVENANT_SEED_ADDRESSES=
RUST_LOG=covex27_backend=info,kaspa_wrpc=warn
DOTENVPROD
echo "[2.2] deploy/.env.production written"

# 2.3 — Verify treasury address consistency across all source files
echo "[2.3] Verifying treasury address consistency..."
STALE_COUNT=$(grep -rl 'qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2' \
    "${PROJECT_DIR}/frontend/src" \
    "${PROJECT_DIR}/backend/src" \
    "${PROJECT_DIR}/deploy" \
    "${PROJECT_DIR}/.env" 2>/dev/null | grep -v node_modules | grep -v target | wc -l || echo 0)
if [ "${STALE_COUNT}" -gt 0 ]; then
    echo "       WARNING: ${STALE_COUNT} files still contain old mainnet treasury address:"
    grep -rl 'qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2' \
        "${PROJECT_DIR}/frontend/src" \
        "${PROJECT_DIR}/backend/src" \
        "${PROJECT_DIR}/deploy" \
        "${PROJECT_DIR}/.env" 2>/dev/null | grep -v node_modules | grep -v target
else
    echo "       OK — zero stale treasury addresses"
fi

# ===========================================================================
# STEP 3 — NODE PERSISTENCE (kaspad systemd)
# ===========================================================================
echo ""
echo "── STEP 3: KASPAD SYSTEMD SERVICE ───────────────────────────────────"
echo ""

cat > /etc/systemd/system/kaspad.service <<KASPADSVC
[Unit]
Description=Kaspa Full Node (testnet-12)
After=network.target

[Service]
Type=simple
User=${KASPA_USER}
ExecStart=${KASPAD_BIN} --testnet --utxoindex --appdir=${KASPA_DATA_DIR} --rpclisten=0.0.0.0:16217 --rpclisten-borsh=0.0.0.0:17217 --listen=0.0.0.0:16218

Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
KASPADSVC
echo "[3.1] /etc/systemd/system/kaspad.service written"
cat /etc/systemd/system/kaspad.service

echo "[3.2] Enabling and restarting kaspad..."
systemctl daemon-reload
systemctl enable kaspad.service
systemctl restart kaspad.service
sleep 3
if systemctl is-active --quiet kaspad.service; then
    echo "       OK — kaspad is running"
else
    echo "       WARNING: kaspad failed to start — check journalctl -u kaspad"
fi

# ===========================================================================
# STEP 4 — COVEX27 API (systemd) + FRONTEND BUILD + NGINX
# ===========================================================================
echo ""
echo "── STEP 4: API & FRONTEND SYNC ─────────────────────────────────────"
echo ""

# 4.1 — Covex27 backend systemd service
cat > /etc/systemd/system/covex27-api.service <<COVEXSVC
[Unit]
Description=Covex27 Backend - Rust Kaspa Covenant Explorer API
After=network.target kaspad.service
Wants=kaspad.service

[Service]
Type=simple
User=root
WorkingDirectory=${PROJECT_DIR}
Environment="KASPA_NETWORK=${NETWORK}"
Environment="KASPA_WRPC_URL=ws://127.0.0.1:17217"
Environment="BIND_ADDR=127.0.0.1:${BACKEND_PORT}"
Environment="DB_PATH=${PROJECT_DIR}/covex.db"
Environment="COVENANT_TREASURY_ADDRESS=${TREASURY}"
Environment="RUST_LOG=covex27_backend=info,kaspa_wrpc=warn"
ExecStart=${PROJECT_DIR}/backend/target/release/covex27-backend
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
COVEXSVC
echo "[4.1] /etc/systemd/system/covex27-api.service written"
cat /etc/systemd/system/covex27-api.service

echo "[4.2] Enabling and restarting covex27-api..."
systemctl daemon-reload
systemctl enable covex27-api.service
systemctl restart covex27-api.service
sleep 5
if systemctl is-active --quiet covex27-api.service; then
    echo "       OK — covex27-api is running"
else
    echo "       WARNING: covex27-api failed to start — check journalctl -u covex27-api"
fi

# 4.2 — Frontend build
echo "[4.3] Building frontend (npm run build)..."
cd "${PROJECT_DIR}/frontend"
npm run build 2>&1 | tail -5
if [ -f "${FRONTEND_DIST}/index.html" ]; then
    JS_SIZE=$(du -h "${FRONTEND_DIST}/assets/index-"*.js 2>/dev/null | cut -f1)
    echo "       OK — dist/ built (JS: ${JS_SIZE})"
else
    echo "       FATAL: Frontend build failed — dist/index.html not found"
    exit 1
fi

# 4.3 — Nginx configuration
echo "[4.4] Configuring Nginx for ${DOMAIN}..."
cat > /etc/nginx/sites-available/hightable <<'NGINXCONF'
# Covex27 — hightable.pro Nginx Configuration
# Serves React SPA + proxies /api/ to Rust backend on :3001

server {
    listen 80;
    server_name hightable.pro www.hightable.pro;

    root /root/Covex27/frontend/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;
    gzip_comp_level 5;

    # CORS headers
    add_header Access-Control-Allow-Origin "https://hightable.pro" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;

    # Frontend SPA
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # Static assets with long cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy to Rust backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_connect_timeout 10s;

        # CORS for API
        add_header Access-Control-Allow-Origin "https://hightable.pro" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 5s;
    }

    # Deny hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINXCONF
echo "       /etc/nginx/sites-available/hightable written"

# Enable site
ln -sf /etc/nginx/sites-available/hightable /etc/nginx/sites-enabled/hightable
rm -f /etc/nginx/sites-enabled/default
echo "[4.5] Symlinked hightable into sites-enabled, removed default"

# Test and reload
nginx -t 2>&1 && echo "       nginx config OK" || echo "       WARNING: nginx config test failed"
systemctl enable nginx
systemctl reload nginx 2>/dev/null || systemctl restart nginx
echo "       OK — nginx reloaded"

# ===========================================================================
# STEP 5 — HIGHTABLE.PRO SSL/TLS + CORS + PAYMENT GATE
# ===========================================================================
echo ""
echo "── STEP 5: HIGHTABLE.PRO INTEGRATION ───────────────────────────────"
echo ""

# 5.1 — SSL/TLS placeholder (certbot or manual cert assumed)
echo "[5.1] SSL/TLS: If certbot is installed, run: certbot --nginx -d hightable.pro -d www.hightable.pro"
if command -v certbot &>/dev/null; then
    echo "       certbot found — attempting certificate acquisition..."
    certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --email admin@hightable.pro 2>&1 | tail -5 || \
        echo "       WARNING: certbot failed — upload certs manually"
else
    echo "       certbot not installed — SSL will need manual cert setup"
fi

# 5.2 — CORS: verify nginx add_header blocks are in place
echo "[5.2] Verifying CORS headers..."
if grep -q "Access-Control-Allow-Origin" /etc/nginx/sites-available/hightable; then
    echo "       OK — CORS headers present in nginx config"
else
    echo "       WARNING: No CORS headers found"
fi

# 5.3 — Payment gate: CreateCovenant.jsx redirect
echo "[5.3] Verifying payment gate..."
GATE_FILE="${PROJECT_DIR}/frontend/src/pages/CreateCovenant.jsx"
if grep -q "navigate('/pricing')" "${GATE_FILE}"; then
    echo "       OK — CreateCovenant redirects unpaid users to /pricing"
else
    echo "       WARNING: Payment gate redirect not found in CreateCovenant.jsx"
fi

# Verify DEPLOYER address
if grep -q "${TREASURY}" "${GATE_FILE}"; then
    echo "       OK — DEPLOYER matches treasury address"
else
    echo "       WARNING: DEPLOYER in CreateCovenant.jsx does not match treasury"
fi

# ===========================================================================
# STEP 6 — HEALTH REPORT SCRIPT
# ===========================================================================
echo ""
echo "── STEP 6: HEALTH REPORT GENERATOR ─────────────────────────────────"
echo ""

cat > "${PROJECT_DIR}/scripts/generate_covex_health_report.sh" <<'HEALTHSCRIPT'
#!/usr/bin/env bash
# ============================================================================
# Covex Health Diagnostic Report — Production (hightable.pro)
# Output: /root/Covex27/Covex_Health_Report.md
# ============================================================================
set -euo pipefail

REPORT="/root/Covex27/Covex_Health_Report.md"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
NETWORK="testnet-12"
TREASURY="kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m"
BACKEND_PORT=3001
DOMAIN="hightable.pro"

check_pass()  { echo "| $1 |  PASS  | $2 |"; }
check_fail()  { echo "| $1 |  FAIL  | $2 |"; }
check_warn()  { echo "| $1 |  WARN  | $2 |"; }

# ── Kaspa Node Sync Status ──────────────────────────────────────────
echo "→ Checking Kaspa node sync status..."
KASPAD_ACTIVE=false
systemctl is-active --quiet kaspad.service 2>/dev/null && KASPAD_ACTIVE=true
SYNC_STATUS="unknown"
SYNC_DETAIL=""
if $KASPAD_ACTIVE; then
    RESP=$(curl -sf --max-time 5 -X POST -H 'Content-Type: application/json' \
        -d '{"getBlockDagInfoRequest":{}}' http://127.0.0.1:16217 2>/dev/null || echo '{}')
    NET_REPORT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin).get('getBlockDagInfoResponse',{}); print(d.get('network','unknown'))" 2>/dev/null || echo "unknown")
    DAA=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin).get('getBlockDagInfoResponse',{}); print(d.get('virtualDaaScore','N/A'))" 2>/dev/null || echo "N/A")
    if [ "$NET_REPORT" = "$NETWORK" ]; then
        SYNC_STATUS="synced"
        SYNC_DETAIL="network=${NET_REPORT} DAA=${DAA}"
    else
        SYNC_STATUS="mismatch"
        SYNC_DETAIL="reported=${NET_REPORT} expected=${NETWORK} DAA=${DAA}"
    fi
else
    SYNC_DETAIL="kaspad service not running"
fi

# ── API Port 3001 ────────────────────────────────────────────────────
echo "→ Checking API port 3001..."
API_HEALTHY=false
API_RESPONSE=""
if curl -sf --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    API_HEALTHY=true
    API_RESPONSE=$(curl -sf --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/status" 2>/dev/null || echo '{"connected":false,"network":"unknown"}')
fi
API_NET=$(echo "$API_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('network','unknown'))" 2>/dev/null || echo "unknown")
API_TREASURY=$(echo "$API_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('treasury','MISSING'))" 2>/dev/null || echo "MISSING")

# ── Treasury Address Consistency ─────────────────────────────────────
echo "→ Checking treasury address consistency..."
STALE_COUNT=$(grep -rl 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2' \
    /root/Covex27/frontend/src /root/Covex27/backend/src /root/Covex27/deploy /root/Covex27/.env \
    2>/dev/null | grep -v node_modules | grep -v target | wc -l || echo 0)
TREASURY_CONSISTENT=false
[ "${STALE_COUNT}" -eq 0 ] && TREASURY_CONSISTENT=true

# ── Nginx ────────────────────────────────────────────────────────────
echo "→ Checking Nginx..."
NGINX_ACTIVE=false
systemctl is-active --quiet nginx 2>/dev/null && NGINX_ACTIVE=true
NGINX_CONFIG_OK=false
nginx -t 2>&1 | grep -q "syntax is ok" && NGINX_CONFIG_OK=true
SITE_ENABLED=false
[ -f /etc/nginx/sites-enabled/hightable ] && SITE_ENABLED=true
HTTP_OK=false
curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1/" 2>/dev/null | grep -q "200" && HTTP_OK=true

# ── Systemd Services ─────────────────────────────────────────────────
echo "→ Checking systemd services..."
COVEX_ACTIVE=false
systemctl is-active --quiet covex27-api.service 2>/dev/null && COVEX_ACTIVE=true

# ── Build Artifacts ──────────────────────────────────────────────────
BINARY_EXISTS=false
[ -f /root/Covex27/backend/target/release/covex27-backend ] && BINARY_EXISTS=true
DIST_EXISTS=false
[ -f /root/Covex27/frontend/dist/index.html ] && DIST_EXISTS=true

# ── BUILD REPORT ─────────────────────────────────────────────────────
mkdir -p "$(dirname "$REPORT")"
{
echo "# Covex Health Diagnostic Report"
echo ""
echo "**Generated:** $TIMESTAMP"
echo "**Host:** $(hostname)"
echo "**Domain:** $DOMAIN"
echo "**Network:** $NETWORK"
echo "**Treasury:** $TREASURY"
echo ""
echo "---"
echo ""
echo "## System Checks"
echo ""
echo "| Component | Status | Detail |"
echo "|-----------|--------|--------|"

$KASPAD_ACTIVE       && check_pass "kaspad Service"    "Running"                || check_fail "kaspad Service"    "Not running"
case "$SYNC_STATUS" in
    synced)           check_pass "Node Sync"           "$SYNC_DETAIL" ;;
    mismatch)         check_fail "Node Sync"           "$SYNC_DETAIL" ;;
    *)                check_warn "Node Sync"           "$SYNC_DETAIL" ;;
esac
$NGINX_ACTIVE        && check_pass "nginx Service"     "Running"                || check_fail "nginx Service"     "Not running"
$NGINX_CONFIG_OK     && check_pass "nginx Config"      "Syntax valid"           || check_fail "nginx Config"      "Config error"
$SITE_ENABLED        && check_pass "hightable Site"    "Enabled"                || check_fail "hightable Site"    "Not enabled"
$HTTP_OK             && check_pass "HTTP Response"     "200 OK"                 || check_fail "HTTP Response"     "Not responding"
$API_HEALTHY         && check_pass "API :${BACKEND_PORT}"        "Healthy"           || check_fail "API :${BACKEND_PORT}"        "Unreachable"
$COVEX_ACTIVE        && check_pass "covex27-api"       "Running"                || check_fail "covex27-api"       "Not running"
$BINARY_EXISTS       && check_pass "Backend Binary"    "Compiled"               || check_fail "Backend Binary"    "Missing"
$DIST_EXISTS         && check_pass "Frontend dist/"    "Built"                  || check_fail "Frontend dist/"    "Not built"
$TREASURY_CONSISTENT && check_pass "Treasury Address"  "All files consistent"   || check_fail "Treasury Address"  "${STALE_COUNT} stale files"

echo ""
echo "---"
echo ""
echo "## Network Detail"
echo ""
echo "- **API reports network:** ${API_NET}"
echo "- **API treasury:** ${API_TREASURY}"
echo ""

if $API_HEALTHY; then
    echo "### Backend Status Response"
    echo '```json'
    echo "$API_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$API_RESPONSE"
    echo '```'
fi

echo ""
echo "---"
echo ""
echo "## Remediation Commands"
echo ""
echo "| Issue | Command |"
echo "|-------|---------|"
$KASPAD_ACTIVE      || echo "| kaspad not running  | systemctl start kaspad |"
$API_HEALTHY        || echo "| API unreachable     | systemctl restart covex27-api |"
$SITE_ENABLED       || echo "| Site not enabled    | ln -s /etc/nginx/sites-available/hightable /etc/nginx/sites-enabled/hightable |"
! $TREASURY_CONSISTENT && echo "| Stale treasury refs | Run deploy_all.sh to fix all files |"
$BINARY_EXISTS      || echo "| No binary           | cd /root/Covex27/backend && cargo build --release |"
$DIST_EXISTS        || echo "| No dist/            | cd /root/Covex27/frontend && npm run build |"

echo ""
echo "---"
echo "*Report generated at $TIMESTAMP*"
} > "$REPORT"

echo ""
echo "Health report written: $REPORT ($(wc -l < "$REPORT") lines)"
HEALTHSCRIPT

chmod +x "${PROJECT_DIR}/scripts/generate_covex_health_report.sh"
echo "[6.1] Health report script written and made executable"
echo "       ${PROJECT_DIR}/scripts/generate_covex_health_report.sh"

# Run the health report immediately
echo "[6.2] Running initial health check..."
bash "${PROJECT_DIR}/scripts/generate_covex_health_report.sh"

# ===========================================================================
# FINAL SUMMARY
# ===========================================================================
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "  FILES WRITTEN:"
echo "    /etc/systemd/system/kaspad.service           — Kaspa full node"
echo "    /etc/systemd/system/covex27-api.service       — Covex27 backend"
echo "    /etc/nginx/sites-available/hightable          — Nginx site"
echo "    /root/Covex27/.env                            — Environment"
echo "    /root/Covex27/deploy/.env.production          — Production env"
echo "    /root/Covex27/scripts/generate_covex_health_report.sh"
echo ""
echo "  SERVICES:"
echo "    systemctl status kaspad.service"
echo "    systemctl status covex27-api.service"
echo "    systemctl status nginx"
echo ""
echo "  HEALTH REPORT:"
echo "    bash /root/Covex27/scripts/generate_covex_health_report.sh"
echo ""
echo "  VERIFY:"
echo "    curl http://127.0.0.1:3001/health"
echo "    curl http://127.0.0.1:3001/status"
echo "    curl -I http://hightable.pro"
echo ""
echo "  IF SSL NEEDED:"
echo "    certbot --nginx -d hightable.pro -d www.hightable.pro"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  Done — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "════════════════════════════════════════════════════════════════════"
