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
See `deploy/backup-covex.sh`

To restore:
```bash
tar xzf covex-backup-YYYY-MM-DD.tar.gz -C /root/Covex27
```

## Monitoring
- Set up cron for `monitor-and-alert.sh` (every 5-10 min recommended)
- Point `WEBHOOK_URL` at your alerting channel (Slack / Discord / PagerDuty)

---

Keep this document updated as the system evolves.
