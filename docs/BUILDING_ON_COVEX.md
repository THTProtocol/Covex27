# Building on Covex — Developer Guide

**Version:** Post Phase 8 (2026-05-30)

This guide is for developers who want to build real applications or covenants using the Covex infrastructure.

## Current Capabilities (Honest View)

Covex currently provides:

- Professional configuration of ZK circuits and oracle resolution via the Terminal
- A working oracle service that can verify real Groth16 proofs (currently Merkle Membership) and return signed outcomes
- Production-grade tooling for deploying and operating on testnet and mainnet
- Clear, honest labeling of what is real vs aspirational

**Important Limitations (as of Phase 8):**
- Most resolution still happens off-chain via the oracle (oracle-attested model)
- Actual fund movement still requires constructing transactions that use the oracle signature as witness data
- Only a small number of circuits have full end-to-end oracle support today
- On-chain ZK verification is still limited by silverc capabilities

## How to Use the Oracle Service

The core primitive is:

`POST /api/oracle/verify-and-sign`

You send a Groth16 proof + public inputs. If valid, you receive:
- `outcome` (0 or 1 for binary circuits)
- `signature` (SHA256 attestation using the oracle key)
- `message` that was signed

This signature can then be used as part of the witness when unlocking the covenant.

See `docs/UNLOCK_WITH_ORACLE_SIGNATURE.md` for current patterns.

## Recommended Integration Patterns

1. **Simple Oracle Resolution**
   - User submits proof in your UI
   - Your backend calls the oracle
   - You return the signed outcome to the user
   - User (or your service) constructs the unlock transaction

2. **Using Covex Terminal Config**
   - Let users configure their circuit + oracle requirements in the Terminal
   - Read the saved config via `/api/terminal-config/:covenant_id`
   - Build your UI on top of that configuration

## Contributing

See `CONTRIBUTING.md`

We especially welcome:
- New real ZK circuits with working oracle verification
- Improvements to the unlock transaction construction helpers
- Better documentation and examples

## Philosophy

Covex follows a "radical honesty + pragmatic progress" approach.

We will never claim pure on-chain ZK enforcement that doesn't exist yet. At the same time, we will use the best available tools (off-chain verification + transparent oracle attestation) to make useful covenants possible today.

As silverc and Kaspa scripting improve, we will evolve toward stronger on-chain guarantees.

---

This document will be updated as capabilities grow.
