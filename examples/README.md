# Covex Covenant Examples

This directory contains example integrations and deployment patterns for building on Covex.

## Merkle Membership + Oracle Flow (Production)

The most complete end-to-end example uses the MerkleMembership circuit:

## Range Proof — Phase 9 Foundation (New)

`examples/range-proof/` contains the second circuit added during Phase 9:

- A proper hiding range proof (MiMC commitment + 64-bit bounds)
- Honest documentation of exactly what exists vs what is still needed (zkey, oracle wiring)
- Placeholder submission script that surfaces the current "foundation only" oracle response

This is the concrete technical expansion promised for Phase 9. Full live usage is the immediate follow-up task after launch.

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

## Covenant Integration (NEW — the whole point of Covex)
See `covenant-integration/README.md` for the **5-minute guide** to dropping any ZK circuit + Covex oracle signature into a real Kaspa SilverScript covenant.

Includes:
- Standardized oracle response (now includes `circuit_type` + `covenant_hint`)
- Ready-to-paste `.sil` templates (turn_timer, pot_split, collateral_auction, poker_vrf, plus the earlier chess + utxo ones)
- `zk/covenant-helper.js` — feed it an oracle response and it prints witnesses + code snippets
- How the pluggable verifier + uniform verify scripts keep everything compatible when you add new circuits

All the pieces (oracle, E2E, frontend, artifacts, registry) are designed so that **new circuits just work** with the covenant flow.
