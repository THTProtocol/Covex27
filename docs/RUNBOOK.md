# Covex Deploy & Incident Runbook

The real, current procedure for deploying Covex (hightable.pro), rolling back,
flipping the mainnet covenant gate, and responding to incidents. Grounded in the
live server layout as of 2026-06-18. Honest about what exists today vs what is a
suggestion.

For monitoring (what to watch and what to alert on), see [MONITORING.md](./MONITORING.md).
The older Phase-6 notes in [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) (backup/restore,
oracle key rotation) are still valid and not duplicated here.

## Layout (so the steps make sense)

- Server: `root@hightable.pro` (Hetzner). Key-based SSH (`ssh root@hightable.pro`).
- Repo on server: `/mnt/HC_Volume_105579109/Covex27`.
- Backend service: systemd `covex-backend` (binds `127.0.0.1:3006`). Its
  `ExecStart` runs `/opt/covex-target/release/covex27-backend` (note: binary is
  `covex27-backend`, on the OS disk `/opt`, NOT the repo `backend/target`).
- Frontend: static files served by nginx from `/root/htp/public`.
- nginx: `/etc/nginx/sites-enabled/hightable.pro`. It proxies the public
  `/healthz` to the backend `/health`, and the public `/api/*` to the backend
  (so the backend route `/status` is reachable publicly as `/api/status`).
- Node: mainnet kaspad on the box (`covex-kaspad-mainnet.service`); TN10 via
  public resolver; TN12 on the operator PC. The mainnet binary is
  `/usr/local/bin/kaspad-2.0.0` and auto-activates Toccata at fork DAA
  474,165,565 (no binary swap at the fork).

The two deploy scripts referenced below live ON THE SERVER (`/tmp/hard_deploy.sh`,
`/tmp/fe_deploy.sh`); they are not committed to the repo. The steps below describe
exactly what they do so the procedure can be re-derived or re-created if a script
is missing.

## Backend deploy (gated build + test + graceful restart)

Backend changes go out via `/tmp/hard_deploy.sh`. It is a GATE: the live binary is
only restarted if both the build and the test gate pass, so a broken commit can
never replace a working backend.

What it does, in order:

1. `cd /mnt/HC_Volume_105579109/Covex27 && git reset --hard origin/master` to sync
   to the deployed commit.
2. Build into the OS-disk target the service actually loads:
   ```bash
   cd backend
   export PATH=$PATH:/root/.cargo/bin
   CARGO_TARGET_DIR=/opt/covex-target cargo build --release
   ```
   Build gate: if `cargo build` fails, STOP. The prior `/opt/covex-target/release/covex27-backend`
   is untouched, so the running service keeps serving the old binary. Nothing is restarted.
3. Test gate: `cargo test --release`. The only acceptable failure is the
   merkle-fixture test (it depends on an untracked, regenerable `merkle_proof.json`
   and is skipped in CI). Any other test failure STOPS the deploy with the old
   binary still live.
4. Only after both gates pass: `systemctl restart covex-backend`. Graceful
   shutdown (below) drains in-flight HTTP/WS before the old process exits, so the
   restart no longer causes the multi-minute 502 it used to.

Run it:
```bash
ssh root@hightable.pro 'bash /tmp/hard_deploy.sh'
```

Always verify by an OBSERVABLE behavior change, not just the commit hash:
```bash
curl -s https://hightable.pro/healthz | jq '{git_commit, oracle_key_mode, mainnet_ready}'
curl -s https://hightable.pro/api/status | jq '{git_commit, total_covenants}'
```
`git_commit` is baked at build time, so it only changes when the binary was
actually rebuilt into `/opt/covex-target`. If a changed `.rs` file seems to be
skipped by cargo, `touch backend/src/<file>.rs` before re-running.

### gotcha: build target

A plain `cargo build --release` writes to `backend/target`, which the service
NEVER loads. The build MUST set `CARGO_TARGET_DIR=/opt/covex-target`, or
`systemctl restart` just reloads the stale `/opt` binary and your change is not
live. `/tmp/hard_deploy.sh` already does this; preserve it in any re-creation.

## Frontend deploy (npm build + asset-pruned copy)

Frontend changes go out via `/tmp/fe_deploy.sh`.

What it does:

1. `cd /mnt/HC_Volume_105579109/Covex27 && git reset --hard origin/master`.
2. `cd frontend && npm install && npm run build` (produces `dist/`).
3. Copy the build to the nginx root `/root/htp/public`:
   - `rsync -a dist/ /root/htp/public/` WITHOUT `--delete` (vite content-hashes
     chunks, and a no-delete copy preserves `og-cover.png` + the logo pngs that
     vite copies from `public/` into `dist/`).
   - It also copies `dist/og-cover.png` and `dist/*.png` explicitly, because the
     plain `rsync -a dist/` pattern has missed those before.
4. `dist/index.html`, `dist/sw.js`, and `dist/manifest.json` land in
   `/root/htp/public` so the new app shell is served.

Run it:
```bash
ssh root@hightable.pro 'bash /tmp/fe_deploy.sh'
```

### asset prune (recommended, especially for the launch deploy)

`/root/htp/public/assets/` ACCUMULATES old content-hashed chunks forever (no
`--delete`), which can keep stale-service-worker clients alive and breaks
grep-based deploy verification. For a clean served bundle (atomic dir-swap;
`rsync --delete` is unreliable here because `rsync` itself is limited on this box):
```bash
cd /mnt/HC_Volume_105579109/Covex27/frontend
rm -rf /root/htp/public/assets.new /root/htp/public/assets.old
cp -r dist/assets /root/htp/public/assets.new
mv /root/htp/public/assets /root/htp/public/assets.old
mv /root/htp/public/assets.new /root/htp/public/assets
rm -rf /root/htp/public/assets.old
cp dist/index.html dist/sw.js dist/manifest.json /root/htp/public/
cp -r dist/zk/* /root/htp/public/zk/
```
Verify: `ls /root/htp/public/assets/*.js | wc -l` should equal the `dist` count,
and every asset referenced by the served `index.html` must still exist on disk.

### gotcha: service-worker staleness

The SPA service worker is now HTML-network-first (`covex-v2`), so deploys land on
reload. If a user reports a UI bug you cannot reproduce on the live site, suspect
a stale SW first: have them hard-refresh (Ctrl+Shift+R). To force-unstick a
browser, run in the page console:
```js
(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)})()
```
then reload.

## Rollback

There is no separate "rollback binary" mechanism, and none is needed: the gated
deploy already guarantees the prior backend binary stays live whenever a build or
test gate fails. To roll back a commit that DID deploy successfully:

1. Revert in git, on the default branch (do not force-push history):
   ```bash
   git revert <bad_commit>
   git push origin master
   ```
2. Redeploy the now-reverted master with the same scripts:
   - backend: `ssh root@hightable.pro 'bash /tmp/hard_deploy.sh'`
   - frontend: `ssh root@hightable.pro 'bash /tmp/fe_deploy.sh'`
3. Verify the live `git_commit` (backend) / served bundle (frontend) reflects the
   revert.

Notes:
- The backend binary is rebuilt from source on every deploy; there is no kept
  archive of the previous `covex27-backend` binary. The safety net is the gate
  (a failed build leaves the running binary in place) plus `git revert`. Keeping a
  timestamped copy of `/opt/covex-target/release/covex27-backend` before each
  deploy would give an instant binary rollback; that is a SUGGESTION, not current
  practice.
- For a DB-level rollback (corruption, not code), use the backup/restore
  procedure in [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md).

## Flipping the mainnet covenant gate (Toccata cutover)

Pre-Toccata, the crawler indexes ZERO mainnet covenants on purpose: a bare
aa20-aa23 output on mainnet is indistinguishable from an ordinary P2SH /
multisig / inscription until the Toccata hard fork makes covenants valid. The
gate keeps the mainnet explorer honestly at 0 until the operator flips it.

The gate is two env vars read by the backend:
- `COVEX_MAINNET_COVENANTS_ENABLED=true` - turns mainnet covenant indexing on
  (`crawler::mainnet_covenants_enabled()`, read by `/health`, `/status`,
  `mainnet_ready`, and the resolver-failover supervisor).
- `CRAWL_START_DAA=474165565` - the Toccata mainnet fork DAA. It is the crawl
  floor ONLY when there is no `crawler_state` row for mainnet yet; once a row
  exists the crawler resumes from the stored watermark.

Procedure (one drop-in edit + restart):
```bash
# Edit the backend drop-in that already holds KASPA_WRPC_URL_MAINNET + COVEX_ORACLE_KEY:
#   /etc/systemd/system/covex-backend.service.d/mainnet.conf
#   add:  Environment=COVEX_MAINNET_COVENANTS_ENABLED=true
#         Environment=CRAWL_START_DAA=474165565
systemctl daemon-reload
systemctl restart covex-backend
```

Before flipping, confirm the mainnet node is at tip and serving (gate-flip on a
mid-sync node indexes nothing useful):
```bash
curl -s https://hightable.pro/api/status | jq '.node_sync.mainnet'
```
After flipping, confirm readiness flips true and the mainnet crawler starts from
the fork DAA:
```bash
curl -s https://hightable.pro/healthz | jq '{mainnet_covenants_enabled, mainnet_wrpc_configured, mainnet_ready}'
```
If there is no mainnet `crawler_state` row yet, `CRAWL_START_DAA` is the floor and
the crawler walks forward from 474,165,565, indexing every mainnet covenant from
#1. If a stale row exists, check/seed it directly in `covex.db`
(`crawler_state`, column `last_scanned_daa`).

## Graceful shutdown

`covex-backend` handles SIGTERM (systemd stop/restart) and SIGINT (Ctrl-C) via
`shutdown_signal()` in `backend/src/main.rs`, wired into
`axum::serve(...).with_graceful_shutdown(...)`. On a stop/restart the server
stops accepting new connections and DRAINS in-flight HTTP/WS before the process
exits, instead of cutting them mid-request. This is what removed the multi-minute
502 window that every backend restart used to cause.

Operational implications:
- A `systemctl restart covex-backend` is safe during traffic; expect a brief drain
  rather than dropped requests.
- A request that is genuinely hung (e.g. a stuck ZK verify) could extend the drain;
  the ZK verifier is itself bounded (20s `VERIFY_TIMEOUT`, killed on overrun,
  concurrency-capped at 6 in `oracle_verifier.rs`), so a single proof cannot pin
  shutdown indefinitely.
- Background tasks (crawler, payment verifier, resolver-failover) are tied to the
  process and exit with it; they re-anchor safely on next start (the crawler never
  corrupts its watermark on shutdown - see the reorg reconciliation notes).

## Incident response: node_status watchdog firing

The "node_status watchdog" is two layers, both reading the per-network signals
that `backend/src/node_status.rs` exposes on `/api/status` (`node_sync.<net>`):

1. Backend classifier (`node_status.rs::snapshot`): marks a network `stalled`
   with a `stall_reason` of `disconnected`, `node_tip_frozen` (tip unchanged
   >600s while the node still answers - a genuine freeze on a 10 BPS chain), or
   `indexer_frozen` (tip advancing but `scanned_daa` stuck >300s and >2000 DAA
   behind). This is the source of truth; it never reads green while frozen.
2. `deploy/kaspad-watchdog.sh` (systemd `covex-kaspad-watchdog.timer`): polls
   `http://127.0.0.1:3006/status`, and on `node_tip_frozen` restarts the
   server-resident node (TN10/TN12 only; mainnet runs off-box). It is
   alert-first, cooldown-bounded (`COOLDOWN` 900s), and escalating
   (`MAX_RESTARTS` 3); after that it STOPS restarting and pages for a manual
   resync.

When you get a watchdog alert:

1. Read the actual state:
   ```bash
   curl -s https://hightable.pro/api/status | jq '.node_sync'
   ssh root@hightable.pro 'tail -n 40 /var/lib/covex-monitor/kaspad-watchdog.log'
   ```
2. Triage by `stall_reason`:
   - `disconnected` - the node is not serving wRPC (down, mid-IBD, or tunnel
     dropped). Check the node service:
     `ssh root@hightable.pro 'systemctl status covex-kaspad-mainnet'` (or the
     relevant `kaspad`/`kaspad-tn10`). A node mid-sync legitimately shows
     disconnected until it catches up; give IBD time before acting.
   - `node_tip_frozen` AND the watchdog has already restarted `MAX_RESTARTS`
     times without recovery - this is the deterministic freeze signature (frozen
     tip + high CPU + no logs). A restart loop will NOT fix it; it needs a
     datadir wipe + resync (stop the node, remove its `datadir`, start; it does a
     fresh IBD). Confirm disk has room first.
   - `indexer_frozen` - the chain is advancing but the crawler is stuck. The
     crawler has timeouts and auto-resumes, so first restart the backend
     (`systemctl restart covex-backend`); if it recurs, check the node can serve
     `get_block` (public TN10 nodes throttle `get_block` and cannot deep-index).
3. Confirm recovery: watch `node_sync.<net>.tip_daa` advancing and `stalled`
   return to `false`; the watchdog pages a one-time "tip recovered" line and
   clears its restart counter.

Watchdog tunables (env, if you need alert-only or different thresholds):
`KASPAD_WATCHDOG_NO_RESTART=1` (alert only), `KASPAD_WATCHDOG_COOLDOWN`,
`KASPAD_WATCHDOG_MAX_RESTARTS`. Alerts go to the journal +
`/var/lib/covex-monitor/kaspad-watchdog.log`, and to a webhook if
`/etc/covex/alert.env` defines `WEBHOOK_URL` (not configured by default - set one
up for out-of-band paging).
