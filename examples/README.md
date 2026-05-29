# Covex Covenant Examples

This directory contains example integrations and deployment patterns for building on Covex.

## Merkle Membership + Oracle Flow

The most complete end-to-end example uses the MerkleMembership circuit:

1. Deploy a MerkleMembership covenant through Covex Terminal
2. Generate a Groth16 proof using `zk/prove_verify.js`
3. Submit the proof to `POST /api/oracle/verify-and-sign`
4. Receive a signed outcome attestation
5. Use the signature to construct an unlock transaction

See `docs/BUILDING_ON_COVEX.md` for the full integration guide and `docs/UNLOCK_WITH_ORACLE_SIGNATURE.md` for transaction construction notes.

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/covenants` | Query indexed covenants (supports ?creator=<addr>) |
| `GET /api/status` | Network status, covenant counts |
| `POST /api/oracle/verify-and-sign` | Submit ZK proof, get signed outcome |
| `GET /api/terminal-config/:id` | Get terminal config for a covenant |
| `POST /api/sign-and-broadcast` | Build, sign, and broadcast a transaction |

## Running Locally

```bash
cd backend && cargo build --release
export KASPA_NETWORK=testnet-12
export KASPA_WRPC_URL=ws://127.0.0.1:17217
./target/release/covex27-backend
```
