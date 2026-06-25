# Covex Mainnet Launch Checklist (Toccata, 2026-06-30)

## Status delta (verified 2026-06-25)

- FOUNDATION PROVEN: the rusty-kaspa v2.0.1 (Toccata) crate migration is verification-complete on a spike branch (`spike/kaspa-2.0.1`, NOT yet on master): backend builds + 184 tests green, the committed sighash golden is UNCHANGED (existing covenants stay spendable), and the vendored sighash fork is now redundant (upstream v2.0.1 implements the exact Toccata payload_hash rule). The official browser SDK (kaspa-wasm32-sdk-v2.0.1) produces a byte-identical sighash (parity confirmed). A v2.0.1-serialized deploy+spend was ACCEPTED and redeemed on the live TN12 covenant node (deploy b7879e67, spend be155020). Landing on master is gated on a coordinated merge + the items below.
- ON-CHAIN ZK IS REAL ON TOCCATA (corrects line 65 below): v2.0.1 txscript ships OpZkPrecompile (0xa6), a real on-chain Groth16 (tag 0x20) and RISC0 (tag 0x21) verifier. Kaspa DOES have an on-chain proof verifier on Toccata; on-chain ZK verification is viable but NOT yet shipped end to end. Honest nuance: on-chain verification removes verifier-trust, NOT input-trust - circuits over real-world facts still need a trusted attester for the INPUT.
- FUND-LOSS FIX IN FLIGHT (HTLC): the HTLC redeem has two OpCheckSig (claim + refund), so its consensus sig_op_count is 2, but the code declared 1. On a Toccata/v2.0.1 node every HTLC spend would fail WrongSigOpCount(1, 2) and the locked funds would be permanently stuck. Fix on branch `fix/htlc-sigop-count` (Rust builder + JS redeemer + cold tool + test), landing with a TN12 e2e. DO NOT enable HTLC for value on mainnet until this fix is in the DEPLOYED binary.
- MONITORING IS LIVE (master 2f384ae6) but UNARMED: on-box covex-watch.timer (backend / node-tip-freshness / disk / TLS / services, every 5 min) + an off-box GitHub Actions uptime probe. OWNER ACTION: arm it - write COVEX_ALERT_WEBHOOK into /opt/covex-monitor/alert.env (chmod 600) AND set the GitHub repo secret ALERT_WEBHOOK. Arm only ONE webhook (an older monitor-and-alert.sh / covex-kaspad-watchdog already runs).
- NEW OWNER/INFRA ITEM: on-chain ZK GAMES need a >=12GB x86_64 prover host (or a Bonsai key) for the stark2snark wrap; the 7GB box cannot prove. Provision this only if on-chain ZK games are in launch scope.

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

- Singlesig, hashlock, timelock, multisig primitives: consensus-enforced, fully live
- htlc: consensus-enforced, BUT (see Status delta) the sig_op_count fix on branch `fix/htlc-sigop-count` MUST be in the deployed binary before htlc is enabled for value on Toccata mainnet, else every htlc spend fails WrongSigOpCount and the funds lock permanently
- All 19 ZK circuits: TODAY shipped as Groth16-verified off-chain by the external resolver, "Verified off-chain, oracle co-signs payout", with no proof-to-hashlock binding. NOTE (corrected 2026-06-25): Toccata v2.0.1 DOES provide an on-chain proof verifier (OpZkPrecompile 0xa6, Groth16 + RISC0), so on-chain ZK verification is now technically possible; it is simply not yet wired end to end. The honest current state is off-chain verification; on-chain is a post-launch upgrade (and even on-chain, real-world-input circuits still trust an attester for the input)
- Markets / oracle_escrow / oracle covenants: GATED off until owner explicitly enables (GATE 2, the `p2sh_deploy_handler` mainnet freeze in covenant_builder.rs)

## Rollback

- export COVEX_MAINNET_COVENANTS_ENABLED=false; systemctl restart covex-backend
- Prod returns to "0 mainnet covenants" honest state
