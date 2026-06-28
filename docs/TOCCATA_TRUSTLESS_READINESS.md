# Toccata trustless readiness plan

Date: 2026-06-28. Kaspa Toccata activates on mainnet at DAA 474,165,565 (about 2026-06-30). This is
the single source of truth for what makes Covex a fully trustless covenant creator and display that
connects to any Kaspa oracle, and exactly what is left for mainnet. It is the synthesis of a
seven-lane audit (research, circuits, oracle binding, creator, display, networks, honesty) plus a
positioning and compliance review, all grounded against the live tree.

## Verdict

Covex is honest but not yet fully trustless, and it is conditionally Toccata-ready. It is ready to
ship deterministic-primitive covenants on mainnet day-one (singlesig, hashlock, timelock, rcsv, plus
htlc and multisig once the HTLC sig-op fix is in the deployed binary). It is not ready for any
trustless oracle-attested or on-chain-ZK money path on mainnet, and both are deliberately frozen and
fail-closed. The "connect any oracle" promise is real today for one path only: the
`binary_oracle_select` published-hashlock-reveal model, which needs no Covex key and no custom code.
The signature-cosign path is broken for external resolvers because the spend handler hardcodes the
built-in key, so a bound external key is unspendable today. The KIP-10 deterministic output-binding
covenants that would make money MOVEMENT trustless are still design-only. Net: the trust-by-removal
posture is intact and the fail-closed gates are correct; full trustlessness for decided-outcome
money paths is one build cycle away, and launch is gated on one deploy plus owner env flips, not on
new code.

## Network readiness matrix

| Network | Node | Covenants | On-chain ZK | Ready? |
|---|---|---|---|---|
| testnet-10 | No local covenant node on the box (17210 closed); reached via a remote node, read-only | All KIPs active; deploys route to the wrong endpoint until a local node exists | KIP-16 active; never verified live | Partial, read-only (owner provisions a local node for parity) |
| testnet-12 | `kaspad-tn12.service` active, at tip, fresh | All kinds deploy on the dev-wallet path; no mainnet freezes on testnet | `zk_game_settle` lock side wired; `deploy_zk_settlement` returns success:false (verify side unwired) | Ready for covenant + gated ZK testing; ZK settle e2e is the gap |
| mainnet | `covex-kaspad-mainnet.service` active, v2.0.0 Toccata-ready, at tip; activation DAA about 2 days out | All deploys refused until `COVEX_MAINNET_COVENANTS_ENABLED=true` (default off). Day-one scope = deterministic primitives only; GATE 2 freezes all oracle kinds | `zk_precompile_deploy_allowed()` rejects every mainnet network; ZK cannot deploy on mainnet (correct fail-closed) | Not ready until the fund-loss-fixed binary is deployed and the owner flips the gate post-fork |

## Prioritized actions

Severity P0 (launch-blocking) to P3 (hygiene). "Owner" means it cannot be done autonomously
(requires keys, node ops, env flips, or counsel).

1. P0, mainnet, AGENT. Deploy `origin/master` to prod. Prod is behind master; the gap includes the
   HTLC `sig_op_count` fund-loss fix (`WrongSigOpCount` would brick every HTLC spend once mainnet
   covenants enable). Backend build-and-swap on the prod box, restart, verify `/api/status`
   git_commit matches HEAD. No env or money-path change. Hard pre-flight for Toccata since htlc is a
   day-one primitive.
2. P1, all, AGENT. Strip forbidden external-oracle product names from `TRUSTLESS_RESOLUTION.md` and
   neutralize the one in the circuits audit report. DONE this session (see status).
3. P1, testnet, AGENT. Resolve the on-chain-ZK honesty contradiction: the backend ships the KIP-16
   `zk_game_settle` kind, but the frontend still states there is no chain-enforced ZK tier. Add an
   `OnChainZk` enforcement reality end to end (backend enum + catalog re-tag, frontend badge and
   scoped copy), kept explicitly testnet-gated so it never reads mainnet-live.
4. P1, all, AGENT. Publish the provider-agnostic oracle-connection formula (DONE,
   `docs/CONNECTING_AN_ORACLE.md`) and gate the misleading cosign UI: restrict the External resolver
   key field to `*_refundable` kinds and state that external cosign is not yet wired, so a creator
   binding an external key is not led into a non-spendable branch.
5. P2, testnet, AGENT. Give `zk_game_settle` an offline-claim path in the cold-recovery redeemer
   (matrix entry + satisfier + golden fixture) so the most trustless kind is not the least
   recoverable.
6. P2, all, AGENT. Implement KIP-10 deterministic output-binding covenants (WinnerTakesAllBound,
   EscrowBound) using `OpTxOutputCount`/`OpTxOutputAmount`/`OpTxOutputSpk`. This is the missing piece
   that makes money MOVEMENT trustless without an oracle. KIP-10 is Crescendo-live, so a dust-value
   mainnet pass is possible. Ship with a negative e2e: a skim/redirect spend MUST be consensus
   rejected.
7. P2, all, AGENT. Add a key-free, recomputable `request_id` and a deterministic external-cosign
   endpoint (`prepare` returns the sighash, `submit-external` ingests the resolver's BIP340 sig).
   This is what makes the signature-cosign path genuinely connect-any-oracle. Mandate `*_refundable`
   bindings so resolver silence cannot freeze funds.
8. P3, mainnet, AGENT. Reconcile `docs/MAINNET_COVENANT_EXAMPLES.md` with the live freeze. DONE this
   session.
9. P3, all, AGENT. Surface "verify this covenant yourself" from the explorer list, and show the
   request_id and bound resolver pubkey with a match/mismatch indicator against the covenant's own
   committed key.
10. P3, all, AGENT. Circuit registry honesty: downgrade the two over-labeled circuits that claim a
    served zkey they do not have, commit missing circom sources, constrain the dangling comparator.
11. P1, mainnet, OWNER. Confirm the mainnet node's configured Toccata activation DAA equals
    474,165,565, then post-fork flip `COVEX_MAINNET_COVENANTS_ENABLED=true` and set the real
    `COVENANT_TREASURY_ADDRESS`. Deterministic primitives go live; oracle and ZK stay frozen.
12. P2, testnet, OWNER. Provide a prover box plus TN12 liveness to wire `deploy_zk_settlement` to
    success and prove a full lock to on-chain-verify to winner-spend cycle. Decide whether to
    provision a local covenant-enabled TN10 node or accept TN10 read-only.

## Toccata-today checklist

Agent-doable (next 24 to 48h):
- Deploy `origin/master` to prod and verify git_commit (rank 1, lands the HTLC fund-loss fix).
- Strip product names from the docs and re-run the em-dash gate (rank 2). DONE.
- Add the `OnChainZk` reality end to end and scope the false "no chain-enforced ZK" copy (rank 3).
- Publish the oracle-connection formula and gate the cosign UI (rank 4). Doc DONE; UI gate pending.
- Add the `zk_game_settle` offline-claim path (rank 5).
- Reconcile the mainnet examples doc (rank 8). DONE.
- Local dry-run of the mainnet env validation with the real treasury, before any owner flip.
- Write the launch-day env-flip and rollback runbook.

Owner-gated:
- Confirm the configured Toccata activation DAA equals 474,165,565 against the v2.0.0 release notes.
- On launch day, after the fork DAA passes and the rank-1 deploy is live, flip
  `COVEX_MAINNET_COVENANTS_ENABLED=true` and set the real treasury address, then restart the backend.
- Decide TN10 launch scope (provision a local covenant node or accept read-only).
- Provide the prover box plus TN12 liveness to prove the on-chain-ZK settle e2e before mainnet.
- Trim the root volume before mainnet indexing grows it.

## The two product dependencies that close "fully trustless"

1. Trustless money MOVEMENT: KIP-10 output binding (rank 6). Today a covenant proves who may spend,
   not that the spend pays the right amount to the right recipient. Output binding makes the payout
   itself a chain-checkable fact.
2. Connect-any-oracle by signature: the external-cosign endpoint plus the key-free request_id
   (rank 7). Until then the only zero-custom-code oracle path is the hashlock reveal in
   `docs/CONNECTING_AN_ORACLE.md`.

## Related documents

- `docs/CONNECTING_AN_ORACLE.md` - the provider-agnostic oracle-connection formula.
- `docs/GAMBLING_DEEMPHASIS_AND_COMPLIANCE.md` - the positioning change and the counsel-required items.
- `docs/ZK_ONCHAIN_PLAN.md`, `docs/zk_precompile_abi.md` - the KIP-16 on-chain ZK path and ABI.
- `MAINNET.md`, `LAUNCH_CHECKLIST.md` - the operational launch gates.
