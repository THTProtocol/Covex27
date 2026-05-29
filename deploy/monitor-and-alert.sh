#!/bin/bash
#
# Phase 6: Basic Monitoring + Alerting Script for Covex
#
# Run this via cron every 5-10 minutes.
#
# It checks:
# - Backend health
# - Oracle responsiveness (cheap check)
# - Disk space
# - Process running
#
# On failure, it can call a webhook (Slack, Discord, etc.)

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3005}"
WEBHOOK_URL="${WEBHOOK_URL:-}"   # Set this to your Slack/Discord webhook for alerts
LOG_FILE="/tmp/covex-monitor.log"

alert() {
    local message="$1"
    echo "$(date): $message" >> "$LOG_FILE"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -s -X POST "$WEBHOOK_URL" \
             -H "Content-Type: application/json" \
             -d "{\"text\":\"🚨 Covex Alert: $message\"}" >/dev/null 2>&1 || true
    fi
}

# 1. Check backend health
if ! curl -sf --max-time 8 "$BASE_URL/health" > /dev/null; then
    alert "Backend health check failed"
    exit 1
fi

# 2. Quick oracle responsiveness check (very lightweight)
if ! curl -sf --max-time 12 -X POST "$BASE_URL/api/oracle/verify-and-sign" \
     -H "Content-Type: application/json" \
     -d '{"covenant_id":"monitor","circuit_type":"merkle_membership","proof":{},"public_inputs":[]}' | grep -q '"success"' ; then
    alert "Oracle endpoint is slow or failing"
fi

# 3. Disk space check (warn if >85% full)
USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$USAGE" -gt 85 ]; then
    alert "Disk usage high: ${USAGE}%"
fi

# 4. Process check
if ! pgrep -f covex27-backend > /dev/null; then
    alert "covex27-backend process not running!"
fi

echo "$(date): All checks passed" >> "$LOG_FILE"
