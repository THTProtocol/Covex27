# Mainnet Covenant Examples & Patterns (Phase 6)

This document provides real-world patterns for using Covex on mainnet after the Toccata hard fork.

## 1. Deploying a Merkle Membership Covenant on Mainnet

Steps:
1. Use the Terminal on the live site (mainnet mode).
2. Select `merkle_membership` circuit.
3. Configure fee (recommended 2%), name, description.
4. Deploy using mainnet wallet.
5. Save the Terminal config (this persists the circuit choice).

## 2. Submitting a Real Proof + Getting Oracle Signature

Use either:
- The built-in Oracle Resolution UI in the Terminal (recommended for most users), or
- Direct curl to `https://hightable.pro/api/oracle/verify-and-sign`

Example payload (see `zk/merkle_proof.json` for a working test proof on testnet; replace with mainnet equivalent when available).

## 3. Unlocking with the Oracle Signature

After receiving a valid signature from the oracle:

- Construct a Kaspa transaction that spends the covenant UTXO.
- Include the following as witness data:
  - `outcome` (0 or 1)
  - `timestamp`
  - `signature` (the SHA256 attestation from the oracle)
  - `message` that was signed (`covex-oracle:<covenant_id>:<outcome>:<timestamp>`)

Note: Full automated unlocking scripts will improve as silverc gains more expressive power.

## Recommended Mainnet Settings (Phase 6)

- `KASPA_NETWORK=mainnet`
- Use a proper mainnet treasury address
- Set `COVEX_ORACLE_KEY` to a dedicated mainnet oracle key (never reuse testnet dev keys on mainnet)
- Run with `RUST_LOG=covex27_backend=info,kaspa_wrpc=warn`

## Monitoring on Mainnet

Use the same tools as testnet:
- `deploy/covex-status.sh`
- `deploy/validate-production.sh`
- Cron job with `monitor-and-alert.sh`

---

This document will be expanded with more examples as real mainnet usage grows.
