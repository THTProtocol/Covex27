# Money-Path Audit - Round 4 - 2026-06-19

Scope: read-only audit of the fund-handling money path on top of the round-4
honesty pass (4-vs-15 chain-enforced ZK split, recovery kit, games sweep).
No code change in this round; findings below are recorded for the next
work batch.

## P0 Money-Path Findings

```
p0_money_path_findings = []
```

No new P0 fund-drain or fund-loss bugs were identified in this round on top
of what was already remediated in the 48e8a2d security audit cycle. This is
not a claim that the money path is finished; it is the honest result of this
specific read-only pass.

Known remaining money-path constraints (not P0, tracked elsewhere):

- Oracle-redeem covenants are intentionally frozen on mainnet at
  `backend/src/covenant_builder.rs:1424-1436` until the non-custodial
  rebuild (player 2-of-2 state channels, k-of-n oracle) lands. This is
  correct fail-closed behavior, not a money-path bug.
- The custodial-testnet money-path stays custodial-testnet-only, per the
  current honesty copy. Custodial flows must not ship to mainnet.

## Method

- Grep + targeted read of `covenant_builder.rs`, `payment_verifier.rs`,
  `crawler.rs`, oracle key handling, and the frontend ZK claim panel.
- Cross-checked against existing memory notes
  (`covex-moneypath-csp-design-2026-06-18`,
  `covex-oracle-key-failclosed-2026-06-16`,
  `covex-backend-tests-and-zk-verify-2026-06-16`).
