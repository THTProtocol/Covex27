#!/bin/sh
#
# covex-watch.sh - Covex production on-box monitor (POSIX sh, idempotent).
#
# Runs the five health checks below, aggregates RED / WARN conditions, and
# alerts via a webhook ONLY on a state change (green<->red) plus one daily
# heartbeat, so silence is meaningful. Designed to be driven by a systemd
# timer every 5 minutes (covex-watch.timer).
#
# Checks:
#   1. Backend liveness    - GET http://127.0.0.1:3006/health is 200 + valid JSON.
#   2. Node tip freshness  - /status node_sync.<net>.tip_daa must ADVANCE across
#                            the staleness window; also surfaces the backend's own
#                            stalled / stall_reason watchdog (node_tip_frozen).
#   3. Disk                - df on / and /mnt/covex-data; RED >=85%, WARN >=80%.
#   4. TLS cert expiry     - each host in COVEX_TLS_HOSTS (default hightable.pro:443); RED <14d.
#   5. systemd is-active   - covex-backend, kaspad-tn12, nginx (plus any units in COVEX_UNITS).
#
# Alerting is FAIL-SAFE and ARM-READY: with no webhook configured the box is
# considered healthy and the script logs what it WOULD have sent, then exits 0.
# The owner arms it by writing COVEX_ALERT_WEBHOOK into /opt/covex-monitor/alert.env.
#
# This script must never crash the timer: it traps and tolerates check failures
# (a failed check becomes a RED line, not a script abort). It does NOT restart
# any service - it only observes and alerts. (Node auto-restart on a frozen tip
# is handled separately by covex-kaspad-watchdog; this monitor pages a human.)
#
# Source of truth for the tip signal: backend/src/node_status.rs (the /status
# node_sync snapshot). See docs/MONITORING.md.

# Intentionally NOT 'set -e': a single failing check must not abort the run.
set -u

# ---- Configuration -----------------------------------------------------------
STATE_DIR="${COVEX_MONITOR_DIR:-/opt/covex-monitor}"
STATE_FILE="$STATE_DIR/state.json"
ALERT_ENV="$STATE_DIR/alert.env"

HEALTH_URL="${COVEX_HEALTH_URL:-http://127.0.0.1:3006/health}"
STATUS_URL="${COVEX_STATUS_URL:-http://127.0.0.1:3006/status}"

# The live covenant network whose tip we hold against the staleness window.
TIP_NETWORK="${COVEX_TIP_NETWORK:-testnet-12}"

# Disk thresholds (percent used).
DISK_RED="${COVEX_DISK_RED:-85}"
DISK_WARN="${COVEX_DISK_WARN:-80}"

# TLS: RED when fewer than this many days remain.
TLS_RED_DAYS="${COVEX_TLS_RED_DAYS:-14}"

# Hosts to TLS-probe (space separated).
TLS_HOSTS="${COVEX_TLS_HOSTS:-hightable.pro}"

# systemd units to require active (space separated).
UNITS="${COVEX_UNITS:-covex-backend.service kaspad-tn12.service nginx.service}"

# Disk mount points to check (space separated).
DISK_MOUNTS="${COVEX_DISK_MOUNTS:-/ /mnt/covex-data}"

# Independent tip-staleness window in seconds (default 15 min). This is the
# monitor's OWN cross-run check: it persists tip_daa + the time we first saw it,
# and goes RED if the tip has not advanced within the window. It is independent
# of the backend's in-process 600s watchdog (which resets on a backend restart),
# so it still catches a freeze that spans a restart.
TIP_STALE_SECONDS_DEFAULT=900

# Load arm config (webhook + optional overrides). chmod 600 expected.
if [ -f "$ALERT_ENV" ]; then
    # shellcheck disable=SC1090
    . "$ALERT_ENV"
fi
TIP_STALE_SECONDS="${COVEX_TIP_STALE_SECONDS:-$TIP_STALE_SECONDS_DEFAULT}"
WEBHOOK="${COVEX_ALERT_WEBHOOK:-}"

HOSTN="$(hostname 2>/dev/null || echo unknown-host)"
NOW="$(date -u +%s)"
TS="$(date -u +%FT%TZ)"

mkdir -p "$STATE_DIR" 2>/dev/null || true

# ---- Helpers -----------------------------------------------------------------
# Read a top-level string field from a flat JSON blob without jq (tolerant).
json_str() {
    # $1 = json, $2 = key
    printf '%s' "$1" | tr ',' '\n' | grep "\"$2\"" | head -1 \
        | sed 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

RED_LINES=""
WARN_LINES=""
add_red()  { RED_LINES="$RED_LINES- RED  $1
"; }
add_warn() { WARN_LINES="$WARN_LINES- WARN $1
"; }

# ---- Check 1: backend liveness ----------------------------------------------
HEALTH_JSON="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "")"
GIT_COMMIT="unknown"
if [ -z "$HEALTH_JSON" ]; then
    add_red "backend health: $HEALTH_URL not 200 / unreachable"
else
    # Validate it is JSON with the expected app/status shape.
    APP="$(json_str "$HEALTH_JSON" app)"
    HSTATUS="$(json_str "$HEALTH_JSON" status)"
    GC="$(json_str "$HEALTH_JSON" git_commit)"
    [ -n "$GC" ] && GIT_COMMIT="$GC"
    if [ -z "$APP" ] || [ -z "$HSTATUS" ]; then
        add_red "backend health: 200 but unexpected/invalid JSON (no app/status field)"
    elif [ "$HSTATUS" != "ok" ]; then
        add_red "backend health: status=$HSTATUS (expected ok)"
    fi
fi

# ---- Check 2: node tip freshness --------------------------------------------
# Pull /status and extract the tip_daa + stalled/stall_reason for TIP_NETWORK.
STATUS_JSON="$(curl -fsS --max-time 12 "$STATUS_URL" 2>/dev/null || echo "")"
TIP_DAA=""
NODE_STALLED=""
STALL_REASON=""
NODE_CONNECTED=""
if [ -z "$STATUS_JSON" ]; then
    add_red "node tip: $STATUS_URL unreachable (cannot read node_sync)"
else
    # Isolate the TIP_NETWORK object from node_sync. node_sync is a nested object;
    # we grab the slice from "<net>": up to the next stall_reason value (each net
    # object ends with last_error). Python is present on the box (Ubuntu 24.04) and
    # is the robust parser; fall back to a tolerant sed slice if absent.
    if command -v python3 >/dev/null 2>&1; then
        EXTRACT="$(printf '%s' "$STATUS_JSON" | TIP_NET="$TIP_NETWORK" python3 -c '
import sys, json, os
net = os.environ.get("TIP_NET", "testnet-12")
try:
    d = json.load(sys.stdin)
except Exception:
    print("PARSE_ERROR"); sys.exit(0)
ns = d.get("node_sync", {})
n = ns.get(net)
if n is None:
    print("NO_NETWORK"); sys.exit(0)
print("OK\t%s\t%s\t%s\t%s" % (
    n.get("tip_daa", ""),
    "1" if n.get("stalled") else "0",
    (n.get("stall_reason") or ""),
    "1" if n.get("connected") else "0",
))
' 2>/dev/null || echo "PARSE_ERROR")"
        case "$EXTRACT" in
            OK*)
                TIP_DAA="$(printf '%s' "$EXTRACT" | cut -f2)"
                NODE_STALLED="$(printf '%s' "$EXTRACT" | cut -f3)"
                STALL_REASON="$(printf '%s' "$EXTRACT" | cut -f4)"
                NODE_CONNECTED="$(printf '%s' "$EXTRACT" | cut -f5)"
                ;;
            NO_NETWORK)
                add_red "node tip: network '$TIP_NETWORK' absent from node_sync"
                ;;
            *)
                add_red "node tip: could not parse /status node_sync JSON"
                ;;
        esac
    else
        # Fallback parser (no python): slice the net object, grep tip_daa.
        SLICE="$(printf '%s' "$STATUS_JSON" | tr ',' '\n' | sed -n "/\"$TIP_NETWORK\"/,/last_error/p")"
        TIP_DAA="$(printf '%s' "$SLICE" | grep '"tip_daa"' | head -1 | sed 's/.*"tip_daa"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')"
        STALL_REASON="$(printf '%s' "$SLICE" | grep '"stall_reason"' | head -1 | sed 's/.*"stall_reason"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
        if printf '%s' "$SLICE" | grep '"stalled"' | head -1 | grep -q 'true'; then NODE_STALLED=1; else NODE_STALLED=0; fi
        if printf '%s' "$SLICE" | grep '"connected"' | head -1 | grep -q 'true'; then NODE_CONNECTED=1; else NODE_CONNECTED=0; fi
    fi

    # Surface the backend's own server-side watchdog verdict (authoritative).
    if [ "$NODE_STALLED" = "1" ]; then
        add_red "node tip: backend reports stalled ($TIP_NETWORK, reason=${STALL_REASON:-unspecified})"
    fi
    if [ "$NODE_CONNECTED" = "0" ]; then
        add_red "node tip: $TIP_NETWORK not connected to its node"
    fi
fi

# Independent cross-run tip-advance check, persisted in the state file.
# We read the prior persisted tip + its first-seen time, compare to the current
# tip, and RED if the tip has not advanced within TIP_STALE_SECONDS.
PREV_TIP=""
PREV_TIP_SEEN=""
PREV_STATE=""
PREV_LAST_ALERT_DAY=""
if [ -f "$STATE_FILE" ]; then
    PREV_TIP="$(json_str "$(cat "$STATE_FILE")" tip_daa)"
    PREV_TIP_SEEN="$(json_str "$(cat "$STATE_FILE")" tip_seen_at)"
    PREV_STATE="$(json_str "$(cat "$STATE_FILE")" overall)"
    PREV_LAST_ALERT_DAY="$(json_str "$(cat "$STATE_FILE")" last_heartbeat_day)"
fi

# Compute the tip's "first seen at" time and whether it is stale.
TIP_SEEN_AT="$NOW"
if [ -n "$TIP_DAA" ]; then
    if [ -n "$PREV_TIP" ] && [ "$PREV_TIP" = "$TIP_DAA" ]; then
        # Tip unchanged since last run: keep the original first-seen timestamp.
        if [ -n "$PREV_TIP_SEEN" ]; then
            TIP_SEEN_AT="$PREV_TIP_SEEN"
        fi
        AGE=$((NOW - TIP_SEEN_AT))
        if [ "$AGE" -gt "$TIP_STALE_SECONDS" ]; then
            add_red "node tip: ${TIP_NETWORK} tip_daa=${TIP_DAA} has NOT advanced for ${AGE}s (window ${TIP_STALE_SECONDS}s) - node_tip_frozen"
        fi
    fi
    # If the tip changed (or first observation), TIP_SEEN_AT stays = NOW (advanced).
fi

# ---- Check 3: disk -----------------------------------------------------------
for MNT in $DISK_MOUNTS; do
    if [ -d "$MNT" ]; then
        PCT="$(df -P "$MNT" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
        if [ -n "$PCT" ]; then
            if [ "$PCT" -ge "$DISK_RED" ]; then
                add_red "disk: $MNT at ${PCT}% used (>= ${DISK_RED}%)"
            elif [ "$PCT" -ge "$DISK_WARN" ]; then
                add_warn "disk: $MNT at ${PCT}% used (>= ${DISK_WARN}%)"
            fi
        else
            add_warn "disk: could not read df for $MNT"
        fi
    fi
done

# ---- Check 4: TLS cert expiry ------------------------------------------------
for H in $TLS_HOSTS; do
    END="$(echo | openssl s_client -servername "$H" -connect "$H":443 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')"
    if [ -z "$END" ]; then
        add_warn "tls: could not read cert for $H:443"
    else
        END_EPOCH="$(date -u -d "$END" +%s 2>/dev/null || echo "")"
        if [ -z "$END_EPOCH" ]; then
            add_warn "tls: could not parse cert expiry for $H ($END)"
        else
            DAYS=$(( (END_EPOCH - NOW) / 86400 ))
            if [ "$DAYS" -lt "$TLS_RED_DAYS" ]; then
                add_red "tls: $H cert expires in ${DAYS}d (< ${TLS_RED_DAYS}d) on $END"
            fi
        fi
    fi
done

# ---- Check 5: systemd units --------------------------------------------------
for U in $UNITS; do
    if command -v systemctl >/dev/null 2>&1; then
        ST="$(systemctl is-active "$U" 2>/dev/null || echo "unknown")"
        if [ "$ST" != "active" ]; then
            add_red "systemd: $U is $ST (expected active)"
        fi
    fi
done

# ---- Aggregate ---------------------------------------------------------------
OVERALL="green"
if [ -n "$RED_LINES" ]; then
    OVERALL="red"
elif [ -n "$WARN_LINES" ]; then
    OVERALL="warn"
fi

SUMMARY="$(printf 'Covex monitor [%s] %s @ %s (git %s)\n%s%s' \
    "$OVERALL" "$HOSTN" "$TS" "$GIT_COMMIT" "$RED_LINES" "$WARN_LINES")"
[ -z "$RED_LINES$WARN_LINES" ] && SUMMARY="Covex monitor [green] $HOSTN @ $TS (git $GIT_COMMIT): all checks OK"

# ---- Decide whether to alert (state change + daily heartbeat) ----------------
# We alert when:
#   - overall transitions green<->(warn|red), in either direction (recovery line
#     when clearing back to green), OR
#   - it is a new UTC day and we have not yet emitted today's heartbeat (so a
#     silent box is a dead box, not a healthy one).
TODAY="$(date -u +%F)"
DO_ALERT=0
ALERT_KIND=""

# Treat warn and red both as "non-green" for transition purposes, but recovery
# only fires when going from non-green back to green.
norm() { case "$1" in red|warn) echo nongreen ;; *) echo green ;; esac; }
PREV_NORM="$(norm "${PREV_STATE:-green}")"
CUR_NORM="$(norm "$OVERALL")"

if [ "$PREV_NORM" != "$CUR_NORM" ]; then
    DO_ALERT=1
    if [ "$CUR_NORM" = "green" ]; then
        ALERT_KIND="recovery"
        SUMMARY="RECOVERED: $SUMMARY"
    else
        ALERT_KIND="alert"
    fi
elif [ "$OVERALL" = "green" ] && [ "${PREV_LAST_ALERT_DAY:-}" != "$TODAY" ]; then
    DO_ALERT=1
    ALERT_KIND="heartbeat"
fi

# Track the heartbeat day: advance it whenever we emit a green heartbeat, OR keep
# the prior value otherwise so a same-day red->green->red flap does not suppress
# the daily heartbeat indefinitely.
NEW_HEARTBEAT_DAY="${PREV_LAST_ALERT_DAY:-}"
if [ "$ALERT_KIND" = "heartbeat" ]; then
    NEW_HEARTBEAT_DAY="$TODAY"
fi

# ---- Persist state -----------------------------------------------------------
# Atomic write via temp + mv so a crashed run never leaves a half-written state.
TMP_STATE="$STATE_FILE.tmp.$$"
cat > "$TMP_STATE" 2>/dev/null <<EOF
{
  "overall": "$OVERALL",
  "tip_daa": "${TIP_DAA}",
  "tip_seen_at": "${TIP_SEEN_AT}",
  "last_run_at": "${NOW}",
  "last_run_ts": "${TS}",
  "last_heartbeat_day": "${NEW_HEARTBEAT_DAY}",
  "git_commit": "${GIT_COMMIT}"
}
EOF
mv -f "$TMP_STATE" "$STATE_FILE" 2>/dev/null || rm -f "$TMP_STATE" 2>/dev/null || true

# ---- Emit --------------------------------------------------------------------
echo "$TS covex-watch overall=$OVERALL tip_daa=${TIP_DAA:-NA} stall_reason=${STALL_REASON:-} alert=${ALERT_KIND:-none}"
if [ -n "$RED_LINES$WARN_LINES" ]; then
    printf '%s%s' "$RED_LINES" "$WARN_LINES"
fi

if [ "$DO_ALERT" -ne 1 ]; then
    # No state change and heartbeat already sent today: stay quiet.
    exit 0
fi

if [ -z "$WEBHOOK" ]; then
    # UNARMED: an unarmed box is healthy and ready for the owner to drop in a URL.
    echo "ALERT WEBHOOK UNARMED; would have sent ($ALERT_KIND):"
    printf '%s\n' "$SUMMARY"
    exit 0
fi

# ARMED: POST a JSON body carrying BOTH text (Slack) and content (Discord) keys.
# Build the JSON with python for correct escaping of the multi-line summary.
if command -v python3 >/dev/null 2>&1; then
    BODY="$(SUMMARY="$SUMMARY" python3 -c '
import json, os
s = os.environ.get("SUMMARY", "")
print(json.dumps({"text": s, "content": s}))
')"
else
    # Minimal fallback escaping (newlines -> \n, quotes -> escaped).
    ESC="$(printf '%s' "$SUMMARY" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk '{printf "%s\\n", $0}')"
    BODY="{\"text\":\"$ESC\",\"content\":\"$ESC\"}"
fi

if curl -fsS --max-time 12 -X POST -H 'Content-Type: application/json' \
        -d "$BODY" "$WEBHOOK" >/dev/null 2>&1; then
    echo "alert POSTed ($ALERT_KIND) to configured webhook"
else
    echo "WARN: alert webhook POST failed ($ALERT_KIND); condition still logged above"
fi

exit 0
