# Covex Continuation Roadmap — The Best Covenant Platform on Kaspa
_Generated 2026-06-13 from a 10-agent codebase audit across 9 domains. Grounded in the actual repo, not aspiration._

## North-Star Vision

Covex is the place where anyone designs a Kaspa covenant — game, escrow, vesting, prediction — sees it **simulated** before a single KAS is at risk, and deploys it as funds **the chain itself enforces**, not funds the operator promises to release. Every covenant carries an honest, unfakeable **reality label** (on-chain / hybrid / oracle-attested) so trust is shown, never implied. The oracle shrinks over time from "the thing that decides" to a signed liveness-and-dispute helper, while real Schnorr signatures, script-locked custody, and server-authoritative game rules make the verifiable-covenants pitch literally true.

## The Three Foundations (everything else hangs off these)

1. **Real BIP340 Schnorr oracle signature** (was a SHA256 MAC). — **SHIPPED 2026-06-13 ✅**
2. **P2SH / script custody primitive** — funds lock to a script, not back to the deployer.
3. **Server-side game rule engine + GameSpec schema** — the chain/oracle, not the client, decides who won.

Nothing trust-bearing reaches mainnet before its enforcement reality is honestly labeled.

---

## Status as of 2026-06-13 (already shipped + verified on prod)

| Item | What | Verified |
|---|---|---|
| A1 | Oracle emits a real BIP340 Schnorr secp256k1 signature over `sha256("covex-oracle:{id}:{outcome}:{ts}")`; `GET /api/oracle/pubkey` + `oracle_pubkey`/`oracle_scheme` on `/health`; pubkey rides in the unlock witness | ✅ real sig accepted e2e on prod |
| A2 | `compute_payout_handler` verifies the Schnorr sig and **rejects** bad/missing sigs (was `success:true` unconditionally, with a public-value bypass) | ✅ garbage sig rejected on prod |
| A3 | HTML-escape every interpolated field in `buildTransparentCustomUI` (CovenantFix + CovenantInteractive); strict color validation; hero image URL-encoded | ✅ deployed |
| A5 | Removed the `setIsAdvancedUnlocked(true)` payment-failure unlock; gated to testnet only | ✅ deployed |
| Infra | Non-blocking wRPC connect at boot — fixed a startup hang where a down mainnet node wedged `axum::serve` and 502'd prod | ✅ binds in 2s |
| Ops | TN10 kaspad resynced (corrupt consensus DB from a two-process LOCK crash); backend TN10 indexer `connected=true`, scanning | ✅ |

---

## Sequenced Phase Plan

Ordering is driven by hard cross-domain dependencies, not by domain.

### PHASE A — Stop the Bleeding (truth, safety, money-at-risk)
_All S/M, mostly P0. Ship before the Toccata window._

| Item | Area | Effort | Pri | Status |
|---|---|---|---|---|
| A1. Real BIP340 Schnorr sig + `/oracle/pubkey` + `/health` | Oracle | S | P0 | **DONE** |
| A2. `compute_payout` verifies sig, rejects on failure | Oracle | S | P0 | **DONE** |
| A3. HTML-escape `buildTransparentCustomUI` + size cap + ammonia backstop | Custom-UI | S | P0 | **DONE** (escape); size cap/ammonia pending |
| A4. Stop fabricating oracle sigs: delete 3 `simulatedHash` fallbacks; keep `chessZkVerified=false` on failure | Frontend | S | P0 | pending |
| A5. Remove payment-failure `setIsAdvancedUnlocked(true)` | Frontend | S | P0 | **DONE** |
| A6. Gate Simulate-Payment button + "would call real covenant logic" alerts behind `network!=='mainnet'` | Frontend | M | P0 | pending |
| A7. Verifiers fail closed (`verify.js`, `verify_range.js`, `verify_groth16_hybrid.js`); fix `verify_proof_for_circuit` None arm; gate Risc0/Wasm stubs to REJECT | ZK+Oracle | S | P0 | pending |
| A8. Fix `relative_timelock.circom` — make `valid` an output not a free public input (security bug) | ZK | S | P0 | pending |
| A9. Mainnet crawler short-circuit (probe tip, report caught-up while covenants gated off; stop 5M-block walk) | Infra | S | P0 | pending |
| A10. Don't advance scan watermark on `get_block` timeout (remove unconditional `scan_daa=lowest-1`) | Infra | S | P0 | pending |
| A11. App-wide CSP header + CI grep failing build on `allow-same-origin` near user content | Custom-UI | S | P0/P1 | pending |
| A12. Delete 5 dead pages; de-dup ZK_CIRCUIT_TYPES 4x entries; fix Dashboard forced-FREE tier; word→emoji icons | Frontend+Templates | S | P1 | pending |

### PHASE B — Real Custody & Real Crypto (make "enforced" true)

| Item | Area | Effort | Pri |
|---|---|---|---|
| B1. Bind attestations to UTXO outpoint + client nonce + expiry; persist consumed nonces; enforce (anti-replay) | Oracle | M | P0 |
| B2. Cross-origin cookieless sandbox renderer (`sandbox.hightable.pro`, iframe `src` not `srcDoc`, CSP `frame-src`) — structural XSS firewall | Custom-UI | L | P0 |
| B3. **Real P2SH covenant constructor** (`build_p2sh_lock`: aa20+blake2b+0x87, fund Output 0 to script, redeem-spend endpoint) — the custody keystone | Deploy | L | P0 |
| B4. Typed covenant-type registry with `enforcement_reality` field (OnChain/Hybrid/Attested/Decorative); validate body before build | Deploy | L | P0 |
| B5. Script-enforced primitives Kaspa supports today: timelock (CLTV), HTLC/atomic-swap, N-of-M multisig — builders + spend-builders | Deploy | XL | P0 |
| B6. Mainnet reality-gating: reject/acknowledge Attested+Decorative on mainnet; reality badge in all 3 deploy UIs + detail page; remove unconditional "PAID VERIFIED"; block random-payload FREE deploy on mainnet | Deploy+Frontend | M | P0 |
| B7. **GameSpec schema** (shared Rust+TS serde struct); encode 8 existing games as specs | Games | L | P0 |
| B8. **Server-side rule engine** (`game_engine.rs`): validate legality, derive turn, detect terminal state; stop trusting client winner/finished | Games | L | P0 |
| B9. Frozen-tip detection in node_status (`tip_unchanged_since`, `stalled` bool); indexer + payment_verifier report node_status; timeout-bound payment_verifier RPCs | Infra | M | P0/P1 |
| B10. Mix player entropy into poker seed `H(backend‖p1‖p2‖covenant‖hand)` (anti-grind) | Oracle/Games | S | P1 |

### PHASE C — The Studio Comes Alive (IDE, simulator, games, templates)

| Item | Area | Effort | Pri |
|---|---|---|---|
| C1. CodeMirror 6 + SilverScript language mode as single shared `SilverEditor.jsx`; replace 3 textareas | Sandbox | M | P0 |
| C2. Wire live `/api/compile` into paid editor; **kill fake-bytecode fallbacks** (Deploy.jsx random hex; PaidDeploy text-hex); reconcile to ONE dialect (Covex DSL) | Sandbox | M×2 | P0 |
| C3. Forward-tailing crawler rewrite: 2-column state (`forward_daa` monotonic + `backfill_floor`); bounded resumable backfill | Infra | L | P0/P1 |
| C4. Data-driven `<GameBoard>` + generic `FullScreenGame` shell; migrate 8 games; delete ~2500 lines dup | Games | L | P1 |
| C5. Enrich `/api/compile`: AST + opcode disassembly + line/col diagnostics; silverc availability probe; cache by source-hash | Sandbox | L | P1 |
| C6. **Covenant execution simulator** `POST /api/simulate` (apply spend → pass/fail + opcode trace + introspection) | Sandbox | XL | P1 |
| C7. Real VRF/randomness beacon (ECVRF or drand) for all games + commit-reveal hardening; shared randomness module | Oracle/Games | L | P1 |
| C8. Presets actually change layout+density (wire dead `layout`/`mood` → render; emit `tokens` CovenantPreview already consumes) | Templates | M | P0 |
| C9. Covenant-aware live Puck blocks (countdown, on-chain stat, QR, payout table, oracle badge, leaderboard, chart) | Templates | L | P0 |
| C10. Couple templates to full page design (puckData+preset); expand 12→30+ (vesting/vault/auction/airdrop/DAO); consolidate 3 template surfaces + 2 render engines into one | Templates | L×3 | P0/P1 |
| C11. Constrained API bridge (typed allowlisted postMessage RPC, host re-derives amounts/addresses, host-rendered confirm) | Custom-UI | L | P1 |
| C12. Kaspa-native ZK primitives with real zkeys: timelock/ownership/depth-N merkle; pot_split + escrow gate payouts from public signals | ZK | L | P1 |
| C13. Live-preview split editor (CodeMirror left, sandboxed render right, same prod compile path) | Custom-UI+Sandbox | M | P1 |
| C14. Per-network sync alerting in monitor-and-alert.sh (behind_daa/stalled/last_ok_age); set WEBHOOK_URL | Infra | S | P1 |
| C15. Gate/label unimplemented GAME_TYPES (`implemented:false`); backend guard rejects join for unregistered specs | Games | S | P1 |

### PHASE D — On-Chain Enforcement & Decentralization (the headline)

| Item | Area | Effort | Pri |
|---|---|---|---|
| D1. **On-chain oracle-sig verification at Toccata**: P2SH redeem requires valid Schnorr over outcome msg; compute-payout returns a REAL spend tx | Oracle+Deploy+ZK | XL | P1 |
| D2. **No-code Game Designer** authoring UI + spec persistence/registry; server validates authored spec before stakes | Games | XL | P2 |
| D3. n-of-m independent oracle signers (real keys/hosts, multisig script path); replace forgeable multi-oracle; real liveness heartbeats | Oracle | L | P1 |
| D4. Key management: OracleSigner trait + HSM/KMS backend; key-epoch + rotation log; extend mainnet guard to require HSM | Oracle | L | P1 |
| D5. Generalize poker dealing into reusable hidden-info engine (`dealing.rs`); enables battleship/dominoes/gin | Games | XL | P1 |
| D6. kaspad under systemd (Restart=) + tip-liveness watchdog (≥10min stall window, alert-only first) | Infra | M | P0/P1 |
| D7. Cross-origin DSL authoring model (JSX-subset compiled to sandbox HTML; no eval) | Custom-UI | XL | P1 |
| D8. Add 6 built-in games as specs (go/backgammon/battleship/dominoes/gin/durak) | Games | L | P2 |
| D9. Versioning + quarantine for published pages (content-hash signed); sunset legacy raw HTML | Custom-UI | M | P2 |
| D10. Bounded self-healing reindex (gap repair, admin endpoint) replacing all-or-nothing FULL_RESCAN | Infra | M | P2 |

### PHASE E — Accountability & the Shrinking Oracle (long horizon)

| Item | Area | Effort | Pri |
|---|---|---|---|
| E1. Staking + slashing + hash-chained evidence trail; equivocation-only slashing first | Oracle | XL | P2 |
| E2. Optimistic resolution: post-outcome-with-proof + challenge window; oracle reduces to liveness/dispute; track per-covenant `reality` | Oracle | XL | P3 |
| E3. Real ceremony (published zkey hashes) + one real RISC0 receipt verifier (poker rank) + auto-generated honest registry labels | ZK | L | P2 |
| E4. Faithful silverc lowering (replace boilerplate emit) — gated on silverc gaining VerifyPayout/introspection | Sandbox/Deploy | XL | P3 |
| E5. Sandbox shareable URLs + saved snippets; template↔code↔config round-trip; theming presets (typography/radius/density) | Sandbox/Templates | M×3 | P2 |

---

## Top 10 Highest-Leverage Items

1. **A1 — Real BIP340 Schnorr oracle signature.** _(DONE)_ S-effort keystone; until it landed every "verified on-chain" claim was fiction and B1/D1/D3 were blocked.
2. **B3 — P2SH covenant constructor.** Converts deploy from self-pay-clone into actually locking funds to a script — the missing custody primitive every real covenant builds on. Zero oracle trust, expressible today.
3. **B8 — Server-side game rule engine.** Closes the one live fund-theft hole (client currently POSTs any `winner` over real KAS pots).
4. **A7 — Verifiers fail closed.** S-effort; today no circuit rejects a bad proof through the stack, so "strict/verifiable" is false. One honest path (merkle_membership) makes the pitch defensible.
5. **B6 — Mainnet reality-gating + honest badges.** Stops users locking real KAS into a "VERIFIED" covenant that enforces nothing during the Toccata window.
6. **B7 — GameSpec schema.** The keystone all game work is downstream of; the payout half already exists in CompileUnit.
7. **A3 + B2 — Escape now, cross-origin sandbox next.** A3 _(DONE)_ killed live stored XSS; B2 makes origin isolation structural instead of one careless `allow-same-origin` from full wallet takeover.
8. **C3 — Forward-tailing crawler.** Fixes the root indexing defect (downward-trending watermark that never tails forward) that made TN10 "stop growing."
9. **C6 — Covenant execution simulator.** The core studio differentiator vs a text box: try a spend, see which `require()` fails, before risking KAS.
10. **D1 — On-chain oracle-sig verification.** The headline of covenant activation: moves trust from "oracle is honest about payout" to "the chain enforced that the disclosed oracle signed this." Sits atop A1+B1+B3.

---

## Per-Domain Specifics

### ZK circuits — what's real, what to add
- **Real today:** only `merkle_membership` and `range_proof` have a final zkey and can generate a fresh proof. ~200 other registry entries are vkey + one prebaked proof (no zkey). The two "real" verifiers soft-pass on crypto failure, so nothing rejects a bad proof end-to-end.
- **Fix first (A7/A8):** make verifiers fail closed; fix `relative_timelock.circom` (its `valid` is a free public input → timelock bypass); fix the `verify_proof_for_circuit` None arm to reject.
- **Promote ~6 Kaspa-essential circuits to sound + ceremony-backed** (not 200): `timelock_absolute`, `relative_timelock`, depth-N `merkle_membership`, real UTXO-ownership (in-circuit key proof, or rename to "utxo commitment opening"), `pot_split_math`, `escrow_2party` — and derive outcome from public signals instead of `requested_outcome`.
- **Add (tractable):** sealed-bid auction (commit-reveal max-of-N), `vesting_linear`, a skill-game solution verifier (sudoku), blackjack final-hand, real depth-20 Poseidon merkle + nullifier, commit-then-reveal VRF for dice/shuffle. Poker hand-rank → one real RISC0 receipt verifier.
- **Reality check:** Kaspa has no pairing precompile, so full on-chain Groth16 is **not** achievable at Toccata. The achievable guarantee is **on-chain Schnorr verification** that the disclosed oracle signed the outcome.

### Oracles — how they will work
- **Now (done):** single key, real BIP340 Schnorr over `covex-oracle:{id}:{outcome}:{ts}`, pubkey exposed, payout enforces the sig.
- **Next:** bind each attestation to the covenant UTXO outpoint + a one-time nonce + expiry; persist consumed nonces (reuse the mixer-nullifier table) so outcomes can't be replayed (B1).
- **Decentralize:** n-of-m independent signer processes/keys with a Kaspa multisig script path (replaces today's forgeable "multi-oracle" where the caller supplies both providers and signatures). FROST/threshold-Schnorr is a later optimization, not a launch dependency (D3).
- **Harden:** HSM/KMS-backed `OracleSigner` trait, key epochs + signed rotation log; extend the mainnet guard to require an HSM backend before real KAS flows (D4).
- **Randomness:** real ECVRF or drand beacon, round/block bound into the seed; poker mixes both players' entropy so the operator can't grind the deck (B10→C7).
- **Long term:** staking + equivocation slashing (E1); optimistic resolution with a challenge window so the oracle shrinks to a liveness/dispute helper (E2).

### SilverScript sandbox — full in-browser IDE
- **Now:** three disconnected compile surfaces, all plain `<textarea>`; the paid editor never calls `/api/compile` (deploys text-hexed raw source); the free editor fabricates random hex on compile failure; two incompatible dialects (`contract{}` shown vs `Covenant{}` parsed).
- **Build:** one shared CodeMirror 6 `SilverEditor` with a SilverScript language mode (C1) → wire live compile + kill fake-bytecode + pick one dialect (C2) → enrich `/api/compile` with AST + opcode disassembly + line/col diagnostics (C5) → **covenant execution simulator** that applies a spend and traces each `require()`/opcode to PASS/FAIL (C6) → shareable `/sandbox` URLs + snippets (E5).

### Code terminal for ultra-custom UI
- **Now:** the Puck path is genuinely safe; the raw-HTML iframe path interpolates unescaped creator fields (stored XSS — partially mitigated by A3 escaping, but the structural fix is pending). The wallet bridge (`postMessage COVENANT_EXECUTE`) has no parent listener — it's dead code.
- **Build:** cross-origin cookieless sandbox renderer (B2) → typed allowlisted postMessage RPC where the **host** re-derives amounts/addresses and renders the confirm modal (C11) → a constrained JSX-subset DSL compiled to sandbox HTML (no `eval`) as the power-user tier above Puck (D7) → live-preview split editor (C13) → versioning + quarantine kill-switch (D9).

### More UI templates
- **Now:** "240 presets" are really ~16 palettes (the `layout`/`mood` fields are dead metadata); 12 logic-only templates carry no page design; 3 competing template surfaces; word-icons render as literal text; marketplace publish has no ownership check.
- **Build:** wire `layout`/`mood` to actually change structure + density (C8) → covenant-aware **live** Puck blocks (countdown, on-chain stat, QR, payout table, oracle badge, leaderboard, sparkline) (C9) → couple each template to a full designed page + expand to 30+ across vesting/vault/auction/airdrop/DAO, consolidate the 3 surfaces and 2 render engines into one, add real visual thumbnails (C10) → typography/radius/density theming presets (E5).

### Games — design any game, deploy any game
- **Now:** 8 real multiplayer games, but rules live as imperative JS in 8 near-duplicate 300-500 line components; the server trusts the client for `winner` (fund-theft hole); ~42 of ~50 listed games deploy to a dead end; poker's commit-reveal dealing is excellent but locked inside `poker.rs`.
- **Build:** **GameSpec schema** (B7) → **server-side rule engine** that validates moves + detects wins (B8) → data-driven `<GameBoard>` + one `FullScreenGame` shell (delete ~2500 lines) (C4) → generalize poker dealing into a reusable hidden-info engine (D5) → add go/backgammon/battleship/dominoes/gin/durak as specs (D8) → **no-code Game Designer** that authors + validates + deploys new skill-game covenants without code (D2). Interim: label unimplemented games `implemented:false` (C15/A12).

### Covenants — deploy any covenant, enforced
- **Now:** every deploy path builds the **same** transaction — a self-payment with an inert `aa20` payload. Nothing locks to a script; the "covenant" is metadata. The classifier recognizes P2SH/HTLC/vesting/multisig but the signer builds none.
- **Build:** **P2SH constructor** (B3) → typed covenant registry with `enforcement_reality` (B4) → native script builders for timelock/HTLC/multisig — 0→4 real trustless types covering ~6 categories (B5) → mainnet reality-gating (B6) → unify the 3 deploy UIs onto one typed pipeline → on-chain oracle-sig-gated release for the games/prediction bucket (D1).

### Every button works + highest-tier visuals
- **Strong already:** Explorer, Stats, Treasury, AddressPortfolio, HostCovenant validation, route-level code splitting, light theme, reduced-motion ticker guard, no em-dashes.
- **Fix:** OFFER DRAW no-op alerts; fabricated oracle signatures (A4); simulate-payment + "would call real covenant logic" alerts (A6); Deploy paywall bypass (A5 **done**); Dashboard forced-FREE tier; delete 5 dead unrouted pages; elevate Analytics to Stats-level; surface real pages in the top nav; broaden reduced-motion coverage (A12, C-phase).

### Infrastructure + indexing reliability (the TN10 root cause)
- **Now:** the crawler walks **backward** from tip each cycle and drives its watermark **down** toward genesis — there is no forward tail, so a network can silently "stop growing." On a `get_block` timeout it still corrupts the watermark. The mainnet crawler walks up to 5M blocks/cycle to index nothing. No frozen-tip detection; kaspad runs under bare `nohup` with no restart; the alert script never checks node sync.
- **Build:** mainnet short-circuit (A9) + don't-corrupt-watermark-on-timeout (A10) → forward-tailing rewrite with `forward_daa` + `backfill_floor` (C3) → frozen-tip detection in node_status (B9) → per-network sync alerting + WEBHOOK_URL (C14) → kaspad under systemd + tip-liveness watchdog (D6) → bounded self-healing reindex (D10).

---

## Cross-Cutting Risks

- **R1 — Mainnet timing (Toccata, June 2026) with real KAS.** Three funds-at-risk bugs existed: fake-hex/raw-text deploy (no real lock), unconditional `success:true` payout _(fixed A2)_, client-trusted game winner. Land Phase A + B6 before any non-script type can deploy on mainnet.
- **R2 — "ZK costume" credibility/legal exposure.** Soft-pass verifiers + `requested_outcome`-wins + a "ZK verified" badge for any non-none circuit makes a trusted oracle look trustless. Fix with A7 + honest reality labels; promote ~6 sound circuits rather than marketing 200.
- **R3 — Single key signing real payouts.** One hot key, hardcoded testnet key in source, only an env-guard protects mainnet. Need D4 (HSM + rotation) before value flows; ship plain m-of-n multisig first.
- **R4 — External toolchain ceilings.** silverc v0.1.0 can't express recipients/timelocks/hashlocks; Kaspa has no pairing precompile. Route real enforcement through **native script builders**, not silverc; target on-chain **Schnorr** verification.
- **R5 — Determinism across engine/oracle/renderer.** The oracle must re-run the exact engine the match used; any nondeterminism (float, HashMap order in `evaluate5`) breaks settlement. Byte-deterministic, version-pinned engine; fixed library of composable rule primitives (no Turing-complete user code).
- **R6 — Breaking-change & migration churn.** Version the oracle endpoint; add `forward_daa`/`backfill_floor` as new columns (never reuse in place); grandfather legacy custom pages behind the sandbox with auto-expire; migrate games game-by-game behind a flag.
- **R7 — Self-healing that fights live ops.** kaspad `Restart=always` + watchdog can crash-loop a legitimate multi-hour IBD. Watchdog ships alert-only/disabled-first, ≥10-min no-tip window, distinguishes "IBD progressing" from "frozen."
- **R8 — Live-compile / sandbox DoS.** silverc forks per request with no timeout; debounce + source-hash cache + process timeout; sequence the dialect decision before the editor swap; coordinate the cross-origin sandbox with nginx config.

---

_Key file anchors: oracle sig — `backend/src/oracle.rs`, `backend/src/main.rs`, `backend/src/kaspa_msg.rs`; P2SH custody — `backend/src/signer.rs`, `backend/src/covenant_types.rs`; game engine/spec — `backend/src/game_engine.rs` (new), `backend/src/game_spec.rs` (new), `backend/src/games.rs`; fail-closed verifiers — `zk/verify.js`, `zk/verify_range.js`, `zk/lib/verify_groth16_hybrid.js`, `backend/src/oracle_verifier.rs`; crawler watermark — `backend/src/crawler.rs`, `backend/src/db.rs`._
