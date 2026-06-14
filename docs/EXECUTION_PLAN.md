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
- **1.3 ☐ Remove the orphaned decorative `Deploy.jsx`** (now unrouted) + its dead visual-builder /
  random-hex paths, and drop the unused lazy import in App.jsx. *Verify:* build clean, no dead refs.
- **1.4 ☐ Extend non-custodial signing to the multi-party kinds** (multisig, channel, oracle-escrow):
  prepare/submit collect signatures from each party in the browser (each signs the same sighash);
  HTLC gets branch selection (claim/refund) client-side. *Verify:* e2e non-custodial redeem of a
  2-of-2 on TN12, no key on the server.
- **1.5 ☐ Complete the on-chain hashlock/timelock non-custodial e2e** (was blocked by sparse TN12
  mining): deploy + redeem each once TN12 mines. *Verify:* spend tx confirmed on-chain.
- **1.6 ☐ Decommission the legacy decorative backend path** (`signer.rs` sign-and-broadcast) or keep
  it only behind `acknowledge_unenforced` for non-covenant markers. *Verify:* no UI reaches it.

## PHASE 2 — ZK circuits genuinely usable in the browser
37 circuits have live, verified proving keys (done). Make each provable from a user's browser.

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
- **2.4 ☐ Promote each circuit to `full-zk` in `VERIFIED_FULL_ZK`** ONLY after 2.2 verifies it. Keep
  labels honest until then.

## PHASE 3 — Mainnet readiness (Toccata, June 30)
- **3.1 ☐ Wallet-funded enforced deploy on mainnet** (today the enforced deploy says "coming soon" on
  mainnet because it needs a wallet-funded prepare/submit, not the dev key). Build the funding
  prepare→sign→submit so mainnet deploys are non-custodial end to end.
- **3.2 ☐ GATE 1 hardening before flipping `COVEX_MAINNET_COVENANTS_ENABLED`:** indexer HA on the
  mainnet node, auth on `/oracle/verify-and-sign`, anti-replay nonce on signed outcomes.
- **3.3 ☐ Pre-launch checklist + off-site covex.db backups.**

## PHASE 4 — THE VISUAL PERFECTION PASS (godlike — the finale)
Only after 1–3. Done with a live see-change-see loop (browser screenshots each step). The north
star: **perfect spacing, perfect rhythm, premium depth, flawless light+dark, buttery motion.**

- **4.1 ☐ Lock the design system.** One spacing scale (4/8px rhythm), one type ramp, tokenized
  colors/shadows/radii. Audit + de-dupe the CSS (e.g. duplicate `::selection`). Everything derives
  from tokens so spacing is consistent everywhere.
- **4.2 ☐ Explorer / landing.** Hero proportions, generous whitespace, a refined covenant-card with
  consistent padding/elevation/hover, perfect grid gutters, a real "value locked" hero stat.
- **4.3 ☐ Covenant detail page.** Lifecycle timeline, trust badge, interact panel, background-image
  treatment — spacing + hierarchy perfected.
- **4.4 ☐ Deploy (enforced) flow.** The kind picker, forms, the "interact with any covenant" panel —
  aligned, breathing, premium.
- **4.5 ☐ Game arenas.** Board framing, clocks, pot UI — chess.com-tier polish, consistent.
- **4.6 ☐ Chrome: nav, wallet modal, footer, toasts, modals.** Consistent paddings, focus rings,
  motion.
- **4.7 ☐ Light + dark parity + responsive/mobile** — every page perfect in both themes and at every
  width.
- **4.8 ☐ Final QA sweep** with full-page screenshots of every route, in both themes.

---

### How we run it
We do these strictly in order, one numbered item per round: I implement → deploy → verify live →
show you the result → you say "next". Phase 4 is intentionally last so the godlike visual pass sits
on top of a finished, trustless, fully-working product (no re-work).

**Recommended start: 1.1 (migrate /premium to enforced P2SH)** — highest leverage for "everything
trustless".
