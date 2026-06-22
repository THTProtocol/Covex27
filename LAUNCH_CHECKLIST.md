# Covex Mainnet Launch Checklist (Toccata, 2026-06-30)

## Owner pre-flight (June 29, in order)

1. RESOLVED (verified 2026-06-20, binary evidence): the deployed mainnet node IS a
   covenant-aware Toccata build, so the earlier "args.rs:204 hard-disables mainnet /
   a covenant-enabled kaspad must be built and run" note is superseded.
   `/usr/local/bin/kaspad-2.0.0` (running as covex-kaspad-mainnet, connected to the
   real mainnet via the kaspanet.org DNS seeders, at tip) contains the
   `toccata_activation` fork parameter (alongside the live `crescendo_activation`) and
   the full covenant validation path: CovenantsError, InvalidCovInIndex /
   InvalidCovOutIndex / InvalidAuthCovOutIndex, CovenantBindingInV0, "gas is only allowed
   for Toccata-or-newer tx versions", and covenant-authorizing-input handling. A stock
   pre-Toccata node has none of these. Covenants are NOT flag-gated (no `--covenant` CLI
   option); activation is by fork DAA, so NO binary swap is needed. (The TN12 preview
   runs the older `kaspad-covenant` 1.1.1-toc.1 build, which named the same fork
   `covenants_activation`.)
   OPERATOR 1-LINE CONFIRM before launch: verify the configured mainnet toccata
   activation DAA == 474165565 against the rusty-kaspa 2.0.0 release notes. (The runtime
   fork config is not dumpable over the borsh wRPC from a shell, so the DAA value itself
   was not machine-verified here; the covenant-AWARENESS of the binary is verified.)

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
- All 19 ZK circuits: Full ZK pill, Groth16-verified off-chain by the external resolver, "Verified off-chain, oracle co-signs payout" (none chain-enforced; Kaspa has no on-chain pairing verifier and there is no proof-to-hashlock binding)
- Markets / oracle_escrow / oracle covenants: GATED off until owner explicitly enables (GATE 2, the `p2sh_deploy_handler` mainnet freeze in covenant_builder.rs)

## Rollback

- export COVEX_MAINNET_COVENANTS_ENABLED=false; systemctl restart covex-backend
- Prod returns to "0 mainnet covenants" honest state
