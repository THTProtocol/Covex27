# Covex Operations Runbook (Phase 6)

## Daily Checks
- Run `./deploy/covex-status.sh`
- Check recent logs: `tail -100 /tmp/covex27.log`
- Verify oracle is responding with a quick test proof

## Restarting the Backend
Preferred method:
```bash
./deploy/start-covex-backend.sh
```

Alternative (systemd):
```bash
systemctl restart covex27-backend
```

## Mainnet Migration (Post Hard Fork)
```bash
./deploy/switch-to-mainnet.sh
```

Always review the script first and set the correct mainnet treasury + `COVEX_ORACLE_KEY`.

## Rotating Oracle Key
1. Generate new keypair
2. Set `COVEX_ORACLE_KEY` in environment / `.env.production`
3. Restart backend
4. Update any documentation / runbooks with new key (never commit private key)

## Common Issues

**Oracle returning 502 / timeout**
- Usually means the synchronous snarkjs call is blocking. Make sure `spawn_blocking` is in place in `oracle.rs`.

**No new covenants appearing**
- Check wRPC connection in logs
- Verify `KASPA_WRPC_URL` points to a healthy node

**Disk filling up**
- Run the backup script regularly
- Consider moving ZK artifacts to cheaper storage if proving is done elsewhere

## Emergency Contacts / Escalation
( Fill in with your team details )

## Backup & Restore

Automated since 2026-06-12 via systemd timers (install/update with
`bash deploy/install-backup-system.sh` on the server):

- **Nightly 03:17 UTC** `covex-backup.timer` runs `backup-covex.sh`: a
  crash-consistent `VACUUM INTO` snapshot of
  `/opt/covex-db/covex.db`, integrity-checked, gzipped to
  `/mnt/HC_Volume_105579109/covex-backups/daily/` (the data volume, a different
  device from the root disk where /opt lives). Keeps 7 daily + 8 weekly (Sunday)
  copies, plus a small tarball of
  the systemd/nginx config. Aborts loudly if the target disk has <5GB free.
- **Weekly Sun 04:17 UTC** `covex-restore-drill.timer` runs
  `restore-drill-covex.sh`: pulls in a fresh backup first (`Wants=`), gunzips
  the newest snapshot, runs `PRAGMA integrity_check`, verifies schema + row
  counts, and checks no daily snapshot is missing since the oldest retained
  one.
- **Status files** `/mnt/HC_Volume_105579109/covex-backups/last-backup.txt` and
  `last-restore-drill.txt` hold one PASS/FAIL line each. They are written
  pessimistically (FAIL at run start, PASS only on full success), so a killed
  run can never masquerade as a pass.
- **On failure** either unit triggers `covex-alert@.service`, which logs to
  the journal and `/mnt/HC_Volume_105579109/covex-backups/alerts.log`, and POSTs to a webhook if
  `/etc/covex/alert.env` defines `WEBHOOK_URL=` (not configured by default -
  set one up, e.g. ntfy.sh, for out-of-band pings).

Health checks:
```bash
systemctl list-timers 'covex-*'
journalctl -u covex-backup -u covex-restore-drill -n 50
cat /mnt/HC_Volume_105579109/covex-backups/last-backup.txt /mnt/HC_Volume_105579109/covex-backups/last-restore-drill.txt
```

To restore for real (replaces the live DB - take a copy of the broken one first):
```bash
systemctl stop covex-backend
mv /opt/covex-db/covex.db /opt/covex-db/covex.db.broken.$(date +%s)
rm -f /opt/covex-db/covex.db-wal /opt/covex-db/covex.db-shm
gunzip -c /mnt/HC_Volume_105579109/covex-backups/daily/covex-YYYY-MM-DD.db.gz > /opt/covex-db/covex.db
sqlite3 /opt/covex-db/covex.db "PRAGMA integrity_check;"
systemctl start covex-backend
```

Off-server copies do not exist yet: a root-disk failure still loses the
backups (the live DB survives on the volume, and vice versa). Next step when
a second host or object storage is available: rsync `/mnt/HC_Volume_105579109/covex-backups/`
off the machine.

## Monitoring
- Set up cron for `monitor-and-alert.sh` (every 5-10 min recommended)
- Point `WEBHOOK_URL` at your alerting channel (Slack / Discord / PagerDuty)

---

Keep this document updated as the system evolves.
