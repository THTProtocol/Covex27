# Long-Term Technical Roadmap (Phase 7)

## Current State (End of Phase 5/6)
- Oracle-attested ZK model (proofs verified off-chain, outcomes signed)
- One production-grade circuit (Merkle Membership)
- Strong operational tooling and mainnet migration path
- Honest labeling throughout

## Phase 7+ Vision (2026–2028+)

### Short Term (Next 6–12 months after launch)
- Add 2–3 more practical ZK circuits (Range Proof, Age Verification, basic Verifiable Compute stubs)
- Improve oracle service (better performance, multiple keys, rate limiting at scale)
- Richer Terminal + Studio integration
- First real mainnet usage and feedback loop

### Medium Term (12–24 months)
- Leverage silverc improvements for better on-chain payout primitives
- Move toward hybrid model: some circuits can have stronger on-chain guarantees
- Support for Schnorr-based oracle signatures (OpCheckSig path)
- Public verifier + proving service for common circuits

### Long Term (2–4 years)
- As Kaspa scripting and silverc mature, reduce reliance on off-chain oracle for certain use cases
- Multiple independent oracle providers (decentralized attestation network)
- Full end-to-end examples of complex real-world covenants (escrow, prediction markets, skill games with real enforcement)
- Strong integration with broader Kaspa DeFi and application ecosystem

## Key Dependencies
- Maturation of silverc compiler
- Kaspa consensus / scripting improvements (especially signature verification and payout primitives)
- Growth of the ZK proving ecosystem compatible with Kaspa

## Success Metrics (Long Term)
- Real economic volume flowing through Covex covenants on mainnet
- Multiple independent teams building on top of the oracle + ZK infrastructure
- Clear reduction in "oracle trust" surface area over time as on-chain capabilities improve

---

This is a living document. It will be updated based on real usage and ecosystem progress.
