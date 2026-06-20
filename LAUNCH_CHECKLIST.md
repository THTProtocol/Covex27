# Covex Mainnet Launch Checklist (Toccata, 2026-06-30)

## Owner pre-flight (June 29, in order)

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
   `crawler::covenant_indexing_gated("mainnet", false)` returns true (see
   that function in `backend/src/crawler.rs`) and the mainnet crawler
   short-circuits every 60s without indexing. The `mainnet_ready` field on
   /health, /, /status is therefore false even if a mainnet wRPC is
   connected (the `mainnet_ready` computation in `backend/src/main.rs`).
   (Code references here are function names, not line numbers, which drift.)

3. BLOCKER (owner-action): `COVEX_ORACLE_KEY` MUST be set in the
   mainnet-indexer process environment. The `COVEX_ORACLE_KEY` boot gate
   (`validate_mainnet_env` / the oracle-key check in `backend/src/main.rs`)
   hard-exits at boot if `KASPA_WRPC_URL_MAINNET` is set but
   `COVEX_ORACLE_KEY` is not. Without it the process refuses to start.

4. BLOCKER (code, intentional freeze for value): GATE 2 (the
   `p2sh_deploy_handler` mainnet oracle-kind freeze in
   `backend/src/covenant_builder.rs`) refuses ANY
   `oracle*` redeem kind on mainnet ("oracle-enforced covenants are
   frozen on mainnet ... funds are not yet trustless"). Until the
   non-custodial rebuild (player 2-of-2 state channels / k-of-n oracle)
   lands, mainnet supports only deterministic primitives (singlesig,
   hashlock, timelock, multisig, htlc). This is correct fail-closed
   behavior, but it IS a launch-scope constraint: oracle, escrow, and
   binary-oracle-select markets cannot be funded for value on June 30.

## Env vars to set on hightable.pro

- KASPA_NETWORK=mainnet
- KASPA_WRPC_URL_MAINNET=...
- COVENANT_TREASURY_ADDRESS=kaspa:... (must NOT start with kaspatest:; validate_mainnet_env will reject)
- COVEX_ORACLE_KEY=... (or fail-closed startup per oracle.rs)
- COVEX_MAINNET_COVENANTS_ENABLED=true

## Pre-flight verification (run BEFORE flipping COVEX_MAINNET_COVENANTS_ENABLED)

- curl https://hightable.pro/api/status | jq '.mainnet_ready' (must be true)
- curl https://hightable.pro/api/covenants?network=mainnet&limit=1 (must return 0)

## What users see when flipped

- Singlesig, hashlock, timelock, multisig, htlc primitives: consensus-enforced, fully live
- All 19 ZK circuits: Full ZK pill, Groth16-verified off-chain by the disclosed oracle, "Verified off-chain, oracle co-signs payout" (none chain-enforced; Kaspa has no on-chain pairing verifier and there is no proof-to-hashlock binding)
- Markets / oracle_escrow / oracle covenants: GATED off until owner explicitly enables (GATE 2, the `p2sh_deploy_handler` mainnet freeze in covenant_builder.rs)

## Rollback

- export COVEX_MAINNET_COVENANTS_ENABLED=false; systemctl restart covex-backend
- Prod returns to "0 mainnet covenants" honest state
