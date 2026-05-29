# Building on Covex — Developer Guide

**Version:** End of Phase 8 (2026-05-30)

This guide is for developers who want to build real applications or covenants using the Covex infrastructure on Kaspa.

## Current Capabilities (Honest View)

Covex provides a professional, production-grade platform for ZK-powered and oracle-attested covenants.

**What is real and working today:**
- Full Terminal for configuring circuits, fees, resolution modes, and oracle settings
- One fully functional real ZK circuit: Merkle Membership (MiMC7 preimage proof)
- Working Groth16 proving + verification pipeline (circom + snarkjs)
- Production Oracle service (`/api/oracle/verify-and-sign`) that verifies proofs and returns signed outcomes
- Robust deployment, mainnet migration, monitoring, backup, and validation scripts
- Clear separation between Covex Terminal (serious engineering tool) and Covenant Studio (rich visual UIs)

**What is still aspirational / limited:**
- Most resolution is oracle-attested (off-chain proof verification + signature). True on-chain ZK verification is limited by current silverc capabilities.
- Only one circuit has a complete end-to-end oracle path today.
- Covenant unlocking with oracle signatures still requires manual or semi-manual transaction construction in many cases.
- Rich on-chain payout logic is constrained by silverc v0.1.0.

We are transparent about these limitations.

## Core Integration Patterns

### 1. Use the Oracle Service Directly
The heart of the system is the oracle endpoint.

```bash
curl -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H "Content-Type: application/json" \
  -d @proof-payload.json
```

You receive a signed outcome that can be used as witness data when unlocking the covenant.

See `docs/UNLOCK_WITH_ORACLE_SIGNATURE.md` for current patterns.

### 2. Let Users Configure via the Terminal
Many users will configure their covenant (circuit choice, oracle requirements, fees) using the live Covex Terminal at hightable.pro.

You can read the saved configuration via:

`GET /api/terminal-config/:covenant_id`

This gives you the exact `zk_circuit`, `resolution_mode`, `oracle_proof` (if saved), etc.

Build your application UI on top of that configuration.

### 3. Combine with Covenant Studio
Use Covex Terminal for the serious engineering configuration, then hand off to Covenant Studio for the beautiful user-facing UI.

## Recommended Development Flow

1. Prototype your covenant logic and resolution rules in the Terminal (testnet).
2. Generate and test real proofs locally or via the proving service.
3. Use the production validation scripts (`deploy/validate-production.sh`) to test your flow.
4. Deploy to mainnet using the migration tools.
5. Build your application layer on top (wallet integration, UI, automation of proof submission + oracle calls).

## Contributing New Circuits

We welcome contributions of new real ZK circuits that follow the established pattern:

- Working circom (or equivalent) circuit
- Proving + verification pipeline
- Oracle verification handler
- Documentation and example
- Honest labeling of limitations

See `CONTRIBUTING.md` for the process.

## Philosophy

Covex follows a "radical honesty + pragmatic progress" approach.

We will never claim pure on-chain ZK enforcement that doesn't exist yet.  
At the same time, we will use the best available tools today (off-chain verification + transparent oracle attestation) to make useful, real covenants possible.

As silverc and Kaspa scripting mature, we will evolve the platform toward stronger on-chain guarantees.

## Next Steps for Builders

- Read the full Phase 5–8 completion reports (in the root of this repo)
- Explore the `deploy/` and `docs/` folders
- Test the oracle with the bundled proofs in `zk/`
- Join the discussion on how to expand the set of production circuits

Welcome to the ecosystem. Let's build real things on Kaspa.

---

*Maintained as part of the Covex project (end of Phase 8).*