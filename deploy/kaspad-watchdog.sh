#!/usr/bin/env bash
# kaspad-watchdog.sh (GATE 1 / 1.3) - recover a server-resident kaspad node whose tip is
# FROZEN. It triggers ONLY on the watchdog's `node_tip_frozen` classification, which means
# the crawler is actively reporting (fresh last_ok) yet the node's tip has not advanced for
# >10 min - a genuine freeze on a 10 BPS chain, not low activity and not a stuck crawler.
#
# Alert-first, cooldown-bounded, escalating: it restarts the node at most once per COOLDOWN
# and at most MAX_RESTARTS times in a row; after that it stops restarting and PAGES for a
# manual resync (the deterministic TN10/TN12 freezes were DB corruption / a protocol fork
# that needed a datadir wipe - a restart loop would only mask that). A recovered tip resets
# the counter. Restart is on by default; set KASPAD_WATCHDOG_NO_RESTART=1 for alert-only.
#
# Mainnet runs on-box as covex-kaspad-mainnet.service (the old "off-box WSL" note is stale).
# TN10 has no server-resident kaspad unit (public-resolver failover only), so it is not watched
# here; the two units that actually exist and matter are TN12 and mainnet.
set -uo pipefail

STATUS_URL="${COVEX_STATUS_URL:-http://127.0.0.1:3006/status}"
STATE_DIR=/var/lib/covex-monitor
ALERT_ENV=/etc/covex/alert.env
COOLDOWN="${KASPAD_WATCHDOG_COOLDOWN:-900}"     # min seconds between restarts of one node
MAX_RESTARTS="${KASPAD_WATCHDOG_MAX_RESTARTS:-3}"
mkdir -p "$STATE_DIR"
# shellcheck disable=SC1090
[ -f "$ALERT_ENV" ] && . "$ALERT_ENV"

ts() { date -u +%FT%TZ; }
alert() {
  echo "$(ts) $1" >> "$STATE_DIR/kaspad-watchdog.log"
  if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -fsS --max-time 10 -X POST "$WEBHOOK_URL" -H 'Content-Type: application/json' \
      -d "{\"text\":\"$1\"}" >/dev/null 2>&1 || true
  fi
}

json=$(curl -fsS --max-time 12 "$STATUS_URL" 2>/dev/null) || {
  echo "$(ts) status fetch failed ($STATUS_URL)" >> "$STATE_DIR/kaspad-watchdog.log"
  exit 0
}

# network -> systemd unit (server-resident kaspad services only). The live units are
# kaspad-tn12.service and covex-kaspad-mainnet.service; the old [testnet-12]=kaspad /
# [testnet-10]=kaspad-tn10 map named units that do not exist, so the watchdog checked the
# wrong service (false "not active" on TN12) and never watched mainnet at all (OPS-03).
declare -A UNIT=( [testnet-12]=kaspad-tn12 [mainnet]=covex-kaspad-mainnet )
now=$(date +%s)

for net in testnet-12 mainnet; do
  reason=$(printf '%s' "$json" | python3 -c "import sys,json;print(json.load(sys.stdin).get('node_sync',{}).get('$net',{}).get('stall_reason',''))" 2>/dev/null || echo "")
  unit="${UNIT[$net]}"
  state="$STATE_DIR/kaspad-$net.state"
  count=0; last=0
  if [ -f "$state" ]; then read -r count last < "$state" 2>/dev/null || { count=0; last=0; }; fi

  if [ "$reason" = "node_tip_frozen" ]; then
    if ! systemctl is-active --quiet "$unit"; then
      alert "kaspad watchdog: $net node ($unit) is NOT active; not auto-starting (investigate)"
      continue
    fi
    if [ "${KASPAD_WATCHDOG_NO_RESTART:-0}" = "1" ]; then
      alert "kaspad watchdog: $net tip FROZEN (alert-only mode; restart disabled)"
      continue
    fi
    if [ "$count" -ge "$MAX_RESTARTS" ]; then
      if [ "$count" -eq "$MAX_RESTARTS" ]; then
        alert "kaspad watchdog: $net STILL tip-frozen after $MAX_RESTARTS restarts; restarts are not recovering it - MANUAL RESYNC likely needed (datadir wipe). Halting auto-restart."
        echo "$((count + 1)) $now" > "$state"
      fi
      continue
    fi
    if [ $((now - last)) -lt "$COOLDOWN" ]; then
      continue # within cooldown; give the last restart time to take effect
    fi
    alert "kaspad watchdog: $net tip frozen >10min; restarting $unit (attempt $((count + 1))/$MAX_RESTARTS)"
    systemctl restart "$unit" || alert "kaspad watchdog: restart of $unit FAILED"
    echo "$((count + 1)) $now" > "$state"
  else
    # Healthy (or not classified frozen): clear any restart state, page recovery once.
    if [ -f "$state" ]; then
      [ "$count" != "0" ] && alert "kaspad watchdog: $net tip recovered (clearing restart counter)"
      rm -f "$state"
    fi
  fi
done
