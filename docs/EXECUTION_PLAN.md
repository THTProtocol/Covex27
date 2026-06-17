# Covex — Final Execution Plan (do 1-by-1)

Goal: a 100% finished product — **fully trustless on every surface**, **all ZK circuits genuinely
usable**, mainnet-ready for Toccata, and a **visually godlike** UI as the grand finale. We execute
one numbered step at a time; each step ends in a deploy + a live verification before moving on.

Status legend: ☐ todo · ◐ in progress · ☑ done+verified

---

## PHASE 1 — Finish trustlessness (no decorative deploys anywhere)
The primary `/deploy` is already the trustless P2SH flow (done). Close the rest.

- **1.1 ☑ Migrate `/premium` (PremiumBuilder) to enforced P2SH.** DONE (commit 3fea2d5). The deploy
  now calls `POST /api/covenant/p2sh/deploy` (singlesig/timelock/hashlock), locking the stake in a
  real script-enforced covenant keyed at `<tx>:0`, with the premium custom UI + metadata layered on
  top via `terminal-config` (ownership-signed). Honest mainnet gate (wallet-side funding coming
  soon). *Verified live:* shipped bundle calls p2sh/deploy (decorative sign-and-broadcast removed);
  live endpoint minted a real on-chain covenant (0.2 KAS locked to P2SH on TN12) that renders
  `enforcement_reality: on-chain`, spendable, with the redeem script published for trustless
  recovery; `/premium` runs commit 3fea2d5 with a clean console.
- **1.2 ☑ Migrate `/deploy/paid` (PaidDeploy) to enforced P2SH.** DONE (commit c3756b2). The deploy
  locks the stake in a real enforced P2SH covenant (singlesig/timelock/hashlock) keyed at `<tx>:0`;
  the authored SilverScript is attached as declared logic + the pasted UI as interface via
  `terminal-config` (ownership-signed); honest mainnet gate. *Verified:* shipped bundle calls
  p2sh/deploy (decorative sign-and-broadcast removed), enforcement label present, `/deploy/paid`
  loads clean on commit c3756b2.
- **1.3 ☑ Remove the orphaned decorative `Deploy.jsx`** DONE (commit afa87c0). Deleted the file +
  the unused lazy import in App.jsx; `/deploy` still redirects to `/deploy/enforced`. DesignStudio
  kept (used by CovenantFix). *Verified:* build clean, no `Deploy` chunk emitted, no dead refs.
- **1.4 ☑ Extend non-custodial signing to the multi-party kinds** (multisig, HTLC, channel). DONE
  (commits 557d810 backend + 8290a0b frontend). prepare-spend sets per-kind sig_op_count/lock_time
  (committed in the sighash, mirroring the proven custodial handler), parses member pubkeys, and
  returns required_signers + branch + needs_preimage; submit-signed assembles the satisfier from
  client-supplied `signatures[]` (byte-identical to the custodial builders). HTLC/channel get
  client-side branch selection (claim/refund, close/refund). The frontend interaction panel drives
  it (co-signer signature paste). oracle_enforced/oracle_escrow stay on /oracle-payout by design.
  *Verified:* engine tests (valid + forgery-rejected for all 3 kinds) against the real TxScriptEngine;
  live multisig prepare-spend returns 2 required_signers + sighash; live HTLC claim/refund return the
  right signer/preimage/branch. Multi-party satisfier bytes == the on-chain-proven custodial path.
- **1.5 ◐ On-chain hashlock/timelock non-custodial e2e.** Substantially covered: the single-signer
  non-custodial path (which hashlock & timelock use) is already PROVEN on-chain (prior-session
  singlesig spend 1bfe7172, key never sent), and the hashlock-preimage / timelock-lock_time satisfier
  extras are engine-proven. TN12 is mining again (deploys this session confirmed; prepare-spend found
  their UTXOs). Remaining gap: a fresh browser-key spend of a hashlock and a timelock specifically -
  low-risk and operational (needs a faucet-funded CLIENT-side key, since the dev keys are server-side).
  Tracked as a low-priority follow-up, not a blocker.
- **1.6 ☑ Decommission the legacy decorative deploy path.** SATISFIED by the 1.1-1.3 migrations +
  existing B6 gating. No deploy surface calls `/api/sign-and-broadcast` anymore (paid builders
  migrated, Deploy.jsx deleted); its only remaining caller is dev-wallet *tier payments*
  (`WalletContext.sendPayment`), a legitimate real-payment rail. Any covenant-like record it creates
  is honestly labeled `decorative` (metadata-only) by `reality_for_script` and refused on mainnet
  unless `acknowledge_unenforced:true`. *Verified:* grep shows zero deploy-surface callers.

## PHASE 2 — ZK, repositioned to its HONEST role (a real v2 — AFTER mainnet + visuals)
**Reframe (per the user, 2026-06-15):** Kaspa has no pairing precompile, so the chain CANNOT verify a
SNARK on-chain at Toccata. So **script enforcement is the trustless layer; ZK lives INSIDE the
oracle-attested tier** (the proof is checked OFF-chain by the oracle, which then signs). ZK is NOT
dropped — it is a genuinely good feature, labeled + sequenced honestly. Real jobs: **privacy** (prove
a fact without revealing the data), **succinct verification of off-chain work**, and the powerful one,
**shrinking the oracle** (require a valid proof BEFORE the oracle signs → "trust the oracle to be
honest" becomes "trust it to be live + the math valid"). ZK can NEVER make a covenant
trustless/on-chain on Kaspa, so the honest label is **"oracle-attested + ZK-private," never "full-zk /
trustless / on-chain."** **This phase ships as a v2 AFTER mainnet + the visual finale — it does NOT
take the pre-Toccata slot.** Only 2.1 (the relabel) is in-scope NOW, inside the trust/legal honesty pass.

- **2.1 ☐ Serve the verified circuits' artifacts** (`<c>.wasm` + `<c>_final.zkey` + `<c>_vkey.json`)
  under `frontend/public/zk/<c>/`, and commit them (un-ignore like merkle/range — they're public
  verifier data + small). *Verify:* the zkey URL 200s.
- **2.2 ☐ Per-circuit in-browser prover UIs**, one at a time, mirroring the merkle prover
  (`snarkjs.fullProve(input, wasm, zkey)`). Reference inputs live in `zk/prove_*.js`. Order:
  basic_utxo_ownership → relative_timelock → age_verification → escrow_2party → range_proof → the
  rest. Add `@noble`/circomlibjs Poseidon in-browser where the input needs it. *Verify per circuit:*
  generate a real proof in-browser → oracle verifies + signs → label is honest.
- **2.3 ☐ Fix `range_proof`'s broken in-browser prover** (MiMC7 commitment mismatch) — use the
  circuit's own hasher output, drop `mimc_test.wasm`. *Verify:* a real range proof verifies.
- **2.4 ☐ (v2) The "shrinking oracle" wiring:** make the oracle REQUIRE a valid ZK proof before it
  co-signs the outcome — the genuine trust-minimization ZK earns. NEVER promote anything to "full-zk /
  trustless / on-chain"; the strongest honest label stays "oracle-attested + ZK-private." Keep only the
  ~6 Kaspa-essential circuits real (merkle/range/timelock/utxo-ownership/pot_split/escrow_2party); kill
  or clearly mark the ~37 costume circuits (prebaked proof + vkey, no real proving key).

## PHASE 3 — Mainnet readiness (Toccata, 2026 window)
- **3.1 ☑ Wallet-funded enforced deploy on mainnet.** DONE (commits 2038b3d backend + 8bce0ae
  frontend). New `prepare-deploy`/`submit-deploy`: the server builds the unsigned funding tx (locks
  the stake to the P2SH + aa20+redeem payload) and returns its sighash; the wallet signs it
  in-browser; submit-deploy assembles the P2PK `push65(sig)`, broadcasts, and indexes at `<tx>:0`.
  No key is sent, so the single-signer kinds (singlesig/hashlock/timelock) deploy non-custodially on
  mainnet too (gated behind COVEX_MAINNET_COVENANTS_ENABLED until Toccata, surfaced honestly). The
  "coming soon" banner is gone. *Verified:* engine test (funding spend valid + forgery rejected);
  live prepare-deploy builds the funding tx from real UTXOs; live submit-deploy assembled + broadcast
  to the node (bogus sig rejected by consensus, proving the full path); mainnet refused pre-Toccata;
  page renders clean. (A valid-sig broadcast needs a faucet-funded client-side key - inherent test
  limit; the funding tx == the on-chain-proven custodial deploy + a standard engine-proven P2PK spend.)
- **3.2 ◐ GATE 1 hardening before flipping `COVEX_MAINNET_COVENANTS_ENABLED`.** Mostly done already:
  oracle `/verify-and-sign` auth (✓ task #42), frozen-watermark + tip-liveness watchdogs (✓ #46/#47),
  resolver failover (✓), gate-flip path tested (✓ #49). Remaining: indexer HA (the single WSL mainnet
  node is a SPOF - operational, needs a 2nd node), and an explicit anti-replay review of signed
  outcomes (on-chain oracle payouts are already UTXO-replay-protected).
- **3.3 ☑ Backups.** DONE + verified (commit 72906f6). FOUND + FIXED a real bug: nightly backups had
  FAILED since 2026-06-14 because backup-covex.sh still pointed at the pre-move DB path. Now DB_PATH=
  `/opt/covex-db/covex.db`, BACKUP_ROOT on the data volume (cross-device from the live DB); backup +
  weekly restore-drill both PASS (70,247 covenants restored), paths baked into the service units +
  installer. **Remaining (needs operator creds):** sync `/mnt/.../covex-backups` OFF-BOX (rclone/S3)
  so a full-box loss is survivable - the config tarball already supports a bare-metal rebuild.

## PHASE 4 — THE VISUAL PERFECTION PASS (godlike — the finale)
Only after 1–3. Done with a live see-change-see loop (browser screenshots each step). The north
star: **perfect spacing, perfect rhythm, premium depth, flawless light+dark, buttery motion.**

- **4.1 ◐ Lock the design system.** In progress. The audit FOUND + FIXED a real launch bug: the
  service worker (sw.js) served a stale `index.html` after every deploy, so users never saw updates
  (commit a1388d4 - now network-first shell, cache-first immutable assets, cache rotated). Remaining:
  spacing-scale/token de-dupe pass.
- **4.2 ◐ Explorer / landing.** First pass shipped (commit 4d5057c): covenant cards decluttered (the
  cramped 4-field footer → a quiet `creator · date` line + a prominent `View →`), more breathing room
  under the description, more hero top padding + heading spacing. Verified live. Remaining: activity
  ticker density, deeper card-elevation/hover polish if desired.
- **4.3 ◐ Covenant detail page.** FIXED a contradictory trust banner (commit 13258e2): a singlesig
  P2SH covenant showed "ON-CHAIN ENFORCED" AND a red "DANGER / UNVERIFIED COVENANT". Now three honest
  states - VERIFIED (paid, green), ON-CHAIN ENFORCED (consensus, emerald positive), or "Metadata only
  - not consensus-enforced" (amber, only for covenants the chain does NOT enforce). Verified live.
  Remaining (flagged as a spawned task): the right-panel iframe still shows the same legacy
  "DANGEROUS/UNVERIFIED" text from stored EXPLORER-tier UI blobs (backend regen / stop rendering
  auto-blobs as creator-published).
- **4.4 ☐ Deploy (enforced) flow.** The kind picker, forms, the "interact with any covenant" panel —
  aligned, breathing, premium.
- **4.5 ☐ Game arenas.** Board framing, clocks, pot UI — chess.com-tier polish, consistent.
- **4.6 ☐ Chrome: nav, wallet modal, footer, toasts, modals.** Consistent paddings, focus rings,
  motion.
- **4.7 ◐ Light + dark parity + responsive/mobile.** Light mode spot-checked live on the landing
  (commit-current): clean white surface, hero gradient holds, decluttered card footer + tier-tinted
  card backgrounds carry over - solid parity, no glaring issues (builds on prior light-mode work,
  tasks #11/#48). Remaining: per-page light sweep on detail/deploy/games + a mobile-width pass.
- **4.8 ☐ Final QA sweep** with full-page screenshots of every route, in both themes.

---

### How we run it
We do these strictly in order, one numbered item per round: I implement → deploy → verify live →
show you the result → you say "next". Phase 4 is intentionally last so the godlike visual pass sits
on top of a finished, trustless, fully-working product (no re-work).

**Recommended start: 1.1 (migrate /premium to enforced P2SH)** — highest leverage for "everything
trustless".
