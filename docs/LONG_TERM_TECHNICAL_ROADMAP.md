# Long-Term Technical Roadmap (Phase 9)

**Date:** Phase 9 completion (second circuit foundation shipped)

## Current State (End of Phase 9 — Concrete Deliverables)
- Primarily oracle-attested model
- **Two** circuits with real foundations:
  - Merkle Membership (fully working end-to-end with oracle)
  - Range Proof (hiding + bounds — circuit + proving skeleton + oracle surface + example; zkey pending)
- Strong operational tooling and mainnet migration
- Clear ecosystem and developer foundation + honest technical roadmap

## 2026–2027 (Short Term)
- Complete Range Proof (zkey + live oracle path + first real covenant)
- Add Age Verification and one more (Verifiable Compute starter)
- Improve oracle performance and multi-key support
- Deeper Covex Terminal ↔ Covenant Studio integration
- First real mainnet economic volume

## 2027–2028 (Medium Term)
- Leverage silverc improvements for richer on-chain payout logic
- Move toward hybrid model (oracle verifies ZK, covenant verifies oracle signature on-chain via OpCheckSig)
- Support for multiple independent oracle providers
- Better proving UX and infrastructure

## 2028+ (Long Term)
- As Kaspa scripting and silverc mature, reduce oracle trust surface for high-value use cases
- Some circuits may achieve meaningful on-chain ZK verification
- Covex becomes the standard professional layer for complex covenants on Kaspa

## Key Dependencies
- Progress in silverc compiler
- Kaspa consensus / scripting upgrades
- Growth of compatible ZK tooling

This document is now superseded by the more ambitious post-Phase-10 plan:

**See:** [docs/FUTURE_ROADMAP_PHASES_11_PLUS.md](FUTURE_ROADMAP_PHASES_11_PLUS.md)

The new roadmap (Phases 11–18) focuses on deep Studio integration, completing the full ZK circuit library, universal easy templates for games + escrow + all covenant types, multi-oracle systems, and long-term hybrid on-chain verification as silverc and Kaspa scripting improve.

This older document is kept for historical reference.
