# Covex God-Mode Loop Closeout - 2026-06-19

Six-round god-mode loop. Single-day execution, architect-blessed waves,
verify-until-pass per round, hot files (`Markets.jsx`, `App.jsx`,
`covenant_builder.rs`) protected after round 3 to avoid concurrent-committer
collisions.

## 1. What shipped (commits, oldest -> newest)

Round 1 (unification + mainnet honesty + premium hero):

- `d58d35d` ux+content: one coherent covenant-build flow + mainnet README + About page
- `c62cc4d` fix(explorer): route address search to creator lookup, not txid
- `c06d59c` polish(builder): every starter template leads with the premium HeroImage banner
- `49ae991` fix(ui+content): rich catalog cards + dead-link/copy fixes from the audit
- `2fa0977` fix(payment): QR uses the full valid address so scanned payments go through
- `cd24a46` mainnet-only: remove all testnet mentions from the UI (0 remaining)
- `c223929` fix(recovery): make the fund-recovery scan work on testnet-12 (the live network)
- `211f8fd` design: round 1 polish, substantial value
- `6b71258` fix(links+payment): dead KSPR/community links + network-aware upgrade treasury
- `46fa78c` restore tn10 + tn12 as user-selectable networks for testing

Round 2 (enforcement-copy SoT + tour + sticky rail + perf + money path):

- `b0dd39b` money path: non-custodial binary_oracle_select winner-only spend
- `8ef312f` money path: UTXO-bind the oracle payout session (reorg/double-spend safe)
- `09d8842` money path: persist oracle payout sessions across restart (keystone ii)
- `086d00a` design: round 2 polish, substantial value
- `e62b936` perf: index-backed covenant sort + custom-ui cache + larger pool
- `63d46d7` docs: mainnet architecture diagrams in the README (Toccata-active)
- `467517a` design: in-flight round 3 polish (Badge, index.css tokens, Explorer, Stats)
- `c8b4e66` ux: unified 5-step covenant build flow + tools palette + first-covenant tour
- `00ce19e` ux+honesty: enforcement-copy helper, first-visit teach, sticky action rail, perf prune
- `7faad2e` ux: round 2 adversarial fixes

Round 3 (markets remake + wallet UX + docs cohesion + pricing honesty):

- `64d104c` feat(redeemer): client-side covenant claim core (claim even if Covex is down)
- `952d351` feat(channel): non-custodial 2-of-2 state channel for games
- `de156cf` feat(cold-recovery): self-contained offline covenant claim tool + guide
- `c41409d` feat(claim): wire in-browser claim into Recover + fail-closed signer binding + kit v2
- `07fbf98` fix(create): no default covenant selection (do not default to prediction markets)
- `e02bf9e` ux: premium polish over unified build flow + adversarial fixes
- `f0d55f3` feat(resolve): smart-resolve endpoint (KNS .kas in search) + llms.txt for AI
- `6d0c6ba` feat(ux): KNS .kas search + copy/click/share usability across the explorer
- `b3b5213` fix(api): balance the OpenAPI JSON for the /resolve path (build break)
- `2f83f86` test: BuildStepsRail unit test
- `7b15120` money path: non-custodial game pot (lock-pot prepares unsigned tx, submit-pot broadcasts player1-signed)
- `0de29c6` ux+honesty: markets remake, wallet UX, docs cohesion, treasury/stats, pricing honesty, mobile/a11y
- `2a449e1` ux: round 3 adversarial fixes + T16 audit
- `57a1133` ci+docs: add payment_just_confirmed honesty gate + update round 3 audit reports

Round 4 (4-vs-15 chain-enforced ZK split + recovery kit + money-path audit):

- `8a6c59f` honesty: 4-vs-15 chain-enforced ZK split + recoverykit + games sweep
- `79d9d10` honesty: round 4 adversarial fixes + audit reports
- `646c95b` honesty: backend wire label propagates full-zk-chain / full-zk reality

Round 5 (light parity + first backend money-path tests + mainnet env gate):

- `63e999f` honesty+coverage: terms/privacy light parity, games/signer tests, mainnet env gate, vitest journeys
- `730f187` honesty: round 5 adversarial fixes (ZK panel + Treasury + signer test + circuit-catalog honesty test, em-dash gate clean)

Round 6 (launch checklist + drift + consistency audits, final adversarial):

- `7565350` round 6 final: launch checklist + drift + consistency audits + adversarial fixes

## 2. What stayed honest

- `frontend/src/lib/enforcement-copy.js` is the single source of truth for
  enforcement labels and per-circuit honesty copy. `TrustBadge`, ZK panel,
  Markets, EnforcedDeploy success, Whitepaper section 4 and Readme primitive
  table all read from the helper. An em-dash byte-match gate
  (`LC_ALL=C` grep in `scripts/ci-local.sh`) blocks regressions.
- The 4-vs-15 chain-enforced ZK carve-out is real and derived, not magic
  numbered. `circuits.js` exports `CHAIN_ENFORCED_ZK` and `VERIFIED_FULL_ZK`;
  `enforcement-copy.test.js` asserts the Whitepaper and Readme counts match
  the set sizes. The backend wire-label (`full-zk-chain` vs `full-zk`)
  propagates the same distinction end-to-end (commit `646c95b`).
- No money-path refactor shipped without security-auditor sign-off. The
  three money-path commits in round 2 (`b0dd39b`, `8ef312f`, `09d8842`) and
  the channel + game-pot commits in round 3 (`952d351`, `7b15120`) each
  passed an explicit auditor agent gate before push. Round 4 ran a
  read-only money-path audit (`docs/reports/MONEY_PATH_AUDIT_2026-06-19_ROUND4.md`)
  and recorded `p0_money_path_findings = []` honestly, not as a victory lap
  but as the result of that specific pass.
- Hot files (`Markets.jsx`, `App.jsx`, `covenant_builder.rs`) were placed off
  limits starting round 4 because they had concurrent committers; this kept
  the loop from racing against the human owner's edits.

## 3. What is deferred to a future loop

From the round plans (`covex-round*-plan-2026-06-19.md`):

- Round 2: full Markets premium remake (landed partially in round 3 but the
  premium-remake brief was a round 2 stretch goal).
- Round 5 explicit deferrals to round 6 (carried, partially landed): full
  Playwright e2e, Lighthouse baseline + image lazy-load pass, marketing
  vague-verb sweep across all pages.
- Round 6 read-only findings deliberately recorded as findings rather than
  fixes:
  - 14 `<img>` tags without `loading="lazy"` across 8 files.
  - `WalletButton.jsx` has zero `focus-visible:ring` selectors.
  - 17 hand-rolled height values in `CovenantStudio.jsx`.
  - 30 ad-hoc `animate-pulse`/`animate-spin` callsites; no shared `Skeleton`
    primitive in `components/ui/`.
  - 5 files use inline `#hex` colors (Sandbox, FullScreenReversi,
    FullScreenPoker, FullScreenBlackjack, CovenantEmbed); classification of
    legit game tint vs brand drift not done.
  - Two `.claude/worktrees/agent-*` directories were not entered for the
    consistency audits.
- Architect honest caveats never closed: `Markets.jsx`, `Recover.jsx`,
  `EnforcedDeploy.jsx` bodies and `CovenantStudio` lines 100-962 were never
  fully read inside this loop (only line counts and grep hits).
- Full playwright/cypress harness still not present (`vitest` journeys are
  the honest first step, per round 5 plan).
- The full Toccata covenant mainnet readiness sequence (next section) is
  owner-gated and not addressable from inside the loop.

## 4. What the owner needs to do for June 30 mainnet

See `LAUNCH_CHECKLIST.md` at the repo root for the full ordered list.
Summary of the four blockers it documents:

1. External: build and run a covenant-enabled kaspad with mainnet ENABLED.
   The Toccata fork hard-disables mainnet at `args.rs:204`; no mainnet wRPC
   endpoint exists for the backend to read until that flips.
2. Flag: `COVEX_MAINNET_COVENANTS_ENABLED=true` is off in production. Until
   set, the mainnet crawler short-circuits and `mainnet_ready` is false.
3. Secret: `COVEX_ORACLE_KEY` must be set in the mainnet-indexer process
   env. `main.rs:64-72` hard-exits on boot if `KASPA_WRPC_URL_MAINNET` is
   set and `COVEX_ORACLE_KEY` is not.
4. Intentional code freeze: `covenant_builder.rs:1424-1436` (GATE 2)
   refuses every `oracle*` redeem kind on mainnet until the non-custodial
   rebuild lands. On June 30 mainnet supports singlesig, hashlock, timelock,
   multisig, htlc only.

## 5. Honest uncertainty

Tests that still are not there:

- No Playwright or Cypress; only Vitest component journeys plus three new
  cargo tests (`games::`, `signer::`, `circuit-catalog`). The non-custodial
  game-pot and 2-of-2 state-channel money path has unit coverage for the
  rejection edges only; happy-path settlement on a real testnet is still
  manual-only.
- `signer.rs` got three fail-closed mainnet regression tests; the full
  761-LOC surface is otherwise uncovered.
- No backend property tests, no fuzzing of `covenant_builder.rs`, no
  reorg-injection harness for the persisted-oracle-session path
  (`09d8842`).
- No load test of the index-backed covenant sort and custom-ui cache
  (`e62b936`).
- No accessibility automated test (axe/pa11y); a11y work was hand-audited.

Audits that have not been performed end-to-end on real mainnet:

- Zero mainnet covenant indexing has happened; the indexer has never seen a
  mainnet block in covenant mode. Every "mainnet" claim is therefore code +
  testnet-12 evidence, not live mainnet evidence.
- The money-path audit in round 4 was read-only and did not include a real
  on-chain redeem on mainnet. Custodial-testnet-only flows have NOT been
  re-proven on mainnet (and per the LAUNCH_CHECKLIST they MUST NOT ship to
  mainnet).
- Oracle co-sign keystone has been live on testnet-12 but never had a real
  mainnet adversarial test. The 2-of-2 state-channel money path
  (`952d351`) has not been tried against a hostile counterparty.
- No third-party security audit of the round-2/round-3 money-path commits.
  Sign-off was an in-house `covex-security-auditor` agent, not Trail of
  Bits or equivalent.
- Lighthouse / Core Web Vitals never run inside the loop; the round-6
  perf pass was static-analysis only.
- The cold-recovery tool (`de156cf`) is shipped but a clean-room recovery
  drill (laptop with no Covex state, redeems a real covenant) has not
  been executed.

Bottom line: the loop closed the honesty drift, landed the non-custodial
money-path foundations, and produced a launch checklist. The remaining gap
to a verified mainnet launch is owner-action plus a real on-mainnet end-to-end
drill, neither of which the loop could do from inside the repo.
