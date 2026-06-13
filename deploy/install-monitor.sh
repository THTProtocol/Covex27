#!/usr/bin/env bash
# Idempotent installer for the Covex indexer/health monitor timer (GATE 1 / 1.2).
# Re-run after a deploy that touches the monitor files. Set WEBHOOK_URL in
# /etc/covex/alert.env to page out-of-band; without it the monitor logs only.
set -euo pipefail
REPO="${COVEX_REPO:-/mnt/HC_Volume_105579109/Covex27}"
install -d /var/lib/covex-monitor /etc/covex
chmod +x "$REPO/deploy/monitor-and-alert.sh" "$REPO/deploy/kaspad-watchdog.sh"
cp -f "$REPO/deploy/covex-monitor.service" /etc/systemd/system/covex-monitor.service
cp -f "$REPO/deploy/covex-monitor.timer" /etc/systemd/system/covex-monitor.timer
cp -f "$REPO/deploy/covex-kaspad-watchdog.service" /etc/systemd/system/covex-kaspad-watchdog.service
cp -f "$REPO/deploy/covex-kaspad-watchdog.timer" /etc/systemd/system/covex-kaspad-watchdog.timer
systemctl daemon-reload
systemctl enable --now covex-monitor.timer covex-kaspad-watchdog.timer
echo "monitor + kaspad-watchdog timers installed and active:"
systemctl list-timers covex-monitor.timer covex-kaspad-watchdog.timer --no-pager | head -4
