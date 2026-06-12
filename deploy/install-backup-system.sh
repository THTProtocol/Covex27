#!/bin/bash
#
# Installs (or updates) the Covex backup system on the production server.
# Idempotent: safe to re-run after every deploy that touches these files.
#
# Usage, from the server repo checkout:
#   bash /mnt/HC_Volume_105579109/Covex27/deploy/install-backup-system.sh

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "installing sqlite3 CLI..."
    apt-get update -qq && apt-get install -y -qq sqlite3
fi

install -m 755 backup-covex.sh        /usr/local/bin/backup-covex.sh
install -m 755 restore-drill-covex.sh /usr/local/bin/restore-drill-covex.sh
install -m 755 covex-alert.sh         /usr/local/bin/covex-alert.sh
install -m 644 systemd/covex-backup.service        /etc/systemd/system/covex-backup.service
install -m 644 systemd/covex-backup.timer          /etc/systemd/system/covex-backup.timer
install -m 644 systemd/covex-restore-drill.service /etc/systemd/system/covex-restore-drill.service
install -m 644 systemd/covex-restore-drill.timer   /etc/systemd/system/covex-restore-drill.timer
install -m 644 systemd/covex-alert@.service        /etc/systemd/system/covex-alert@.service

mkdir -p /var/backups/covex/daily /var/backups/covex/weekly
chmod 700 /var/backups/covex

systemctl daemon-reload
systemctl enable --now covex-backup.timer covex-restore-drill.timer

echo
echo "Installed. Scheduled timers:"
systemctl list-timers 'covex-*' --no-pager
echo
echo "Run one backup + drill now to verify:"
echo "  systemctl start covex-backup.service && systemctl start covex-restore-drill.service"
echo "  cat /var/backups/covex/last-backup.txt /var/backups/covex/last-restore-drill.txt"
echo
echo "Optional out-of-band failure pings: echo 'WEBHOOK_URL=https://...' > /etc/covex/alert.env"
