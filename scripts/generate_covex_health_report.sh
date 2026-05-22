#!/usr/bin/env bash
# ============================================================================
# Covex Health Diagnostic Report Generator
# Usage: bash generate_covex_health_report.sh
# Output: ~/Desktop/Covex_Health_Report.md
# ============================================================================
set -euo pipefail

REPORT="$HOME/Desktop/Covex_Health_Report.md"
COVEX_DIR="$HOME/Covex27"
KASPAD_BIN="$HOME/.cargo/bin/kaspad"
KASPA_DATA="$HOME/kaspa-data"
BACKEND_PORT=3001
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

check_pass() { echo "| $1 | PASS | $2 |"; }
check_fail() { echo "| $1 | FAIL | $2 |"; }
check_warn() { echo "| $1 | WARN | $2 |"; }

# ---- COLLECT DATA ----
KASPAD_PID=$(pgrep -f "kaspad" 2>/dev/null || echo "")
KASPAD_RUNNING=false; [ -n "$KASPAD_PID" ] && KASPAD_RUNNING=true

KASPAD_LOG=$(find "$KASPA_DATA" -name "rusty-kaspa.log" -type f 2>/dev/null | head -1 || echo "")
SYNC_STATUS="unknown"; SYNC_DETAIL=""
if [ -n "$KASPAD_LOG" ] && [ -r "$KASPAD_LOG" ]; then
    L50=$(tail -50 "$KASPAD_LOG" 2>/dev/null || echo "")
    if echo "$L50" | grep -qi "synced"; then SYNC_STATUS="synced"
    elif echo "$L50" | grep -qi "syncing\|ibd\|headers"; then SYNC_STATUS="syncing"; fi
    SYNC_DETAIL=$(echo "$L50" | grep -oP '(DAA|daa|blocks?|height)[=: ]*\d+' | tail -1 || echo "")
fi

NGINX_RUNNING=false; systemctl is-active --quiet nginx 2>/dev/null && NGINX_RUNNING=true
NGINX_CONFIG_OK=false; nginx -t 2>&1 | grep -q "syntax is ok" && NGINX_CONFIG_OK=true
COVEX_NGINX_ENABLED=false
[ -f "/etc/nginx/sites-enabled/covex" ] || [ -f "/etc/nginx/conf.d/covex.conf" ] && COVEX_NGINX_ENABLED=true

BACKEND_HEALTHY=false
curl -sf --max-time 5 "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1 && BACKEND_HEALTHY=true
BACKEND_RESPONSE=$(curl -sf --max-time 5 "http://127.0.0.1:$BACKEND_PORT/api/status" 2>/dev/null || echo '{"connected":false,"network":"unknown"}')
BACKEND_NETWORK=$(echo "$BACKEND_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('network','unknown'))" 2>/dev/null || echo "unknown")

PM2_COVEX=false; command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "covex" && PM2_COVEX=true

TESTNET_FILES=$(grep -rl "testnet-12\|TN-12\|TN12" "$COVEX_DIR" --include="*.rs" --include="*.jsx" --include="*.js" --include="*.yml" --include="*.service" --include=".env" --include="*.md" 2>/dev/null | grep -v "node_modules\|dist\|target\|scripts" || echo "")
TESTNET_COUNT=$(echo "$TESTNET_FILES" | grep -c "." 2>/dev/null || echo "0")

DIST_EXISTS=false; [ -d "$COVEX_DIR/frontend/dist" ] && [ -f "$COVEX_DIR/frontend/dist/index.html" ] && DIST_EXISTS=true
BINARY_EXISTS=false; [ -f "$COVEX_DIR/backend/target/release/covex27-backend" ] && BINARY_EXISTS=true
PORT_3001_USED=$(ss -tlnp 2>/dev/null | grep -c ":3001 " || echo "0")
PORT_80_USED=$(ss -tlnp 2>/dev/null | grep -c ":80 " || echo "0")

# ---- BUILD REPORT ----
mkdir -p "$(dirname "$REPORT")"
{
echo "# Covex Health Diagnostic Report"
echo ""
echo "**Generated:** $TIMESTAMP"
echo "**System:** WSL (Windows Subsystem for Linux)"
echo "**Project:** /home/kasparov/Covex27"
echo "**Network:** testnet-12"
echo ""
echo "---"
echo ""
echo "## What Works"
echo ""
echo "| Component | Status | Detail |"
echo "|-----------|--------|--------|"

$KASPAD_RUNNING && check_pass "kaspad Process" "Running (PID $KASPAD_PID)" || check_fail "kaspad Process" "Not running"
case "$SYNC_STATUS" in
    synced) check_pass "Node Sync" "Fully synced $SYNC_DETAIL" ;;
    syncing) check_warn "Node Sync" "Syncing $SYNC_DETAIL" ;;
    *) check_warn "Node Sync" "Status unknown" ;;
esac
$NGINX_RUNNING && check_pass "nginx Service" "Running" || check_fail "nginx Service" "Not running"
$NGINX_CONFIG_OK && check_pass "nginx Config" "Syntax valid" || check_fail "nginx Config" "Config error"
$COVEX_NGINX_ENABLED && check_pass "Covex Site" "Enabled in nginx" || check_fail "Covex Site" "Not found"
$BACKEND_HEALTHY && check_pass "Backend API" "Responding on :$BACKEND_PORT" || check_fail "Backend API" "Not responding"
$PM2_COVEX && check_pass "PM2 Process" "Covex managed by PM2" || check_warn "PM2 Process" "Not in PM2"
$DIST_EXISTS && check_pass "Frontend Build" "dist/ found" || check_fail "Frontend Build" "Missing - run npm run build"
$BINARY_EXISTS && check_pass "Backend Binary" "Compiled" || check_fail "Backend Binary" "Not built"

echo ""
echo "---"
echo ""
echo "## What Doesn't Work"
echo ""
echo "| Issue | Severity | Detail |"
echo "|-------|----------|--------|"

$KASPAD_RUNNING || echo "| kaspad not running | HIGH | Start with kaspad --utxoindex --testnet --pruning=1000000 |"
[ "$SYNC_STATUS" = "syncing" ] && echo "| Node syncing | MEDIUM | Wait for IBD to complete |"
$COVEX_NGINX_ENABLED || echo "| Covex nginx site missing | HIGH | ln -s deploy/nginx-covex.conf to sites-enabled |"
$BACKEND_HEALTHY || echo "| Backend API unreachable | HIGH | Start covex27-backend on port $BACKEND_PORT |"
[ "$PORT_3001_USED" = "0" ] && echo "| Port 3001 not in use | HIGH | Backend may not be running |"
[ "$PORT_80_USED" = "0" ] && echo "| Port 80 not in use | MEDIUM | nginx not listening |"
[ "$TESTNET_COUNT" -gt 0 ] 2>/dev/null && echo "| Stale testnet-12 refs | LOW | $TESTNET_COUNT files with old refs |"

echo ""
echo "---"
echo ""
echo "## Recommended Improvements"
echo ""
echo "### Immediate Actions"
echo ""
echo "1. Enable Covex nginx site:"
echo '```bash'
echo "sudo ln -s $COVEX_DIR/deploy/nginx-covex.conf /etc/nginx/sites-enabled/covex"
echo "sudo nginx -s reload"
echo '```'
echo ""
echo "2. Build and deploy:"
echo '```bash'
echo "cd $COVEX_DIR"
echo "cd backend && cargo build --release && cd .."
echo "cd frontend && npm run build && cd .."
echo '```'
echo ""
echo "3. Start kaspad testnet node:"
echo '```bash'
echo "kaspad --utxoindex --testnet --pruning=1000000 --appdir=$KASPA_DATA"
echo '```'
echo ""
echo "4. Start Covex backend:"
echo '```bash'
echo "cd $COVEX_DIR"
echo "KASPA_NETWORK=testnet-12 KASPA_WRPC_URL=ws://127.0.0.1:17217 ./backend/target/release/covex27-backend"
echo '```'
echo ""
echo "### Network Status"
echo "- Configured network: testnet-12"
echo "- Backend reporting: $BACKEND_NETWORK"

if [ -n "$TESTNET_FILES" ] && [ "$TESTNET_COUNT" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "### Stale testnet-12/TN12 References"
    echo '```'
    echo "$TESTNET_FILES"
    echo '```'
fi

if $BACKEND_HEALTHY; then
    echo ""
    echo "### Backend Status Response"
    echo '```json'
    echo "$BACKEND_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BACKEND_RESPONSE"
    echo '```'
fi

echo ""
echo "---"
echo "*Report generated at $TIMESTAMP*"
} > "$REPORT"

echo "Report written: $REPORT"
wc -l < "$REPORT"
