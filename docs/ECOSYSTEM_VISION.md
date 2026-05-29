# Covex Ecosystem Vision

Covex is designed to become the professional infrastructure layer for trust-minimized covenant execution on Kaspa. This document outlines what external adoption and ecosystem growth look like.

## Short-term (Testnet → Mainnet Launch)

- **Oracle as a service**: Any Kaspa dApp can call `/api/oracle/verify-and-sign` to get signed attestations for off-chain events or ZK proofs.
- **Covenant visibility**: Paid tiers give covenant creators Explorer placement. This creates a marketplace of covenant discovery.
- **Covenant Studio**: Visual UI template editor enables non-technical creators to design rich covenant interfaces.

## Medium-term (Mainnet Maturation)

- **More ZK circuits**: Range proofs, age verification, verifiable compute — expanding the toolkit of trustless covenant types.
- **Better on-chain logic**: As silverc matures (OpCheckSig, richer payout primitives), covenants move from oracle-attested toward on-chain ZK enforcement.
- **External integrations**: Wallets, explorers, and dApps integrate Covex covenant data and oracle attestations.

## Long-term Vision

- **ZK-native covenants**: Full on-chain Groth16/Plonk verification inside Kaspa covenants.
- **Cross-covenant composability**: Multiple interacting covenants with shared state and oracle feeds.
- **Ecosystem standard**: Covex becomes the default way to discover, deploy, and interact with Kaspa covenants.

## What Success Looks Like

- External teams building real products on top of Covex's oracle and indexing infrastructure
- Multiple circuit types with active usage and real economic activity
- Community contributions to circuits, documentation, and tooling
- Covex cited as reference implementation for Kaspa covenant infrastructure

## What We Won't Do

- Closed-source proprietary features
- Vendor lock-in or exclusive access
- Simulated/fake features marketed as real
- Centralized custody of user funds
