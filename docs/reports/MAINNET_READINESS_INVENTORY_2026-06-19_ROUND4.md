# Mainnet Readiness Inventory - 2026-06-19 - Round 4

Honest inventory of what still blocks the June 30 Toccata mainnet cutover,
captured during the round-4 honesty + recovery-kit sweep. Read-only.

## Blockers

1. BLOCKER (external, owner-action): Toccata covenant kaspad fork
   hard-disables mainnet in args.rs:204 (per project memory
   `covex-kaspad-mainnet-disabled-covpp-2026-06-18`). A covenant-enabled
   kaspad with mainnet ENABLED must be built and run before
   `KASPA_WRPC_URL_MAINNET` can point at anything covenant-aware. Until
   then no mainnet wRPC endpoint exists for the backend to read,
   regardless of how the gates flip. Affects every path that needs a
   mainnet node (indexer, payment_verifier, crawler, resolver_failover
   supervised entry).

2. BLOCKER (owner-decision flag): `COVEX_MAINNET_COVENANTS_ENABLED=true`
   is OFF in production. While off,
   `crawler::covenant_indexing_gated("mainnet", false)` returns true at
   `backend/src/crawler.rs:204` and the mainnet crawler short-circuits
   every 60s without indexing. The `mainnet_ready` field on /health, /,
   /status is therefore false even if a mainnet wRPC is connected
   (`main.rs:778, 811, 852`).

3. BLOCKER (owner-action): `COVEX_ORACLE_KEY` MUST be set in the
   mainnet-indexer process environment. `main.rs:64-72` hard-exits at
   boot if `KASPA_WRPC_URL_MAINNET` is set but `COVEX_ORACLE_KEY` is not.
   Without it the process refuses to start.

4. BLOCKER (code, intentional freeze for value): GATE 2 in
   `covenant_builder.rs:1424-1436` (p2sh_deploy_handler) refuses ANY
   `oracle*` redeem kind on mainnet ("oracle-enforced covenants are
   frozen on mainnet ... funds are not yet trustless"). Until the
   non-custodial rebuild (player 2-of-2 state channels / k-of-n oracle)
   lands, mainnet supports only deterministic primitives (singlesig,
   hashlock, timelock, multisig, htlc). This is correct fail-closed
   behavior, but it IS a launch-scope constraint: oracle, escrow, and
   binary-oracle-select markets cannot be funded for value on June 30.

## Not-Blockers But Worth Tracking

- Custodial-testnet UX paths must remain testnet-only (covex-MAINNET memo).
- Frontend honesty copy after round 4 now distinguishes the 4 chain-
  enforced ZK primitives from the 15 oracle-verified ones.

## Provenance

Cross-references to in-repo memory:
- `covex-kaspad-mainnet-disabled-covpp-2026-06-18`
- `covex-mainnet-toccata-june30`
- `covex-live-network-state-2026-06-18`
- `covex-oracle-key-failclosed-2026-06-16`
