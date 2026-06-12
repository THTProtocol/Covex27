#!/bin/bash
#
# Phase 5: Production Validation Script
# Run this on the production server (or against a live instance) to verify everything is healthy.
#
# Usage:
#   ./deploy/validate-production.sh
#   or
#   curl ... | bash   (if hosted somewhere)

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           COVEX PHASE 5 — PRODUCTION VALIDATION              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo

BASE_URL="${BASE_URL:-http://127.0.0.1:3006}"
FRONTEND_URL="${FRONTEND_URL:-https://hightable.pro}"

failures=0

check() {
    local name="$1"
    local cmd="$2"
    echo -n "  Checking $name ... "
    if eval "$cmd" >/dev/null 2>&1; then
        echo "✓"
    else
        echo "✗ FAILED"
        ((failures++))
    fi
}

echo "=== 1. Backend Health ==="
check "Backend health endpoint" "curl -sf --max-time 5 $BASE_URL/health"

echo
echo "=== 2. Oracle Service ==="
check "Oracle endpoint responds" "curl -sf --max-time 10 -X POST $BASE_URL/oracle/verify-and-sign -H 'Content-Type: application/json' -d '{\"covenant_id\":\"validation\",\"circuit_type\":\"merkle_membership\",\"proof\":{},\"public_inputs\":[]}' | grep -q 'success'"

echo
echo "=== 3. Configuration ==="
check "KASPA_NETWORK is set" "curl -sf $BASE_URL/ | grep -q 'testnet-12\\|mainnet'"

echo
echo "=== 4. Frontend ==="
check "Frontend is reachable" "curl -sf --max-time 10 $FRONTEND_URL | grep -q 'Covex'"

echo
echo "=== 5. Critical Files (if running on server) ==="
if [ -f /root/Covex27/deploy/switch-to-mainnet.sh ]; then
    check "switch-to-mainnet.sh exists and is executable" "[ -x /root/Covex27/deploy/switch-to-mainnet.sh ]"
    check "start-covex-backend.sh exists and is executable" "[ -x /root/Covex27/deploy/start-covex-backend.sh ]"
else
    echo "  (Skipping file checks - not running on production server)"
fi

echo
if [ $failures -eq 0 ]; then
    echo "✅ All checks passed. System looks healthy for Phase 5 / Launch."
    exit 0
else
    echo "❌ $failures check(s) failed. Review output above."
    exit 1
fi
