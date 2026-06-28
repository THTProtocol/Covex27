# Mainnet covenant examples and patterns

This document describes what actually deploys on Kaspa mainnet after the Toccata hard fork, and is
reconciled with the live fail-closed gates in the backend. Covex is not an oracle; it decides no
outcome and runs no oracle key.

## Mainnet day-one scope: deterministic primitives only

When `COVEX_MAINNET_COVENANTS_ENABLED` is turned on (owner-gated, default off), the only kinds that
deploy on mainnet are the deterministic, always-spendable primitives whose entire logic is enforced
by the chain with no third-party key:

- `singlesig` - one key spends.
- `hashlock` - reveal a preimage of a committed `blake2b256` hash.
- `timelock` - spend after an absolute DAA score.
- `rcsv` - relative timelock (BIP68 sequence) forfeit/escrow path.
- `htlc` - hashlock plus a timeout refund (atomic-swap shape).
- `multisig` - k-of-n keys.

Every other kind is frozen on mainnet by design. The oracle-attested kinds are refused
unconditionally (GATE 2 in `backend/src/covenant_builder.rs`), and the on-chain ZK kinds are refused
unconditionally (`zk_precompile_deploy_allowed()` rejects every mainnet network and
`KASPA_ZK_PRECOMPILE_ENABLED` is default off). This is correct fail-closed behavior, not a bug.

## Example: a hashlock escrow on mainnet

1. Open the builder in mainnet mode.
2. Choose `hashlock`. Commit to `h = blake2b256(secret)` (lowercase 64-hex).
3. Set the spender key and fee, then deploy from a funded mainnet wallet.
4. To release, the holder reveals `secret`; the chain enforces `OpBlake2b(secret) == h` and the
   spender signature. No Covex key, no oracle, no server in the payout.

## Example: a timelocked vault

1. Choose `timelock`, set the absolute DAA score after which the funds unlock.
2. Optionally combine with `multisig` for a k-of-n vault that also has a time condition.
3. The chain enforces the unlock height; Covex is never a counterparty.

## Decided outcomes (markets, games): the honest split

Mainnet day-one does NOT include trustless real-world resolution. For an outcome that depends on a
fact no script can compute, there are two honest routes, neither of which makes Covex the resolver:

1. External resolver, published hashlock reveal (`binary_oracle_select`). A provider you choose
   commits to two hashes and reveals one to settle. This is the only zero-custom-code oracle path
   and it needs no Covex key. See `docs/CONNECTING_AN_ORACLE.md`. It is testnet-first; promote to
   mainnet only after counsel sign-off on any real-value betting (see
   `docs/GAMBLING_DEEMPHASIS_AND_COMPLIANCE.md`).
2. On-chain ZK (`zk_game_settle`, KIP-16 OpZkPrecompile). For a self-contained provable statement
   (for example a game win over a move log), Kaspa consensus verifies a RISC0-Groth16 proof and the
   loser cannot forge a win. This is testnet-gated until proven live; it is frozen on mainnet today.

Trustless MONEY MOVEMENT (binding the payout amount and recipient to a chain-checkable fact without
any co-signer) is the forthcoming KIP-10 output-binding work (`OpTxOutputAmount` 0xc2 /
`OpTxOutputSpk` 0xc3 / `OpTxOutputCount` 0xb4). See `docs/ZK_ONCHAIN_PLAN.md` and the readiness plan.

## Recommended mainnet settings

- `KASPA_NETWORK=mainnet`
- `COVEX_MAINNET_COVENANTS_ENABLED=true` only after the Toccata activation DAA has passed and the
  fund-loss-fixed backend binary is deployed.
- A real mainnet treasury address in `COVENANT_TREASURY_ADDRESS`.
- `RUST_LOG=covex27_backend=info,kaspa_wrpc=warn`

Do not set any "Covex oracle" key. Covex does not attest outcomes; resolution is always an external
provider you choose or an on-chain proof.

## Monitoring on mainnet

- `deploy/monitoring/covex-watch.sh` (systemd `covex-watch.timer`, backend + node tip freshness +
  disk + TLS).
- The off-box dead-man switch in `.github/workflows/uptime.yml`.
