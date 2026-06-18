# Covex Monitoring

What to watch on a running Covex backend, what to alert on, and the alerting
wiring that exists today vs what is suggested. Grounded in
`backend/src/node_status.rs`, the `/health` and `/status` handlers in
`backend/src/main.rs`, the crawler in `backend/src/crawler.rs`, and the two
monitor scripts in `deploy/`.

For the deploy/rollback/incident procedures these signals feed into, see
[RUNBOOK.md](./RUNBOOK.md).

## The two endpoints

The backend exposes two read-only JSON endpoints used for monitoring:

- Backend route `/health` - public via nginx as `/healthz`. Static-ish
  identity + readiness fields. Cheap.
- Backend route `/status` - public via nginx as `/api/status`. The live per-network
  node/indexer sync snapshot plus covenant counts. This is the one that carries
  the watchdog signals.

Internally (on the box) hit `http://127.0.0.1:3006/health` and
`http://127.0.0.1:3006/status` directly (no `/api` prefix). Externally hit
`https://hightable.pro/healthz` and `https://hightable.pro/api/status`.

## Fields to watch

### `/api/status` -> `node_sync.<network>` (the core signals)

Each network the crawler has reported on (`testnet-12`, `testnet-10`, `mainnet`,
...) has an object. The fields, straight from `node_status.rs::snapshot`:

| field | meaning | healthy looks like |
|-------|---------|--------------------|
| `connected` | node served wRPC dag_info within the last 180s | `true` |
| `tip_daa` | node's virtual DAA tip | advancing every poll |
| `scanned_daa` | how far the indexer has scanned | keeping up, near `tip_daa` |
| `behind_daa` | `tip_daa - scanned_daa` | small / shrinking |
| `last_ok_age_secs` | seconds since the last good dag_info | well under 180 |
| `tip_unchanged_secs` | seconds since `tip_daa` last moved | small (chain is ~10 BPS) |
| `scanned_unchanged_secs` | seconds since `scanned_daa` last moved | small while behind |
| `stalled` | watchdog verdict | `false` |
| `stall_reason` | why, when stalled | empty string |
| `last_error` | last node/RPC error text | empty when healthy |

The `stalled` / `stall_reason` pair is the watchdog. It is computed server-side so
prod can NEVER read green while frozen. `stall_reason` is one of:

- `disconnected` - `connected` is false (node down, mid-IBD, or wRPC dropped).
- `node_tip_frozen` - the node still answers but `tip_daa` has not changed for
  >600s. On a 10 BPS chain that is a genuine node freeze, not low activity.
- `indexer_frozen` - the tip keeps advancing but `scanned_daa` is stuck >300s AND
  more than 2000 DAA behind. The node is fine; the INDEXER is stuck.

Top-level `/api/status` also exposes:
- `node_connected` - true if ANY network is connected (a coarse roll-up).
- `total_covenants` / `active_covenants` / `verified_covenants` - DB counts.
- `git_commit` - the commit the running binary was built from (deploy verification).

### `/healthz` (and `/api/status`) -> readiness + oracle fields

- `oracle_key_mode` - `custom` when `COVEX_ORACLE_KEY` is set, `unconfigured`
  otherwise. The oracle FAILS CLOSED when unconfigured (it will not sign), so
  `unconfigured` on a network that needs oracle payouts is an incident.
- `oracle_pubkey` / `oracle_scheme` (`/healthz` only) - the live x-only pubkey and
  `bip340-schnorr-secp256k1`. The pubkey is committed into every oracle covenant,
  so a CHANGE here is significant - it must match what deployed covenants expect.
- `mainnet_wrpc_configured` - a mainnet wRPC URL is set. This is NOT readiness.
- `mainnet_covenants_enabled` - the Toccata gate (`COVEX_MAINNET_COVENANTS_ENABLED`).
- `mainnet_ready` - the honest readiness signal: `mainnet_wrpc_configured AND
  mainnet_covenants_enabled`. Do not read readiness off the URL alone.
- `crawl_full_rescan` - whether `CRAWL_FULL_RESCAN` is set (forces a from-DAA-0
  rescan). Expect `false` in steady state; `true` left on by accident means the
  crawler keeps rewalking history.

## What to alert on

Tiered by severity. The first three are already wired (see below); the rest are
plain checks worth adding.

Page / urgent:
- Backend health unreachable (`/health` non-200) for more than one interval.
- `covex27-backend` process not running.
- Any network `stalled == true` (especially `node_tip_frozen` or
  `indexer_frozen`) that persists across intervals.
- `oracle_key_mode == "unconfigured"` on a network expected to do oracle payouts.
- `oracle_pubkey` changed unexpectedly (it should only change on a deliberate key
  rotation).

Warn:
- Any network `connected == false` for longer than a normal IBD window (a node
  mid-sync legitimately shows disconnected; alert on PERSISTENCE, not the first
  reading).
- `behind_daa` growing without bound (indexer falling behind even if not yet
  classified `indexer_frozen`).
- Disk usage high (the data volume historically fills; the node datadir grows
  continuously). `>85%` is the existing threshold.
- `git_commit` not matching the commit you just deployed (deploy did not take).

Pre-launch / cutover specific:
- Before flipping the mainnet gate: alert if `node_sync.mainnet.connected` is
  false or `behind_daa` is large (do not flip on a mid-sync node).
- After flipping: alert if `mainnet_ready` is not `true`.

## Alerting wiring that EXISTS today

Two systemd-timer driven scripts already run on the server. They are the real
monitoring; the rest of this doc describes how they map to the fields above.

1. `deploy/monitor-and-alert.sh` (systemd `covex-monitor.timer`, ~every 5-10 min).
   It checks:
   - `/health` reachability (alerts on failure, exits).
   - Oracle responsiveness via a cheap `POST /oracle/verify-and-sign` (alerts if
     slow/failing).
   - Disk usage `>85%`.
   - `covex27-backend` process presence.
   - Per-network stall: reads `/status` `node_sync.<net>.stalled` /
     `stall_reason` / `connected`, STATE-DEDUPED (a persistent stall pages once,
     recovery pages once), and writes a heartbeat line every run so a dead
     timer is itself observable.
   It posts to `WEBHOOK_URL` when set; logs to `/tmp/covex-monitor.log`.

2. `deploy/kaspad-watchdog.sh` (systemd `covex-kaspad-watchdog.timer`).
   Polls `/status`, and on `node_tip_frozen` RESTARTS the server-resident node
   (TN10/TN12 only; mainnet runs off-box), cooldown-bounded and escalating to a
   manual-resync page after `MAX_RESTARTS`. See RUNBOOK.md incident response.

Both read alert config from `/etc/covex/alert.env`. If it defines `WEBHOOK_URL`,
alerts POST there (e.g. Slack / Discord / ntfy.sh); otherwise alerts only hit the
journal + local log files. The webhook is NOT configured by default - wiring one
up is the single highest-value monitoring step, because without it the alerts are
only visible if someone reads the logs.

Quick manual health check from anywhere (no SSH):
```bash
curl -s https://hightable.pro/healthz   | jq '{oracle_key_mode, mainnet_ready, git_commit}'
curl -s https://hightable.pro/api/status | jq '.node_sync'
```

## Suggested additional wiring (does NOT exist yet)

These are recommendations, not current state:

- An external uptime check (UptimeRobot, Healthchecks.io, or a second host's
  cron) hitting `https://hightable.pro/healthz` every 1-2 min. The existing
  scripts run ON the box, so they go silent exactly when the box does. An
  off-box probe is the missing dead-man's-switch.
- A second off-box cron that pulls `/api/status` and alerts on
  `any(node_sync[*].stalled)` or `mainnet_ready == false` during the cutover
  window. Sketch:
  ```bash
  S=$(curl -fsS --max-time 12 https://hightable.pro/api/status) || { notify "covex status unreachable"; exit; }
  echo "$S" | jq -e '.node_sync | to_entries | all(.value.stalled == false)' >/dev/null \
    || notify "covex: a network is stalled -> $(echo "$S" | jq -c '.node_sync')"
  ```
  (`notify` = your webhook curl.)
- Configure `/etc/covex/alert.env` `WEBHOOK_URL` so the EXISTING scripts actually
  page somewhere. This is the cheapest win and turns the already-running timers
  into real alerting.
- Trend/retention (Prometheus textfile exporter scraping `/api/status`, or just
  appending `tip_daa`/`scanned_daa`/`behind_daa` to a log) so "is the indexer
  falling behind over hours" is answerable. None of this exists today; the
  current scripts are point-in-time only.
