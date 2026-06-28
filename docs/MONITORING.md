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
  Now wired: `monitor-and-alert.sh` runs this prod-vs-master drift check every
  interval (see "Alerting wiring that EXISTS today" below).

Pre-launch / cutover specific:
- Before flipping the mainnet gate: alert if `node_sync.mainnet.connected` is
  false or `behind_daa` is large (do not flip on a mid-sync node).
- After flipping: alert if `mainnet_ready` is not `true`.

## Live alerting

This is the alerting system to arm. It has two halves that cover each other's
blind spots: an on-box monitor and an off-box dead-man's-switch.

### On-box monitor: `covex-watch` (`deploy/monitoring/`)

Source lives at `deploy/monitoring/covex-watch.sh`; it is installed on the box
at `/opt/covex-monitor/covex-watch.sh` and driven by the systemd timer
`covex-watch.timer` (`OnCalendar=*:0/5`, `Persistent=true`) via the oneshot unit
`covex-watch.service`. It runs five checks every five minutes and aggregates RED
and WARN conditions:

| # | check | RED when | WARN when |
|---|-------|----------|-----------|
| 1 | backend liveness | `http://127.0.0.1:3006/health` is not 200, or 200 with no `app`/`status` field, or `status != ok` | - |
| 2 | node tip freshness | `testnet-12` `node_sync.tip_daa` has not advanced within the staleness window (default 900s), OR the backend's own `stalled`/`stall_reason` is set (`node_tip_frozen` / `indexer_frozen` / `disconnected`), OR `connected == false` | - |
| 3 | disk | `/` or `/mnt/covex-data` `>= 85%` used | `>= 80%` used |
| 4 | TLS cert expiry | `hightable.pro:443` or `oracle.hightable.pro:443` cert has `< 14` days left | (could not read/parse a cert) |
| 5 | systemd units | `covex-backend.service`, `kaspad-tn12.service`, or `nginx.service` is not `active` | - |

Tip-freshness detail (the core gap this closes): the monitor persists the
last-seen `tip_daa` and the time it FIRST saw that value in
`/opt/covex-monitor/state.json`, and goes RED if the tip has not changed within
`COVEX_TIP_STALE_SECONDS`. This is an INDEPENDENT cross-run check, separate from
the backend's in-process 600s watchdog (`node_status.rs`), which resets its
`tip_changed_at` whenever the backend restarts. So the on-box monitor still
catches a tip freeze that spans a backend restart, and it ALSO surfaces the
backend's own `stalled`/`stall_reason` verdict when that is available. The tip
signal used is `node_sync["testnet-12"].tip_daa` from `/status` (the live
covenant network); change it with `COVEX_TIP_NETWORK`.

De-dup and heartbeat: an alert is sent ONLY on a state change (green -> red/warn,
or red/warn -> green, with a `RECOVERED:` recovery line on clearing) PLUS one
daily "all green" heartbeat, tracked in `state.json`. Silence therefore means the
timer is dead, which is itself a signal. Every run prints a one-line status to
the journal regardless (`journalctl -u covex-watch.service`).

Fail-safe arming: the webhook is read from `/opt/covex-monitor/alert.env`
(`chmod 600`). If `COVEX_ALERT_WEBHOOK` is unset/empty, the monitor logs
`ALERT WEBHOOK UNARMED; would have sent: <summary>` and exits 0, so an unarmed
box is considered healthy and ready, not broken. When armed it POSTs a JSON body
carrying BOTH a `text` key (Slack) and a `content` key (Discord), so either
platform's generic incoming webhook renders the multi-line summary (hostname,
git_commit, timestamp, and each RED/WARN line). The monitor only OBSERVES; it
does not restart anything (node auto-restart on a frozen tip is the separate
`covex-kaspad-watchdog`).

Install / reinstall on the box:
```bash
install -m 755 deploy/monitoring/covex-watch.sh /opt/covex-monitor/covex-watch.sh
cp deploy/monitoring/covex-watch.service deploy/monitoring/covex-watch.timer /etc/systemd/system/
cp deploy/monitoring/alert.env.example /opt/covex-monitor/alert.env.example
# create /opt/covex-monitor/alert.env (chmod 600) from the example if absent
systemctl daemon-reload
systemctl enable --now covex-watch.timer
systemctl list-timers | grep covex-watch     # confirm scheduled
/opt/covex-monitor/covex-watch.sh             # run once, read the output
```

### Off-box dead-man's-switch: GitHub Actions (`.github/workflows/uptime.yml`)

The on-box monitor goes silent exactly when the box does (network, power,
kernel). The GitHub Actions `uptime` workflow runs on GitHub's infra, cron every
~10 min plus `workflow_dispatch`, and curls the PUBLIC endpoints:

- `https://hightable.pro/api/health` - must be 200 with `status` + `git_commit`.
- `https://oracle.hightable.pro/health` - probed, but the oracle service has NO `/health`
  route (it 404s); the service answers 200 on `/`, so the job falls back to `/`
  and accepts that. This divergence is expected and is why the oracle probe does
  not hard-fail on the `/health` 404 alone.

On any failure the job FAILS (the red X in the Actions tab is itself the alert)
and, if the repo secret `ALERT_WEBHOOK` is set, POSTs the same dual-key
(`text` + `content`) JSON. If the secret is unset the POST is skipped gracefully
but the job still fails. It is dependency-free (just `curl` + `python3` on the
runner).

### How the owner ARMS it (two independent places)

1. On the box, write the webhook into the on-box arm file:
   ```bash
   ssh root@hightable.pro
   printf 'COVEX_ALERT_WEBHOOK=%s\nCOVEX_TIP_STALE_SECONDS=900\n' \
     'https://hooks.slack.com/services/XXX/YYY/ZZZ' > /opt/covex-monitor/alert.env
   chmod 600 /opt/covex-monitor/alert.env
   /opt/covex-monitor/covex-watch.sh   # next state-change/heartbeat now POSTs
   ```
   (Slack hook, Discord `.../api/webhooks/...`, or an ntfy.sh topic all work.)
2. In the GitHub repo, set the Actions secret `ALERT_WEBHOOK` to the SAME (or a
   different) webhook URL: Settings -> Secrets and variables -> Actions -> New
   repository secret, name `ALERT_WEBHOOK`. Until it is set, a failed probe is
   still visible as a failed workflow run.

Staleness window: `COVEX_TIP_STALE_SECONDS` (default 900 = 15 min) controls the
on-box independent tip-advance check. Lower it for a tighter freeze SLA; raise it
if the chain legitimately has long quiet gaps (it should not - TN12 is ~10 BPS).

### What this does NOT cover (honest limits)

- The on-box monitor is BLIND to a total box outage: if the box is down, the
  timer cannot run and cannot page. That exact gap is what the off-box GitHub
  Actions probe exists to catch.
- The off-box GitHub Actions probe is BLIND to an internal node-tip freeze while
  the box is still up and `/api/health` still returns 200: health does not carry
  the tip. That exact gap is what the on-box tip-freshness check (and the
  backend's `node_sync.stalled` verdict) exists to catch.
- Neither half checks APPLICATION-LOGIC correctness: that covenant
  build/sign/settle math is right, that the oracle signs only when it should, or
  that ZK proofs verify. Those are enforced by the backend's own fail-closed
  gates and the test suite, not by this monitor. A 200 health response and an
  advancing tip do not prove the money path is correct.
- TLS, disk, and unit-active checks are point-in-time; there is no trend
  retention here (no "is disk filling over days" history). The
  `node_sync.behind_daa` field is the closest live signal for indexer lag; long
  term trending is still a suggested addition (see below).
- The webhook POST is best-effort: if the configured webhook is itself down, the
  alert is logged to the journal but not delivered. The off-box job additionally
  fails visibly, but the on-box monitor relies on the webhook being reachable.

### Relationship to the older `monitor-and-alert.sh`

A prior monitor, `deploy/monitor-and-alert.sh` (timer `covex-monitor.timer`),
also runs on the box and overlaps on backend-health, disk (`/` only), process
presence, the per-network stall flag, and a prod-vs-master drift check. It reads
its webhook from `/etc/covex/alert.env` (`WEBHOOK_URL`, single `text` key) - a
DIFFERENT file and key from `covex-watch`. `covex-watch` is the newer, broader
on-box monitor (it adds TLS expiry, systemd is-active per unit, the data-volume
disk check, an independent cross-run tip-advance check, the dual-key Slack +
Discord payload, and the daily heartbeat). The two can coexist; to avoid double
paging once both are armed, arm ONE of them (prefer `covex-watch` via
`/opt/covex-monitor/alert.env`) and leave the other's webhook unset, or point
both at the same URL and accept the duplicate.

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
   - Prod-vs-master DRIFT (WARN tier): fetches `https://hightable.pro/healthz`
     `git_commit` and compares it to the EXPECTED deployed SHA, so the recurring
     "master pushed but the server was never deployed" trap pages instead of going
     unnoticed. Expected SHA precedence: `$DEPLOYED_SHA` env, else
     `/var/lib/covex-monitor/deployed-sha.txt` (either of which a deploy can write),
     else `origin/master` HEAD from the server repo. The live `git_commit` is a
     SHORT sha and is matched by prefix against the (possibly full) expected sha.
     STATE-DEDUPED like the stall check (a persistent drift pages once, a resync
     pages once), and a heartbeat `drift ...` line is written every run. It is WARN
     tier, not page: drift means "a deploy did not take", not an outage. If the live
     `healthz` is unreachable or no expected SHA can be resolved, it logs
     `UNKNOWN:<reason>` rather than a false drift. Overridable env:
     `HEALTHZ_URL`, `DEPLOYED_SHA`, `COVEX_REPO_DIR`.
     - HONEST LIMIT: `git_commit` is derived by `get_git_commit()` in
       `backend/src/main.rs`, which prefers the `GIT_COMMIT` env (NOT set in the
       current systemd unit) and otherwise FALLS BACK to `git rev-parse HEAD` on
       the server's repo working tree. Because both `hard_deploy.sh` and
       `fe_deploy.sh` `git reset --hard origin/master` BEFORE building, the repo
       HEAD (and therefore `git_commit`) tracks the LAST commit a deploy script
       synced to the server, not necessarily the commit the running binary was
       compiled from. So this check reliably catches "origin/master moved but no
       deploy script ran on the box" (the common drift), but it does NOT by itself
       prove the running BINARY was rebuilt (a backend commit whose build/test gate
       failed leaves a stale binary live while the repo HEAD still advanced). For a
       binary-level guarantee, set `DEPLOYED_SHA` (or write
       `/var/lib/covex-monitor/deployed-sha.txt`) only AFTER a successful
       `systemctl restart`, or bake `GIT_COMMIT` into the systemd unit at restart
       time so `git_commit` reflects the binary rather than the working tree.
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
