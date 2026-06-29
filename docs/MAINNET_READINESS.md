# Covex Mainnet Readiness Report

_Last updated: 2026-06-29 (Toccata mainnet activation DAA 474,165,565, ~2026-06-30)._

This report is the honest, evidence-based assessment of Covex's readiness for the Toccata
mainnet activation. It is the output of a strict, adversarial **rate -> fix -> re-rate**
program: three independent 10-dimension reviews (each with read-only reviewers scoring
1-10 against the live site and the codebase, plus a synthesis), interleaved with ~15
verified fix waves. Money-path changes were adversarially security-reviewed before deploy.

## Executive summary

Covex is a **genuinely strong, honesty-disciplined Kaspa covenant protocol**. Across three
strict rounds the panels found **no fund-drain, no forgery, and no mainnet key-leak**. The
money path is hardened in the ways that matter most, and the ZK stack is honest about what
actually verifies. The grade landed in the **B+ / A- band (strict weighted ~7.2-7.9)**; it
intentionally oscillated round to round because each adversarial pass probes a different
slice and a harsh reviewer always finds more polish. What stands between Covex and a perfect
score is **not a security hole** - it is a finite list of truthfulness, readiness, and
code-quality items, plus a set of decisions that are genuinely the owner's and licensed
counsel's to make.

**Recommendation: Covex is conditionally mainnet-ready on a trust-by-removal basis** - ship
the deterministic, consensus-enforced primitives for real value on day one, and keep the
oracle / full-zk / on-chain-ZK kinds frozen and fail-closed until their owner-gated
prerequisites (below) are met.

## What is verified solid (the keystones)

- **Money path (consensus-enforced where it counts).** `is_mainnet()` is the single source
  of truth across every gate (request-driven and startup); raw mainnet private keys are
  refused on every custodial path; the oracle refuses to co-sign attested/on-chain outcomes
  and refuses to co-sign a covenant bound to a non-Covex resolver key; game winners are
  re-derived from server-side replay; the global H4 covenant-binding gate is fail-closed by
  default. Mainnet covenants are gated OFF by default (`COVEX_MAINNET_COVENANTS_ENABLED`).
- **ZK correctness + honesty.** The served circuits exactly match the registry / frontend /
  backend sets with no overclaim; 26 circuits are provable real Groth16 (fail-closed), each
  with accept / tamper-reject / false-predicate evidence; the catalog is honest that the
  broader set are buildable previews, not all proven.
- **Design, mobile, and light-mode.** Premium, consistent, AA-checked on money/game surfaces.
- **CI discipline.** `cargo fmt`, `cargo clippy`, and `eslint` are all blocking on a clean
  tree; a server pre-push hook re-runs the gates; the gate file's comments now match reality.
- **Performance.** Homepage critical-path transfer ~905KB -> ~222KB gzipped (lucide barrel
  deferred off the homepage; the 11.5MB kaspa wasm now served gzipped at 4.3MB).

## Mainnet day-one scope (trust by removal)

Deploy for **real value** on day one is limited to the deterministic, consensus-enforced
primitives: **singlesig, hashlock (Blake2b), absolute timelock (CLTV), relative timelock
(CSV), HTLC, and N-of-M multisig.** These need no off-chain party - the chain is the referee.

**Frozen and fail-closed on mainnet until post-Toccata** (and honestly labeled as such in the
UI and docs): oracle-attested kinds, off-chain-verified full-zk kinds, and the KIP-10
output-bound / KIP-16 on-chain-ZK kinds (gated behind `COVEX_KIP10_BOUND_ENABLED` /
`zk_precompile_deploy_allowed`, default off).

## Honest owner / counsel-gated remainder (the launch checklist)

These are NOT autonomously fixable. They are the real gating items for an unconditional launch:

1. **Legal / compliance (licensed counsel + owner).** Covex hosts the UI, holds a games
   co-sign key, and takes a treasury fee, and real-KAS parimutuel + staked card games exist.
   Decisions required before relying on those surfaces for real value: gambling / event-contract
   framing for poker / blackjack / markets; an age + jurisdiction gate; the geoblocking and
   OFAC / sanctions-screening posture (the Privacy page currently discloses none); and KYC/AML
   scope. The product copy now carries neutral point-of-bet risk and non-operator language; the
   *mechanism* (geo/age-gate) and the legal posture are counsel's call.
2. **Mainnet activation (owner / ops).** Flip `COVEX_MAINNET_COVENANTS_ENABLED=true`, set
   `CRAWL_START_DAA=474165565`, and configure the real mainnet treasury address + signing
   posture. Keep the gate off until the legal item above is resolved.
3. **Key hygiene (owner).** Two testnet dev mnemonics were committed historically (now removed
   from HEAD + gitignored, but still in git history): treat those testnet wallets as burned and
   confirm they were never reused on mainnet. Rotate any other historically-exposed keys.
4. **Trusted setup (ceremony).** The ZK proving keys are from a single-contributor dev ceremony,
   not an MPC. A production launch that relies on the ZK kinds for real value needs a real MPC
   ceremony; until then those kinds stay frozen/testnet, which the copy states.
5. **Live verification (owner-run).** A live wallet-popup end-to-end test (deploy + redeem a
   real covenant with a real wallet extension on mainnet) has not been run from this environment.
6. **Infra (owner / ops).** Hosted Groth16 prover box for full-game ZK e2e; TN12 node liveness;
   the monitoring alert webhook (`/opt/covex-monitor/alert.env` + the GH `ALERT_WEBHOOK` secret).

## Known agent-doable follow-ups (real, but large; not launch-blocking)

A strict reviewer will keep surfacing these; none is a security hole. Tracked for after launch:
covenant_builder.rs (~12.5k lines) + CovexTerminal.jsx (~5k lines) module splits; a test module
for payment_verifier.rs; a broader poison-safe sweep of the ~106 `.lock().unwrap()` sites;
clippy `-D warnings` once the ~104 advisory warnings are burned down; regeneration of the served
ZK binding samples + a CI prove-and-verify round trip; and the deprecated `advancedChunks` ->
`codeSplitting` Vite migration.

## Closing note on the grade

The strict grade oscillated (B/7.4 -> B+/7.9 -> B/7.2) precisely because adversarial review is
not a stable measurement of a large surface - it is a probe, and each pass digs a different
seam. The constant across all three rounds is the important one: **the fundamentals are sound,
the money path holds, and the remaining work is honesty/readiness polish plus owner-gated
decisions.** That is the honest "highest possible" state for a product whose final marks are
bounded by legal, key-ceremony, and live-mainnet-verification walls that only the owner can clear.
