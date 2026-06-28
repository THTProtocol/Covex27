# Launch-day runbook (Toccata mainnet)

Owner-operated. This maps each launch action to its exact location and command. Covex enables only
deterministic-primitive covenants on mainnet day-one; oracle and on-chain-ZK kinds stay frozen by
design. Toccata activates on mainnet at DAA 474,165,565 (about 2026-06-30).

Backend service: `covex-backend` (systemd). Repo checkout on the box:
`/mnt/HC_Volume_105579109/Covex27`. Env file: `/mnt/HC_Volume_105579109/Covex27/.env`.
Status endpoint: `https://hightable.pro/api/status`.

## Pre-flight (do BEFORE the fork)

1. Deployed binary has the HTLC fund-loss fix. Verify the live commit matches origin/master HEAD:
   `curl -s https://hightable.pro/api/status | grep git_commit`. If behind, run the build-gated
   backend deploy: `ssh root@hightable.pro 'bash /tmp/hard_deploy.sh'` then re-check git_commit.
   This is mandatory: htlc is a day-one primitive and the pre-fix binary bricks HTLC spends with
   WrongSigOpCount.
2. Frontend current: `ssh root@hightable.pro 'bash /tmp/fe_deploy.sh'`.
3. Confirm the mainnet node is at tip and Toccata-ready: `systemctl is-active covex-kaspad-mainnet`
   and check the configured activation DAA equals 474,165,565 against the rusty-kaspa v2.0.0 release
   notes (this value is not dumpable over borsh from a shell).
4. Disk headroom: the root volume should have room before mainnet indexing grows it. Trim if needed.
5. Dry-run the env validation locally without touching prod, with the real treasury value, to
   confirm `validate_mainnet_env()` passes.

## The flip (AFTER the chain passes DAA 474,165,565 AND pre-flight is green)

1. Edit `/mnt/HC_Volume_105579109/Covex27/.env`:
   - `COVEX_MAINNET_COVENANTS_ENABLED=true`
   - `COVENANT_TREASURY_ADDRESS=<real mainnet kaspa address>` (never a testnet or dev address)
2. Restart: `systemctl restart covex-backend`.
3. Verify: `curl -s https://hightable.pro/api/status` shows `mainnet_ready: true`.
4. Smoke test: deploy ONE dust-value `hashlock` or `timelock` covenant on mainnet and confirm it
   appears and is spendable. Do NOT attempt any oracle or ZK kind (they are frozen and will be
   refused, which is correct).

## What goes live vs stays frozen

Live on mainnet day-one: `singlesig`, `hashlock`, `timelock`, `rcsv`, `htlc`, `multisig`.

Stays frozen on mainnet (by design, fail-closed): all oracle-attested kinds (GATE 2 in
`backend/src/covenant_builder.rs` refuses them unconditionally) and all on-chain-ZK kinds
(`zk_precompile_deploy_allowed()` rejects every mainnet network and `KASPA_ZK_PRECOMPILE_ENABLED`
is default off). Do not flip the ZK precompile flag on mainnet.

## Rollback

If anything looks wrong after the flip:
1. Set `COVEX_MAINNET_COVENANTS_ENABLED=false` in the env file.
2. `systemctl restart covex-backend`.
3. Confirm `mainnet_ready: false`. Deterministic-primitive deploys are refused again; no funds are
   affected (covenants already on-chain are spendable by their own scripts regardless).

The prior backend binary is archived by `hard_deploy.sh` under the archive dir; to roll back code,
restore the archived binary and restart.

## Monitoring

The on-box monitor (`deploy/monitoring/covex-watch.sh`, systemd `covex-watch.timer`, every 5 min)
covers backend liveness, node tip freshness, disk, and TLS. The off-box dead-man switch is
`.github/workflows/uptime.yml`. Confirm the alert webhook is configured in
`/opt/covex-monitor/alert.env` before launch.

## Owner-gated items that are NOT part of the day-one flip

These are tracked in `docs/TOCCATA_TRUSTLESS_READINESS.md` and are not required to enable
deterministic primitives:
- The prover box plus TN12 liveness to prove the on-chain-ZK settle path before any mainnet ZK.
- Counsel sign-off before promoting any real-value betting covenant (see
  `docs/GAMBLING_DEEMPHASIS_AND_COMPLIANCE.md`).
- A local covenant-enabled TN10 node, if TN10 parity with TN12 is wanted.
