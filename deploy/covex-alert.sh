#!/bin/bash
#
# OnFailure= handler for the Covex backup units: records which unit failed and
# pings the operator out-of-band if a webhook is configured.
#
# To enable the ping, create /etc/covex/alert.env containing:
#   WEBHOOK_URL=https://ntfy.sh/<topic>     (or any URL accepting POST text)
#
# This script must never exit nonzero: an alert failure must not cascade.

set -u

UNIT="${1:-unknown-unit}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/covex}"

line="ALERT $(date -u +%FT%TZ) systemd unit $UNIT failed on $(hostname)"
echo "$line"
mkdir -p "$BACKUP_ROOT" 2>/dev/null || true
echo "$line" >> "$BACKUP_ROOT/alerts.log" 2>/dev/null || true

if [ -f /etc/covex/alert.env ]; then
    # shellcheck disable=SC1091
    . /etc/covex/alert.env
fi
if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -fsS -m 10 -d "$line" "$WEBHOOK_URL" >/dev/null 2>&1 || echo "webhook ping failed"
else
    echo "no WEBHOOK_URL configured (/etc/covex/alert.env) - alert recorded in journal and alerts.log only"
fi

exit 0
