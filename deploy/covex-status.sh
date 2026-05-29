#!/bin/bash
#
# Phase 5: Quick Covex System Status
# One-command overview of the running service.

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3005}"

echo "=== Covex System Status ==="
echo "Time: $(date)"
echo

echo "Backend Health:"
curl -s --max-time 5 "$BASE_URL/health" | jq . 2>/dev/null || echo "  (health endpoint not responding or jq not available)"

echo
echo "Recent Backend Logs (last 15 lines):"
if [ -f /tmp/covex27.log ]; then
    tail -15 /tmp/covex27.log
else
    echo "  Log file /tmp/covex27.log not found on this machine."
fi

echo
echo "Process:"
pgrep -a covex27-backend || echo "  No covex27-backend process found."

echo
echo "Oracle Key Mode:"
if [ -n "${COVEX_ORACLE_KEY:-}" ]; then
    echo "  Using custom COVEX_ORACLE_KEY (mainnet mode)"
else
    echo "  Using default testnet dev key"
fi
