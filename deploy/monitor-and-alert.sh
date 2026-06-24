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

BASE_URL="${BASE_URL:-http://127.0.0.1:3006}"
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

# 2. Quick oracle responsiveness check (very lightweight). Internal route has no /api
# prefix (nginx adds that for the public URL).
if ! curl -sf --max-time 12 -X POST "$BASE_URL/oracle/verify-and-sign" \
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

# 5. Per-network indexer / node STALL check (GATE 1 / 1.2). Reads the watchdog 'stalled'
# flag from /api/status (node_status.rs) so prod can never read healthy while frozen.
# State-deduped: a persistent stall pages ONCE, and recovery pages once. The heartbeat
# line records every run so silence (cron/timer dead) is itself observable.
STATE_FILE="/var/lib/covex-monitor/indexer-state.txt"
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true
STATUS_JSON=$(curl -sf --max-time 12 "$BASE_URL/status" 2>/dev/null || echo "")
if [ -n "$STATUS_JSON" ]; then
    STATE=$(printf '%s' "$STATUS_JSON" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print('PARSE_ERROR'); sys.exit()
ns = d.get('node_sync', {}); rows = []
for net in sorted(ns):
    n = ns[net]
    bad = bool(n.get('stalled')) or not n.get('connected')
    reason = n.get('stall_reason') or ('' if n.get('connected') else 'disconnected')
    rows.append('%s=%s%s' % (net, 'STALLED' if bad else 'ok', ((':' + reason) if (bad and reason) else '')))
print('|'.join(rows) if rows else 'NO_NETWORKS')
" 2>/dev/null || echo "PARSE_ERROR")
    echo "$(date): indexer $STATE" >> "$LOG_FILE"
    PREV=""; [ -f "$STATE_FILE" ] && PREV=$(cat "$STATE_FILE" 2>/dev/null || echo "")
    if [ "$STATE" != "$PREV" ]; then
        printf '%s' "$STATE" > "$STATE_FILE" 2>/dev/null || true
        case "$STATE" in
            *STALLED*|*disconnected*|PARSE_ERROR) alert "Indexer status change: $STATE" ;;
            *) alert "Indexer recovered: $STATE" ;;
        esac
    fi
fi

# 6. Prod-vs-master DRIFT check (WARN tier). The live backend reports git_commit on
# /healthz (nginx -> backend /health). NOTE: get_git_commit() in main.rs prefers the
# GIT_COMMIT env (not set in the current systemd unit) and otherwise falls back to
# `git rev-parse HEAD` on the server repo, which the deploy scripts reset to
# origin/master BEFORE building. So git_commit tracks the last commit a deploy synced
# to the box, not necessarily the running binary. This reliably catches "master moved
# but no deploy ran on the server"; it does NOT by itself prove the binary was rebuilt
# (set DEPLOYED_SHA after a successful restart for a binary-level guarantee).
# This compares git_commit to the EXPECTED deployed SHA so that drift trap pages
# instead of going unnoticed. See docs/MONITORING.md.
#
# Expected SHA precedence:
#   1. $DEPLOYED_SHA env (a deploy can export the SHA it shipped), else
#   2. /var/lib/covex-monitor/deployed-sha.txt (a deploy can write the SHA it shipped), else
#   3. origin/master HEAD from the server repo (the commit a deploy WOULD ship).
# State-deduped like the indexer check: a persistent drift pages once, a resync pages once.
# WARN tier (not page): drift is "deploy did not take", not an outage. If WEBHOOK_URL is
# unset this only logs, same as every other check.
HEALTHZ_URL="${HEALTHZ_URL:-https://hightable.pro/healthz}"
DRIFT_STATE_FILE="/var/lib/covex-monitor/drift-state.txt"
mkdir -p "$(dirname "$DRIFT_STATE_FILE")" 2>/dev/null || true
REPO_DIR="${COVEX_REPO_DIR:-/mnt/HC_Volume_105579109/Covex27}"

LIVE_SHA=$(curl -sf --max-time 12 "$HEALTHZ_URL" 2>/dev/null \
    | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('git_commit',''))
except Exception: print('')" 2>/dev/null || echo "")

EXPECTED_SHA="${DEPLOYED_SHA:-}"
if [ -z "$EXPECTED_SHA" ] && [ -f /var/lib/covex-monitor/deployed-sha.txt ]; then
    EXPECTED_SHA=$(cat /var/lib/covex-monitor/deployed-sha.txt 2>/dev/null || echo "")
fi
if [ -z "$EXPECTED_SHA" ] && [ -d "$REPO_DIR/.git" ]; then
    EXPECTED_SHA=$(git -C "$REPO_DIR" rev-parse origin/master 2>/dev/null || echo "")
fi

if [ -z "$LIVE_SHA" ]; then
    DRIFT="UNKNOWN:healthz_unreachable_or_no_git_commit"
elif [ -z "$EXPECTED_SHA" ]; then
    DRIFT="UNKNOWN:no_expected_sha"
else
    # git_commit is a short SHA; expected may be full. Match by prefix either way.
    case "$EXPECTED_SHA" in
        "$LIVE_SHA"*) DRIFT="ok:$LIVE_SHA" ;;
        *) case "$LIVE_SHA" in
               "$EXPECTED_SHA"*) DRIFT="ok:$LIVE_SHA" ;;
               *) DRIFT="DRIFT:live=$LIVE_SHA,expected=${EXPECTED_SHA:0:8}" ;;
           esac ;;
    esac
fi

echo "$(date): drift $DRIFT" >> "$LOG_FILE"
PREV_DRIFT=""; [ -f "$DRIFT_STATE_FILE" ] && PREV_DRIFT=$(cat "$DRIFT_STATE_FILE" 2>/dev/null || echo "")
if [ "$DRIFT" != "$PREV_DRIFT" ]; then
    printf '%s' "$DRIFT" > "$DRIFT_STATE_FILE" 2>/dev/null || true
    case "$DRIFT" in
        DRIFT:*)   alert "[WARN] prod behind master: $DRIFT (deploy did not take, or master moved unshipped)" ;;
        UNKNOWN:*) alert "[WARN] drift check inconclusive: $DRIFT" ;;
        *)         alert "prod-vs-master drift cleared: $DRIFT" ;;
    esac
fi

echo "$(date): All checks passed" >> "$LOG_FILE"
