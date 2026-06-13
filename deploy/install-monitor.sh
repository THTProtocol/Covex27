#!/usr/bin/env bash
# Idempotent installer for the Covex indexer/health monitor timer (GATE 1 / 1.2).
# Re-run after a deploy that touches the monitor files. Set WEBHOOK_URL in
# /etc/covex/alert.env to page out-of-band; without it the monitor logs only.
set -euo pipefail
REPO="${COVEX_REPO:-/mnt/HC_Volume_105579109/Covex27}"
install -d /var/lib/covex-monitor /etc/covex
chmod +x "$REPO/deploy/monitor-and-alert.sh"
cp -f "$REPO/deploy/covex-monitor.service" /etc/systemd/system/covex-monitor.service
cp -f "$REPO/deploy/covex-monitor.timer" /etc/systemd/system/covex-monitor.timer
systemctl daemon-reload
systemctl enable --now covex-monitor.timer
echo "covex-monitor.timer installed and active:"
systemctl list-timers covex-monitor.timer --no-pager | head -3
